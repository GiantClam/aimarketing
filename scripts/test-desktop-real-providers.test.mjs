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

function runSmoke(configPath, port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [smokeScript, "--include-video"], {
      cwd: repoRoot,
      env: {
        ...process.env,
        AIMARKETING_REAL_PROVIDER_CONFIG: configPath,
        AIMARKETING_PROVIDER_TIMEOUT_MS: "5000",
        AIMARKETING_PROVIDER_VIDEO_POLLS: "2",
        AIMARKETING_PROVIDER_VIDEO_POLL_DELAY_MS: "0",
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
  const server = createServer((request, response) => {
    if (request.method === "POST" && request.url === "/v1/chat/completions") return json(response, { model: "chat", choices: [{ message: { content: "ok" } }], usage: {} });
    if (request.method === "POST" && request.url === "/v1/images/generations") return json(response, { data: [{ url: "http://127.0.0.1/image.png" }] });
    if (request.method === "POST" && request.url === "/v1/t2a_async_v2") return json(response, { task_id: 11 });
    if (request.method === "GET" && request.url?.startsWith("/v1/query/t2a_async_query_v2")) return json(response, { task_id: 11, status: "Success", base_resp: { status_code: 0 } });
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
    image: { provider: "fixture", baseUrl: `${rootUrl}/v1`, [credentialField]: fixtureCredential, model: "image" },
    providers: {
      text: profile("text", "openai-compatible", "chat", `${rootUrl}/v1`),
      image: profile("image", "openai-compatible", "image", `${rootUrl}/v1`),
      video: profile("video", "runninghub", "minimax-h3", rootUrl, { endpoint: "/video", queryEndpoint: "/query" }),
      audio: profile("audio", "minimax", "speech-2.8-turbo", `${rootUrl}/v1`),
    },
    defaults: { text: "text", image: "image", video: "video", audio: "audio" },
  }), "utf8");
  try {
    const result = await runSmoke(configPath, port);
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.scope, { executed: ["llm", "image", "audio", "video"], excluded: ["seedance"] });
    const video = report.results.find((item) => item.label === "video");
    assert.deepEqual(video, { label: "video", status: 200, ok: true, schemaOk: true, attempts: 1, profileId: "video", providerStatus: "SUCCESS", responseKeys: ["data"] });
    assert.equal(result.stdout.includes(fixtureCredential), false);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
    server.close();
    await once(server, "close").catch(() => undefined);
  }
});
