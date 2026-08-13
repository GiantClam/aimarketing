import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import assert from "node:assert/strict";
import { mergeHybridCitations, searchVaultIndex } from "../runtime/rag";

test("desktop RAG searches a Vault manifest without SQLite or remote calls", async () => {
  const root = await mkdtemp(join(tmpdir(), "aimarketing-rag-")); const index = join(root, "index");
  try {
    await mkdir(index);
    await writeFile(join(index, "manifest.json"), JSON.stringify({ chunks: [{ id: "a", documentPath: "知识/营销.md", heading: "活动", text: "营销策略", hash: "a", tags: ["#增长"], links: ["campaign-brief"] }] }), "utf8");
    const textResults = await searchVaultIndex(index, "营销");
    const metadataResults = await searchVaultIndex(index, "增长 campaign-brief");
    assert.equal(textResults[0]?.documentPath, "知识/营销.md");
    assert.equal(metadataResults[0]?.excerpt, "营销策略");
  }
  finally { await rm(root, { recursive: true, force: true }); }
});

test("desktop RAG merges exact lexical hits with LanceDB nearest neighbours", () => {
  const results = mergeHybridCitations(
    [{ chunkId: "exact", documentPath: "营销/精确.md", excerpt: "exact", score: 2 }],
    [{ id: "semantic", documentPath: "品牌/语义.md", excerpt: "semantic", distance: 0.05 }],
    2,
  );
  assert.deepEqual(results.map((item) => item.chunkId), ["semantic", "exact"]);
  assert.ok(results.every((item) => item.score > 0));
});
