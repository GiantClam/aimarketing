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

test("remote embedding is opt-in, HTTPS-only, and records its configured model", async () => {
  const root = await mkdtemp(join(tmpdir(), "aimarketing-lancedb-remote-"));
  try {
    const manifest: VaultManifest = { schemaVersion: 1, vaultPath: join(root, "Vault"), generation: 1, documents: [{ documentPath: "note.md", hash: "hash" }], chunks: [{ id: "chunk-1", documentPath: "note.md", text: "remote embedding coverage", hash: "hash" }], updatedAt: new Date().toISOString() };
    let implicitRemoteCalls = 0;
    const localState = await buildLanceIndex(join(root, "local-index"), manifest, { baseUrl: "https://embeddings.example.test/v1", model: "text-embedding-test", apiKey: "test-secret", fetchImpl: async () => { implicitRemoteCalls += 1; throw new Error("must_not_send"); } });
    assert.equal(localState.status, "lexical_ready");
    assert.equal(implicitRemoteCalls, 0);
    const requests: Array<{ url: string; authorization: string | null; input: unknown }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      requests.push({ url: String(input), authorization: headers.get("authorization"), input: JSON.parse(String(init?.body)).input });
      return new Response(JSON.stringify({ data: [{ embedding: [0.25, 0.75] }] }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const state = await buildLanceIndex(join(root, "index"), manifest, { mode: "remote", baseUrl: "https://embeddings.example.test/v1", model: "text-embedding-test", apiKey: "test-secret", fetchImpl });
    assert.equal(state.status, "semantic_ready");
    assert.equal(state.embeddingModel, "remote/text-embedding-test");
    assert.equal(state.embeddingDimension, 2);
    assert.deepEqual(requests, [{ url: "https://embeddings.example.test/v1/embeddings", authorization: "Bearer test-secret", input: ["\nremote embedding coverage"] }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
