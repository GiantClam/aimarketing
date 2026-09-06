import { createServer } from "node:http";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const desktopRoot = join(repoRoot, "apps", "desktop");
const fixture = join(desktopRoot, "test", "fixtures", "fake-opencode-serve.mjs");
const runsPerType = Math.max(1, Math.min(12, Number.parseInt(process.env.COWORKANY_STRESS_RUNS_PER_TYPE ?? "4", 10) || 4));
const artifactRoot = resolve(process.env.COWORKANY_STRESS_ARTIFACT_DIR ?? join(repoRoot, ".artifacts", `desktop-workflow-stress-${Date.now()}`));

function frame(value) {
  const body = Buffer.from(JSON.stringify(value), "utf8");
  return Buffer.concat([Buffer.from(`${body.byteLength}:`, "ascii"), body, Buffer.from("\n", "ascii")]);
}

function serviceResponse(child, current) {
  if (current.type !== "service_request" || typeof current.requestId !== "string") return;
  const payload = current.payload && typeof current.payload === "object" ? current.payload : {};
  const data = current.method === "workflow.artifact.register"
    ? { artifactId: `${String(payload.runId ?? "run")}:${String(payload.relativePath ?? "artifact")}` }
    : current.method === "runtime.artifact.write"
      ? { relativePath: String(payload.relativePath ?? "artifact.txt"), mimeType: String(payload.mimeType ?? "text/plain"), byteLength: Buffer.byteLength(String(payload.content ?? ""), "utf8"), sha256: "stress-sha256" }
      : { runId: payload.runId, sequence: payload.sequence, status: payload.status };
  child.stdin.write(frame({ version: 1, requestId: current.requestId, type: "service_response", ok: true, data }));
}

function startHost(workspace) {
  const tsxCli = join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const child = spawn(process.execPath, [tsxCli, join(desktopRoot, "runtime", "host.ts")], {
    cwd: desktopRoot,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, COWORKANY_OPENCODE_PATH: fixture, OPENCODE_RUNTIME_DIR: workspace },
  });
  const frames = [];
  const errors = [];
  let buffer = Buffer.alloc(0);
  child.stderr.on("data", (chunk) => errors.push(chunk.toString("utf8")));
  child.stdout.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const separator = buffer.indexOf(58);
      if (separator < 1) return;
      const size = Number.parseInt(buffer.subarray(0, separator).toString("ascii"), 10);
      const end = separator + 1 + size;
      if (!Number.isFinite(size) || end > buffer.length) return;
      const current = JSON.parse(buffer.subarray(separator + 1, end).toString("utf8"));
      buffer = buffer.subarray(end);
      frames.push(current);
      serviceResponse(child, current);
    }
  });
  return { child, frames, errors };
}

function node(nodeKey, type, config = {}, positionX = 0, positionY = 0) {
  return { nodeKey, type, nodeVersion: 1, title: type, positionX, positionY, config };
}

function workflowFor(type, provider) {
  const executor = type === "text" ? "llm_generate" : type === "audio" ? "audio_generate" : type === "video" ? "video_generate" : "digital_human";
  const outputPort = type === "text" ? "text" : type === "audio" ? "audio" : "video";
  const outputTarget = type === "text" ? "text" : type === "audio" ? "audios" : "videos";
  const config = type === "text"
    ? { model: "fixture-text", baseUrl: provider.baseUrl, endpoint: "/chat/completions", selectedProviderId: "configured", selectedModelId: "configured/model" }
    : { provider: provider.id, model: provider.model, baseUrl: provider.baseUrl, endpoint: type === "audio" ? "/audio/generations" : "/videos/generations", ...(type === "digital_human" ? { avatarImageUrl: "http://127.0.0.1/avatar.png", script: "A short digital human validation script" } : {}) };
  return {
    schemaVersion: 2, revision: 1, definitionHash: "",
    nodes: [
      node("input", "text_input", { text: `stress-${type}` }),
      node(type, executor, config, 1, type === "audio" ? 1 : 0),
      node("output", "output", {}, 2),
    ],
    edges: [
      { edgeKey: `input-${type}`, sourceNodeKey: "input", sourcePortId: "text", targetNodeKey: type, targetPortId: "text" },
      { edgeKey: `${type}-output`, sourceNodeKey: type, sourcePortId: outputPort, targetNodeKey: "output", targetPortId: outputTarget },
    ],
  };
}

function abnormalWorkflow(kind, provider) {
  if (kind === "missing-provider") return {
    schemaVersion: 2, revision: 1, definitionHash: "",
    nodes: [node("image", "image_generate", { provider: "missing-provider", model: "missing-model", endpoint: "/images/generations" })], edges: [],
  };
  const workflow = workflowFor("audio", provider);
  const nodeConfig = workflow.nodes.find((entry) => entry.nodeKey === "audio").config;
  if (kind === "permanent-failure") nodeConfig.prompt = "permanent";
  return workflow;
}

function collectTerminalEvents(host, runIds, timeoutMs = 90_000) {
  return new Promise((resolveResult, reject) => {
    const deadline = setTimeout(() => reject(new Error(`stress_timeout:${runIds.filter((id) => !terminals.has(id)).join(",")}`)), timeoutMs);
    const terminals = new Map();
    const inspect = () => {
      for (const current of host.frames) {
        const event = current?.data?.event;
        if (!event || !runIds.includes(event.runId) || !["done", "runtime_error"].includes(event.event)) continue;
        if (!terminals.has(event.runId)) terminals.set(event.runId, event);
      }
      if (terminals.size === runIds.length) {
        clearTimeout(deadline);
        resolveResult(terminals);
      }
    };
    const interval = setInterval(inspect, 20);
    setTimeout(() => { clearInterval(interval); }, timeoutMs + 50);
    inspect();
  });
}

const attempts = new Map();
const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method === "POST" && url.pathname.endsWith("/chat/completions")) {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ model: "fixture-text", choices: [{ message: { content: "stress text ok" } }], usage: { prompt_tokens: 1, completion_tokens: 2 } }));
    return;
  }
  if (request.method === "GET" && ["/result.mp3", "/result.mp4", "/result.png", "/avatar.png"].includes(url.pathname)) {
    const contentType = url.pathname.endsWith(".mp3") ? "audio/mpeg" : url.pathname.endsWith(".mp4") ? "video/mp4" : "image/png";
    response.writeHead(200, { "content-type": contentType });
    response.end(Buffer.from("stress-media", "utf8"));
    return;
  }
  if (request.method !== "POST" || !/\/(?:audio|videos?|images)\/generations$/u.test(url.pathname)) {
    response.writeHead(404); response.end(); return;
  }
  let body = "";
  for await (const chunk of request) body += chunk;
  let payload = {};
  try { payload = JSON.parse(body); } catch { /* host will surface invalid provider JSON */ }
  const key = String(payload.idempotency_key ?? `${url.pathname}:${Date.now()}`);
  const count = (attempts.get(key) ?? 0) + 1;
  attempts.set(key, count);
  if (String(payload.prompt ?? "").includes("permanent") || key.includes("permanent")) {
    response.writeHead(503, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { message: "forced permanent failure" } }));
    return;
  }
  if (count <= 2) {
    response.writeHead(503, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { message: "forced transient failure" } }));
    return;
  }
  const output = url.pathname.includes("audio") ? "/result.mp3" : url.pathname.includes("video") ? "/result.mp4" : "/result.png";
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ id: `stress-${key.slice(-12)}`, data: [{ url: `http://127.0.0.1:${server.address().port}${output}` }] }));
});

await mkdir(artifactRoot, { recursive: true });
await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const port = server.address().port;
const workspace = await mkdtemp(join(repoRoot, ".artifacts", "desktop-workflow-stress-workspace-"));
const provider = { id: "fixture", source: "openai-compatible", baseUrl: `http://127.0.0.1:${port}`, apiKey: "fixture-key", model: "fixture-media" };
const host = startHost(workspace);
const providerPayload = { id: "configured", model: "configured/model" };
const providers = { fixture: provider };
const runDefinitions = [];
for (const type of ["text", "audio", "video", "digital_human"]) {
  for (let index = 0; index < runsPerType; index += 1) runDefinitions.push({ id: `stress-${type}-${index}-${randomUUID()}`, type, definition: workflowFor(type, provider) });
}
const abnormal = [
  { id: `recoverable-${randomUUID()}`, kind: "recoverable", definition: workflowFor("audio", provider) },
  { id: `permanent-${randomUUID()}`, kind: "permanent-failure", definition: abnormalWorkflow("permanent-failure", provider) },
  { id: `missing-${randomUUID()}`, kind: "missing-provider", definition: abnormalWorkflow("missing-provider", provider) },
];
const startedAt = Date.now();
const allRuns = [...runDefinitions, ...abnormal];
for (const run of allRuns) {
  host.child.stdin.write(frame({ version: 1, requestId: randomUUID(), runId: run.id, type: "workflow.run", payload: {
    workspacePath: workspace, provider: providerPayload, media: run.kind === "missing-provider" ? { id: "missing-provider", source: "openai-compatible" } : provider, providers, definition: run.definition,
  } }));
}
let terminals;
try {
  terminals = await collectTerminalEvents(host, allRuns.map((run) => run.id));
} finally {
  if (process.platform === "win32" && host.child.pid) {
    try { execFileSync("taskkill", ["/PID", String(host.child.pid), "/T", "/F"], { stdio: "ignore" }); } catch { /* process may already be gone */ }
  }
  host.child.kill();
  await Promise.race([
    new Promise((resolveClose) => host.child.once("close", resolveClose)),
    new Promise((resolveClose) => setTimeout(resolveClose, 5000)),
  ]);
  server.closeAllConnections?.();
  await new Promise((resolveClose) => server.close(resolveClose));
  await rm(workspace, { recursive: true, force: true });
}

const resultFor = (run) => {
  const terminal = terminals.get(run.id);
  const message = String(terminal?.message ?? "");
  let detail = {};
  try { detail = JSON.parse(message); } catch { /* terminal message is not always JSON */ }
  return { id: run.id, type: run.type ?? run.kind, event: terminal?.event, ok: terminal?.event === "done", error: terminal?.event === "runtime_error" ? message.slice(0, 240) : undefined, attempts: [...attempts.entries()].filter(([key]) => key.includes(run.id)).reduce((sum, [, count]) => sum + count, 0), stage: detail.stage };
};
const results = allRuns.map(resultFor);
const normal = results.filter((result) => result.id.startsWith("stress-"));
const byType = Object.fromEntries(["text", "audio", "video", "digital_human"].map((type) => {
  const rows = normal.filter((result) => result.type === type);
  return [type, { total: rows.length, succeeded: rows.filter((row) => row.ok).length, failed: rows.filter((row) => !row.ok).length }];
}));
const report = {
  generatedAt: new Date().toISOString(),
  mode: "local-provider-load-and-retry",
  runsPerType,
  concurrency: allRuns.length,
  elapsedMs: Date.now() - startedAt,
  throughputRunsPerSecond: Number((allRuns.length / Math.max(0.001, (Date.now() - startedAt) / 1000)).toFixed(2)),
  byType,
  abnormal: results.filter((result) => !result.id.startsWith("stress-")),
  retryAttempts: Object.fromEntries(attempts),
  hostStderr: host.errors.join("").slice(-2000),
  results,
};
await writeFile(join(artifactRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
if (normal.some((result) => !result.ok) || !results.find((result) => result.type === "recoverable")?.ok || results.find((result) => result.type === "permanent-failure")?.ok || results.find((result) => result.type === "missing-provider")?.ok) process.exitCode = 1;
process.exit(process.exitCode ?? 0);
