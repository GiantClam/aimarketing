import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { buildLanceIndex, searchLanceIndex } from "../runtime/lancedb";
import type { VaultManifest } from "../runtime/obsidian";

test("LanceDB semantic index persists, reopens and isolates a Vault", async () => {
  const root = await mkdtemp(join(tmpdir(), "aimarketing-lancedb-"));
  try {
    const indexPath = join(root, "Vault 中文 空格", "index");
    const manifest: VaultManifest = { schemaVersion: 1, vaultPath: join(root, "Vault 中文 空格"), generation: 3, documents: [{ documentPath: "营销/方案.md", hash: "hash" }], chunks: [{ id: "chunk-1", documentPath: "营销/方案.md", heading: "增长", text: "中文营销方案与品牌增长", hash: "hash" }], updatedAt: new Date().toISOString() };
    const state = await buildLanceIndex(indexPath, manifest);
    assert.ok(state.status === "semantic_ready" || state.status === "lexical_ready");
    assert.match(state.embeddingModel, /(?:ollama|local-hash)/u);
    assert.equal(state.embeddingDimension, 384);
    const hits = await searchLanceIndex(indexPath, "品牌增长", 3);
    assert.equal(hits[0]?.documentPath, "营销/方案.md");
    const reopenedState = JSON.parse(await readFile(join(indexPath, "index-state.json"), "utf8")) as { generation: number };
    assert.equal(reopenedState.generation, 3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
