import test from "node:test";
import assert from "node:assert/strict";
import { HybridKnowledgeRetriever, type KnowledgeChunk } from "../src/index";

const chunks: KnowledgeChunk[] = [
  { id: "a", documentPath: "项目/活动.md", heading: "春季活动", text: "本地营销工作台", hash: "a" },
  { id: "b", documentPath: "项目/品牌.md", heading: "品牌", text: "品牌定位与文案", hash: "b" },
];

test("lexical fallback returns bounded clickable citations", async () => {
  const results = await new HybridKnowledgeRetriever().retrieve(chunks, "营销", 1);
  assert.equal(results.length, 1); assert.equal(results[0].documentPath, "项目/活动.md"); assert.equal(results[0].heading, "春季活动");
});

test("hybrid retrieval merges vector and lexical scores", async () => {
  const results = await new HybridKnowledgeRetriever({ embedder: { dimensions: 2, embed: async () => [1, 0] }, store: { upsert: async () => undefined, search: async () => [{ chunkId: "b", score: 1 }] } }).retrieve(chunks, "营销", 2);
  assert.deepEqual(results.map((result) => result.chunkId), ["b", "a"]);
});
