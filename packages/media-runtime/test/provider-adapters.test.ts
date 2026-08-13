import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createBailianImageAdapter, createBailianVideoAdapter, createMiniMaxAudioAdapter, createMiniMaxVideoAdapter, createOpenAICompatibleImageAdapter, createRunningHubAdapter, type MediaProviderId } from "../src/index";

function cancellation() { return { throwIfCancelled() {} }; }

test("OpenAI-compatible image adapter sends a local image generation request", async () => {
  let request: { url: string; init?: RequestInit } | undefined;
  const adapter = createOpenAICompatibleImageAdapter({ provider: "pptoken" as MediaProviderId, baseUrl: "https://api.example.test/v1", apiKey: "secret", fetchImpl: async (input, init) => {
    request = { url: String(input), init };
    return new Response(JSON.stringify({ data: [{ b64_json: "AQID" }], usage: { input_tokens: 4, output_tokens: 6, cost_usd: 0.12 } }), { status: 200 });
  } });
  const task = await adapter.execute({ provider: "pptoken" as MediaProviderId, modelId: "gpt-image-2", input: { prompt: "a paper airplane", size: "1024x1024" }, idempotencyKey: "run:image:1" }, cancellation());
  assert.equal(task.status, "succeeded");
  assert.equal(task.outputs[0]?.b64_json, "AQID");
  assert.deepEqual(task.usage, { inputTokens: 4, outputTokens: 6, providerCost: 0.12 });
  assert.equal(request?.url, "https://api.example.test/v1/images/generations");
  const body = JSON.parse(String(request?.init?.body)) as Record<string, unknown>;
  assert.deepEqual(body, { model: "gpt-image-2", prompt: "a paper airplane", size: "1024x1024", n: 1, user: "run:image:1" });
});

test("Bailian image adapter submits and polls DashScope task results", async () => {
  const calls: string[] = [];
  const adapter = createBailianImageAdapter({ provider: "bailian" as MediaProviderId, baseUrl: "https://dashscope.aliyuncs.com", apiKey: "secret", fetchImpl: async (input, init) => {
    calls.push(String(input));
    return new Response(JSON.stringify(calls.length === 1 ? { output: { task_id: "image-task-1", task_status: "PENDING" } } : { output: { task_id: "image-task-1", task_status: "SUCCEEDED", results: [{ url: "https://files.invalid/image.png" }] } }), { status: 200 });
  } });
  const first = await adapter.execute({ provider: "bailian" as MediaProviderId, modelId: "wanx2.1-t2i-turbo", input: { prompt: "a blue kite", size: "1024*1024" }, idempotencyKey: "run:image:2" }, cancellation());
  const second = await adapter.query!(first.providerTaskId, cancellation());
  assert.equal(first.status, "queued");
  assert.equal(second.status, "succeeded");
  assert.equal(second.outputs[0]?.url, "https://files.invalid/image.png");
  assert.match(calls[0], /text2image\/image-synthesis$/);
});

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

test("MiniMax voice-clone capability calls the clone endpoint and preserves the preview", async () => {
  let request: { url: string; init?: RequestInit } | undefined;
  const adapter = createMiniMaxAudioAdapter({ provider: "minimax" as MediaProviderId, baseUrl: "https://api.minimax.io/v1", apiKey: "secret", fetchImpl: async (input, init) => {
    request = { url: String(input), init };
    return new Response(JSON.stringify({ demo_audio: "https://files.invalid/voice-preview.mp3", extra_info: { voice_id: "voice-1" } }), { status: 200 });
  } });
  const task = await adapter.execute({ provider: "minimax" as MediaProviderId, modelId: "speech-2.8-turbo", input: { featureId: "voice-clone", sourceFileId: "42", voiceId: "voice-1", previewText: "你好" } }, cancellation());
  assert.equal(task.status, "succeeded");
  assert.equal(task.outputs[0]?.url, "https://files.invalid/voice-preview.mp3");
  assert.equal(request?.url, "https://api.minimax.io/v1/voice_clone");
  const body = JSON.parse(String(request?.init?.body)) as Record<string, unknown>;
  assert.equal(body.file_id, 42);
  assert.equal(body.voice_id, "voice-1");
  assert.equal(body.text, "你好");
});

test("MiniMax voice-synthesis capability creates and polls an async speech task", async () => {
  let calls = 0;
  const adapter = createMiniMaxAudioAdapter({ provider: "minimax" as MediaProviderId, baseUrl: "https://api.minimax.io/v1", apiKey: "secret", fetchImpl: async (input) => {
    calls += 1;
    return new Response(JSON.stringify(calls === 1 ? { task_id: "speech-task-1", status: "Pending" } : { task_id: "speech-task-1", status: "Success", file_id: "99" }), { status: 200 });
  } });
  const first = await adapter.execute({ provider: "minimax" as MediaProviderId, modelId: "speech-2.8-hd", input: { featureId: "voice-synthesis", prompt: "Hello", voiceId: "English_Trustworth_Man" } }, cancellation());
  const second = await adapter.query!(first.providerTaskId, cancellation());
  assert.equal(first.status, "queued");
  assert.equal(second.status, "succeeded");
  assert.match(String(second.outputs[0]?.url), /files\/retrieve_content\?file_id=99/);
});

test("MiniMax voice clone uploads an in-workspace reference without base64 IPC", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "aimarketing-voice-clone-"));
  try {
    await writeFile(join(workspace, "reference.wav"), Buffer.from("RIFF-fixture"));
    const urls: string[] = [];
    const adapter = createMiniMaxAudioAdapter({ provider: "minimax" as MediaProviderId, baseUrl: "https://api.minimax.io/v1", apiKey: "secret", workspacePath: workspace, fetchImpl: async (input, init) => {
      urls.push(String(input));
      if (urls.length === 1) {
        assert.equal(init?.body instanceof FormData, true);
        const form = init?.body as FormData;
        assert.equal(form.get("purpose"), "voice_clone");
        const file = form.get("file");
        assert.equal(file instanceof Blob, true);
        assert.equal((file as File).name, "reference.wav");
        return new Response(JSON.stringify({ file: { file_id: 77 } }), { status: 200 });
      }
      return new Response(JSON.stringify({ demo_audio: "https://files.invalid/preview.mp3" }), { status: 200 });
    } });
    const task = await adapter.execute({ provider: "minimax" as MediaProviderId, modelId: "speech-2.8-turbo", input: { featureId: "voice-clone", localAttachments: ["reference.wav"], previewText: "Hello" } }, cancellation());
    assert.equal(task.status, "succeeded");
    assert.equal(task.outputs[0]?.url, "https://files.invalid/preview.mp3");
    assert.deepEqual(urls, ["https://api.minimax.io/v1/files/upload", "https://api.minimax.io/v1/voice_clone"]);
    await assert.rejects(
      adapter.execute({ provider: "minimax" as MediaProviderId, modelId: "speech-2.8-turbo", input: { featureId: "voice-clone", localAttachments: ["../outside.wav"] } }, cancellation()),
      /voice_clone_source_file_unsafe/,
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
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
