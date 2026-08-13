import test from "node:test";
import assert from "node:assert/strict";
import { createBailianVideoAdapter, createHttpMediaAdapter, downloadMediaOutputs, ProviderConfigurationRequiredError, type MediaProviderId } from "../src/index";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("http media adapter submits and polls without cloud business services", async () => {
  const calls: string[] = [];
  const adapter = createHttpMediaAdapter({
    provider: "test" as MediaProviderId,
    baseUrl: "https://provider.invalid",
    apiKey: "secret",
    submitPath: "/images",
    queryPath: (id) => `/images/${id}`,
    fetchImpl: async (url, init) => {
      calls.push(`${init?.method ?? "GET"} ${url}`);
      return new Response(JSON.stringify(calls.length === 1 ? { id: "task-1", status: "running" } : { id: "task-1", status: "succeeded", data: [{ url: "https://files.invalid/image.png" }] }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  const task = await adapter.execute({ provider: "test" as MediaProviderId, modelId: "image-model", input: { prompt: "hello" }, idempotencyKey: "run:node:1" }, { throwIfCancelled() {} });
  assert.equal(task.providerTaskId, "task-1");
  assert.equal(task.status, "running");
  const queried = await adapter.query!(task.providerTaskId, { throwIfCancelled() {} });
  assert.equal(queried.status, "succeeded");
  assert.deepEqual(calls.map((value) => value.split(" ")[0]), ["POST", "GET"]);
});

test("shared media adapters reject missing injected provider configuration before fetching", async () => {
  let requests = 0;
  const adapter = createHttpMediaAdapter({
    provider: "missing" as MediaProviderId,
    baseUrl: "",
    submitPath: "/images",
    fetchImpl: async () => { requests += 1; return new Response("{}", { status: 200 }); },
  });
  await assert.rejects(
    adapter.execute({ provider: "missing" as MediaProviderId, modelId: "image", input: {} }, { throwIfCancelled() {} }),
    (error: unknown) => error instanceof ProviderConfigurationRequiredError && error.code === "provider_configuration_required",
  );
  const direct = createBailianVideoAdapter({
    provider: "bailian" as MediaProviderId,
    baseUrl: "https://dashscope.aliyuncs.com",
    apiKey: "",
    fetchImpl: async () => { requests += 1; return new Response("{}", { status: 200 }); },
  });
  await assert.rejects(
    direct.execute({ provider: "bailian" as MediaProviderId, modelId: "video", input: { prompt: "test" } }, { throwIfCancelled() {} }),
    (error: unknown) => error instanceof ProviderConfigurationRequiredError && error.code === "provider_configuration_required",
  );
  assert.equal(requests, 0);
});

test("downloads media output to an atomic local artifact", async () => {
  const root = await mkdtemp(join(tmpdir(), "aimarketing-media-"));
  const result = await downloadMediaOutputs({ providerTaskId: "task-1", status: "succeeded", outputs: [{ url: "https://files.invalid/clip.mp4" }] }, root, {
    fetchImpl: async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "video/mp4" } }),
    filenamePrefix: "clip",
  });
  assert.equal(result.length, 1);
  assert.equal((await readFile(join(root, result[0].relativePath))).length, 3);
  assert.equal(result[0].contentType, "video/mp4");
});

test("rejects media output that exceeds the local artifact limit or MIME policy", async () => {
  const root = await mkdtemp(join(tmpdir(), "aimarketing-media-limit-"));
  await assert.rejects(
    downloadMediaOutputs({ providerTaskId: "task-limit", status: "succeeded", outputs: [{ url: "https://files.invalid/clip.mp4" }] }, root, {
      fetchImpl: async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "application/octet-stream", "content-length": "3" } }),
      maxBytes: 2,
      allowedContentTypes: ["video"],
    }),
    /media_download_(mime_rejected|too_large)/,
  );
});

test("streams chunked downloads and removes partial files on overflow", async () => {
  const root = await mkdtemp(join(tmpdir(), "aimarketing-media-stream-"));
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2]));
      controller.enqueue(new Uint8Array([3, 4]));
      controller.close();
    },
  });
  await assert.rejects(
    downloadMediaOutputs({ providerTaskId: "task-stream", status: "succeeded", outputs: [{ url: "https://files.invalid/clip.mp4" }] }, root, {
      fetchImpl: async () => new Response(body, { status: 200, headers: { "content-type": "video/mp4" } }),
      maxBytes: 3,
      allowedContentTypes: ["video"],
    }),
    /media_download_too_large/,
  );
  assert.deepEqual(await readdir(root), []);
});
