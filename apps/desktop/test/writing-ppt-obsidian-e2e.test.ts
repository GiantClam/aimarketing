import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { OpenCodeServeClient } from "../runtime/opencode-serve";
import { detectPresentationArtifacts } from "../runtime/presentation-artifacts";
import { indexObsidianVault, searchVault, writeObsidianNote } from "../runtime/obsidian";

test("local writing, PPT artifacts, Vault citations and conflict handling share one E2E flow", async () => {
  const root = await mkdtemp(join(tmpdir(), "coworkany-writing-ppt-rag-e2e-"));
  const runtimeDirectory = join(root, "runtime");
  const vault = join(root, "vault");
  const index = join(root, "index");
  const fixture = resolve(process.cwd(), "test/fixtures/fake-opencode-serve.mjs");
  const client = new OpenCodeServeClient(process.execPath, runtimeDirectory, [fixture]);
  try {
    const provider = { model: "configured/model" };
    const session = await client.createOrResumeSession(runtimeDirectory, undefined, provider, {});
    const events: Array<{ event: string; [key: string]: unknown }> = [];
    await client.prompt(session.sessionId, runtimeDirectory, "writer-ppt-run", "Create artifact", provider, (event) => events.push(event));
    assert.equal(events.some((event) => event.event === "text_delta" && event.delta === "Artifact created"), true);
    assert.equal(events.some((event) => event.event === "tool_event" && event.tool === "artifact:result"), true);
    assert.equal(events.some((event) => event.event === "usage" && event.inputTokens === 11 && event.outputTokens === 7), true);

    const note = await writeObsidianNote({ vaultPath: vault, content: "# 春季活动\n本地营销工作台内容与 PPT 产物已完成。" });
    const manifest = await indexObsidianVault(vault, index);
    assert.equal(JSON.parse(await readFile(join(index, "index-state.json"), "utf8")).status, "lexical_ready");
    const citations = searchVault(manifest, "营销");
    assert.equal(citations[0]?.chunk.documentPath, note.path);
    assert.equal(citations[0]?.chunk.heading, "春季活动");

    const pptxPath = join(root, "春季活动.pptx");
    const previewPath = join(root, "春季活动-preview.svg");
    await writeFile(pptxPath, new Uint8Array([1, 2, 3, 4]));
    await writeFile(previewPath, "<svg><text>春季活动</text></svg>", "utf8");
    const artifacts = await detectPresentationArtifacts(root, Date.now() - 1_000);
    assert.deepEqual(artifacts.map((artifact) => artifact.relativePath), ["春季活动-preview.svg", "春季活动.pptx"]);
    assert.equal(artifacts.every((artifact) => artifact.sha256.length === 64), true);

    const writes = await Promise.allSettled([
      writeObsidianNote({ vaultPath: vault, targetPath: note.path, content: "# 第一版", baseHash: note.hash }),
      writeObsidianNote({ vaultPath: vault, targetPath: note.path, content: "# 第二版", baseHash: note.hash }),
    ]);
    assert.equal(writes.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(writes.filter((result) => result.status === "rejected" && /obsidian_write_conflict/u.test(String(result.reason))).length, 1);
  } finally {
    await client.stop();
    await rm(root, { recursive: true, force: true });
  }
});
