import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import assert from "node:assert/strict";
import { mergeHybridCitations, searchVaultIndex } from "../runtime/rag";

test("desktop RAG searches a Vault manifest without SQLite or remote calls", async () => {
  const root = await mkdtemp(join(tmpdir(), "aimarketing-rag-")); const index = join(root, "index");
  try { await mkdir(index); await writeFile(join(index, "manifest.json"), JSON.stringify({ chunks: [{ id: "a", documentPath: "知识/营销.md", heading: "活动", text: "营销策略", hash: "a" }] }), "utf8"); const results = await searchVaultIndex(index, "营销"); assert.equal(results[0].documentPath, "知识/营销.md"); }
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
