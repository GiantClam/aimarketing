import test from "node:test";
import assert from "node:assert/strict";
import { createBailianVideoAdapter, createMiniMaxAudioAdapter, createMiniMaxVideoAdapter, createRunningHubAdapter, type MediaProviderId } from "../src/index";

function cancellation() { return { throwIfCancelled() {} }; }

test("Bailian video adapter sends direct DashScope async request and polls task", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const adapter = createBailianVideoAdapter({ provider: "bailian" as MediaProviderId, baseUrl: "https://dashscope.aliyuncs.com", apiKey: "secret", fetchImpl: async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify(calls.length === 1 ? { output: { task_id: "task-1", task_status: "PENDING" } } : { output: { task_id: "task-1", task_status: "SUCCEEDED", video_url: "https://files.invalid/video.mp4" } }), { status: 200 });
  } });
  const first = await adapter.execute({ provider: "bailian" as MediaProviderId, modelId: "wanx-video", input: { prompt: "中文广告", duration: 6 }, idempotencyKey: "run:node:1" }, cancellation());
  const second = await adapter.query!(first.providerTaskId, cancellation());
  assert.equal(first.status, "queued");
  assert.equal(second.status, "succeeded");
  assert.match(calls[0].url, /video-synthesis$/);
  assert.equal(new Headers(calls[0].init?.headers).get("X-DashScope-Async"), "enable");
  assert.equal((JSON.parse(String(calls[0].init?.body)) as { input: { prompt: string } }).input.prompt, "中文广告");
});

test("MiniMax video adapter maps file ids to direct local-download URLs", async () => {
  const adapter = createMiniMaxVideoAdapter({ provider: "minimax" as MediaProviderId, baseUrl: "https://api.minimax.io", apiKey: "secret", fetchImpl: async () => new Response(JSON.stringify({ task_id: "task-2", status: "Success", file_id: "file-2" }), { status: 200 }) });
  const task = await adapter.execute({ provider: "minimax" as MediaProviderId, modelId: "MiniMax-Hailuo-2.3", input: { prompt: "demo" } }, cancellation());
  assert.equal(task.status, "succeeded");
  assert.match(String(task.outputs[0]?.url), /files\/retrieve\?file_id=file-2/);
});

test("MiniMax music adapter keeps synchronous base64 output local", async () => {
  const adapter = createMiniMaxAudioAdapter({ provider: "minimax" as MediaProviderId, baseUrl: "https://api.minimax.io", apiKey: "secret", fetchImpl: async () => new Response(JSON.stringify({ data: { audio: "AQID" } }), { status: 200 }) });
  const task = await adapter.execute({ provider: "minimax" as MediaProviderId, modelId: "music-1", input: { kind: "music", prompt: "轻快" } }, cancellation());
  assert.equal(task.status, "succeeded");
  assert.equal(task.outputs[0]?.b64_json, "AQID");
});

test("RunningHub adapter submits and queries task results without SaaS transport", async () => {
  let call = 0;
  const adapter = createRunningHubAdapter({ provider: "runninghub" as MediaProviderId, baseUrl: "https://www.runninghub.cn", apiKey: "secret", submitPath: "/openapi/v2/rhart-video/demo", fetchImpl: async (_input, init) => {
    call += 1;
    return new Response(JSON.stringify(call === 1 ? { data: { taskId: "rh-1", status: "QUEUED" } } : { data: { taskId: "rh-1", status: "SUCCESS", results: [{ url: "https://files.invalid/rh.mp4" }] } }), { status: 200 });
  } });
  const submitted = await adapter.execute({ provider: "runninghub" as MediaProviderId, modelId: "seedance", input: { prompt: "demo" } }, cancellation());
  const finished = await adapter.query!(submitted.providerTaskId, cancellation());
  assert.equal(submitted.status, "queued");
  assert.equal(finished.status, "succeeded");
  assert.equal(finished.outputs[0]?.url, "https://files.invalid/rh.mp4");
});
