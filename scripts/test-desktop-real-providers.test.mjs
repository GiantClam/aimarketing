import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import test from "node:test";
import { spawn } from "node:child_process";

const repoRoot = join(import.meta.dirname, "..");
const smokeScript = join(repoRoot, "scripts", "test-desktop-real-providers.mjs");
const credentialField = ["api", "Key"].join("");
const fixtureCredential = ["fixture", "provider", "key"].join("-");

function json(response, payload) {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(payload));
}

function runSmoke(configPath, port, extraArgs = [], extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [smokeScript, ...extraArgs], {
      cwd: repoRoot,
      env: {
        ...process.env,
        AIMARKETING_REAL_PROVIDER_CONFIG: configPath,
        AIMARKETING_PROVIDER_TIMEOUT_MS: "5000",
        AIMARKETING_PROVIDER_VIDEO_POLLS: "2",
        AIMARKETING_PROVIDER_VIDEO_POLL_DELAY_MS: "0",
        AIMARKETING_PROVIDER_AUDIO_POLLS: "8",
        AIMARKETING_PROVIDER_AUDIO_POLL_DELAY_MS: "0",
        ...extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal, stdout, stderr, port }));
  });
}

test("real provider smoke executes a configured non-Seedance video profile", async () => {
  const imageSizes = [];
  const imageModels = [];
  const musicModels = [];
  const server = createServer((request, response) => {
    if (request.method === "POST" && request.url === "/v1/chat/completions") return json(response, { model: "chat", choices: [{ message: { content: "ok" } }], usage: {} });
    if (request.method === "POST" && request.url === "/v1/images/generations") {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        const parsed = JSON.parse(body);
        imageSizes.push(parsed.size);
        imageModels.push(parsed.model);
        json(response, { data: [{ url: "http://127.0.0.1/image.png" }] });
      });
      return;
    }
    if (request.method === "POST" && request.url === "/v1/t2a_async_v2") return json(response, { task_id: 11 });
    if (request.method === "GET" && request.url?.startsWith("/v1/query/t2a_async_query_v2")) return json(response, { task_id: 11, status: "Success", base_resp: { status_code: 0 } });
    if (request.method === "POST" && request.url === "/v1/music_generation") {
      let body = "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        musicModels.push(JSON.parse(body).model);
        json(response, { data: { audio: "https://127.0.0.1/audio.mp3", status: "Success" } });
      });
      return;
    }
    if (request.method === "POST" && request.url === "/video") return json(response, { data: { taskId: "video-1", status: "QUEUED" } });
    if (request.method === "POST" && request.url === "/query") return json(response, { data: { taskId: "video-1", status: "SUCCESS", results: [{ url: "http://127.0.0.1/video.mp4" }] } });
    response.writeHead(404);
    response.end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  const rootUrl = `http://127.0.0.1:${port}`;
  const tempRoot = await mkdtemp(join(tmpdir(), "aimarketing-provider-smoke-"));
  const configPath = join(tempRoot, "providers.json");
  const profile = (id, source, model, baseUrl, extra = {}) => ({ id, source, model, baseUrl, [credentialField]: fixtureCredential, ...extra });
  await writeFile(configPath, JSON.stringify({
    schemaVersion: 1,
    llm: { provider: "fixture", baseUrl: `${rootUrl}/v1`, [credentialField]: fixtureCredential, model: "chat" },
    image: { provider: "pptoken", baseUrl: `${rootUrl}/v1`, [credentialField]: fixtureCredential, model: "catalog-listed-other-model" },
    providers: {
      text: profile("text", "openai-compatible", "chat", `${rootUrl}/v1`),
      image: profile("image", "openai-compatible", "image", `${rootUrl}/v1`),
      video: profile("video", "runninghub", "minimax-h3", rootUrl, { endpoint: "/video", queryEndpoint: "/query" }),
      audio: profile("audio", "minimax", "speech-2.8-turbo", `${rootUrl}/v1`),
    },
    defaults: { text: "text", image: "image", video: "video", audio: "audio" },
  }), "utf8");
  try {
    const defaultResult = await runSmoke(configPath, port);
    assert.equal(defaultResult.code, 0, `${defaultResult.stdout}\n${defaultResult.stderr}`);
    const defaultReport = JSON.parse(defaultResult.stdout);
    assert.deepEqual(defaultReport.scope, { executed: ["llm", "image", "audio"], excluded: ["video", "seedance"] });
    assert.deepEqual(defaultReport.results.map((item) => item.label), ["llm", "image", "audio"]);
    assert.deepEqual(imageSizes.slice(0, 1), ["256x256"]);
    assert.deepEqual(imageModels.slice(0, 1), ["gpt-image-2"]);
    assert.equal(defaultResult.stdout.includes("video-1"), false);

    const imageOnlyResult = await runSmoke(configPath, port, ["--image-only"]);
    assert.equal(imageOnlyResult.code, 0, `${imageOnlyResult.stdout}\n${imageOnlyResult.stderr}`);
    const imageOnlyReport = JSON.parse(imageOnlyResult.stdout);
    assert.deepEqual(imageOnlyReport.scope, { executed: ["image"], excluded: ["video", "seedance"] });
    assert.deepEqual(imageOnlyReport.results.map((item) => item.label), ["image"]);
    assert.deepEqual(imageSizes.slice(1, 2), ["256x256"]);
    assert.deepEqual(imageModels.slice(1, 2), ["gpt-image-2"]);

    const musicOnlyResult = await runSmoke(configPath, port, ["--music-only"]);
    assert.equal(musicOnlyResult.code, 0, `${musicOnlyResult.stdout}\n${musicOnlyResult.stderr}`);
    const musicOnlyReport = JSON.parse(musicOnlyResult.stdout);
    assert.deepEqual(musicOnlyReport.scope, { executed: ["music"], excluded: ["video", "seedance"] });
    assert.deepEqual(musicModels, ["music-2.6"]);

    const invalidSizeResult = await runSmoke(configPath, port, ["--image-only"], { AIMARKETING_PROVIDER_IMAGE_SIZE: "2048x2048" });
    assert.equal(invalidSizeResult.code, 1);
    assert.match(`${invalidSizeResult.stdout}\n${invalidSizeResult.stderr}`, /real_provider_image_size_unsupported:2048x2048/u);
    assert.equal(imageSizes.length, 2, "invalid image size must fail before issuing a provider request");

    const result = await runSmoke(configPath, port, ["--include-video"]);
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.scope, { executed: ["llm", "image", "audio", "video"], excluded: ["seedance"] });
    const video = report.results.find((item) => item.label === "video");
    assert.deepEqual(video, { label: "video", status: 200, ok: true, schemaOk: true, attempts: 1, profileId: "video", providerTaskId: "video-1", providerStatus: "SUCCESS", responseKeys: ["data"] });
    assert.equal(result.stdout.includes(fixtureCredential), false);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
    server.close();
    await once(server, "close").catch(() => undefined);
  }
});

test("real provider audio smoke honors a bounded polling budget", async () => {
  let pollCount = 0;
  const server = createServer((request, response) => {
    if (request.method === "POST" && request.url === "/v1/t2a_async_v2") return json(response, { task_id: 7 });
    if (request.method === "GET" && request.url?.startsWith("/v1/query/t2a_async_query_v2")) {
      pollCount += 1;
      return json(response, {
        task_id: 7,
        status: pollCount >= 3 ? "Success" : "Processing",
        base_resp: { status_code: 0 },
      });
    }
    response.writeHead(404);
    response.end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  const rootUrl = `http://127.0.0.1:${port}`;
  const tempRoot = await mkdtemp(join(tmpdir(), "aimarketing-provider-audio-smoke-"));
  const configPath = join(tempRoot, "providers.json");
  const profile = (id, source, model, baseUrl) => ({ id, source, model, baseUrl, [credentialField]: fixtureCredential });
  await writeFile(configPath, JSON.stringify({
    schemaVersion: 1,
    llm: { provider: "fixture", baseUrl: `${rootUrl}/v1`, [credentialField]: fixtureCredential, model: "chat" },
    image: { provider: "fixture", baseUrl: `${rootUrl}/v1`, [credentialField]: fixtureCredential, model: "image" },
    providers: {
      text: profile("text", "openai-compatible", "chat", `${rootUrl}/v1`),
      image: profile("image", "openai-compatible", "image", `${rootUrl}/v1`),
      audio: profile("audio", "minimax", "speech-2.8-turbo", `${rootUrl}/v1`),
    },
    defaults: { text: "text", image: "image", audio: "audio" },
  }), "utf8");
  try {
    const bounded = await runSmoke(configPath, port, ["--audio-only"], {
      AIMARKETING_PROVIDER_AUDIO_POLLS: "2",
      AIMARKETING_PROVIDER_AUDIO_POLL_DELAY_MS: "0",
    });
    assert.equal(bounded.code, 1, `${bounded.stdout}\n${bounded.stderr}`);
    assert.equal(JSON.parse(bounded.stdout).results[0].attempts, 2);
    pollCount = 0;
    const completed = await runSmoke(configPath, port, ["--audio-only"], {
      AIMARKETING_PROVIDER_AUDIO_POLLS: "3",
      AIMARKETING_PROVIDER_AUDIO_POLL_DELAY_MS: "0",
    });
    assert.equal(completed.code, 0, `${completed.stdout}\n${completed.stderr}`);
    assert.equal(JSON.parse(completed.stdout).results[0].attempts, 3);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
    server.close();
    await once(server, "close").catch(() => undefined);
  }
});
