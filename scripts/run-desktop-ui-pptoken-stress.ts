import { randomUUID, createHash } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Page } from "playwright";
import sharp from "sharp";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const desktopRoot = resolve(repoRoot, "apps/desktop");
const workspacePath = resolve(repoRoot, "artifacts", `desktop-ui-pptoken-stress-${new Date().toISOString().replace(/[:.]/gu, "-")}`);
const baseUrl = "https://api.pptoken.cc/v1";
const model = String(process.env.PPTOKEN_UI_STRESS_MODEL ?? "gpt-image-2-1k").trim() || "gpt-image-2-1k";
const apiKey = String(process.env.PPTOKEN_UI_STRESS_API_KEY ?? "").trim();
const requests = Math.max(1, Math.min(20, Number.parseInt(process.env.PPTOKEN_UI_STRESS_REQUESTS ?? "10", 10) || 10));
const webUrl = process.env.PPTOKEN_UI_STRESS_WEB_URL ?? "http://127.0.0.1:1420";
if (!apiKey) throw new Error("pptoken_ui_stress_api_key_missing");

type Frame = { version: 1; requestId: string; type?: string; ok?: boolean; data?: Record<string, unknown>; error?: Record<string, unknown>; runId?: string };
type StressResult = { iteration: number; ok: boolean; durationMs: number; runId?: string; artifactPath?: string; bytes?: number; sha256?: string; format?: string; width?: number; height?: number; error?: string };

function encodeFrame(value: Record<string, unknown>) {
  const body = JSON.stringify(value);
  return `${Buffer.byteLength(body, "utf8")}:${body}\n`;
}

function parseFrames(buffer: Buffer) {
  const frames: Frame[] = [];
  let remaining = buffer;
  while (true) {
    const separator = remaining.indexOf(0x3a);
    if (separator < 0) break;
    const length = Number.parseInt(remaining.subarray(0, separator).toString("ascii"), 10);
    if (!Number.isFinite(length)) throw new Error("workflow_host_frame_prefix_invalid");
    const start = separator + 1;
    if (remaining.byteLength < start + length + 1) break;
    const json = remaining.subarray(start, start + length).toString("utf8");
    const consumed = start + length;
    if (remaining[consumed] !== 0x0a) break;
    frames.push(JSON.parse(json) as Frame);
    remaining = remaining.subarray(consumed + 1);
  }
  return { frames, remaining };
}

async function startHost() {
  const tsxCli = resolve(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const child = spawn(process.execPath, [tsxCli, resolve(desktopRoot, "runtime", "host.ts")], { cwd: desktopRoot, env: { ...process.env }, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  let stdoutBuffer = Buffer.alloc(0);
  let stderr = "";
  const listeners = new Set<(frame: Frame) => void>();
  child.stdout.on("data", (chunk: Buffer) => {
    stdoutBuffer = Buffer.concat([stdoutBuffer as unknown as Uint8Array, chunk as unknown as Uint8Array]);
    const parsed = parseFrames(stdoutBuffer);
    stdoutBuffer = parsed.remaining;
    for (const frame of parsed.frames) for (const listener of listeners) listener(frame);
  });
  child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
  const send = (message: Record<string, unknown>) => child.stdin.write(encodeFrame(message));
  const waitFor = (predicate: (frame: Frame) => boolean, timeoutMs = 90_000) => new Promise<Frame>((resolvePromise, reject) => {
    const timer = setTimeout(() => { listeners.delete(listener); reject(new Error(`workflow_host_response_timeout:${stderr.slice(-300)}`)); }, timeoutMs);
    const listener = (frame: Frame) => { if (!predicate(frame)) return; clearTimeout(timer); listeners.delete(listener); resolvePromise(frame); };
    listeners.add(listener);
  });
  return { child, send, waitFor, listeners, getStderr: () => stderr };
}

async function startVite() {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const child = spawn(command, ["--filter", "@coworkany/desktop", "dev"], { cwd: repoRoot, env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true, shell: process.platform === "win32" });
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
  child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString("utf8"); });
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try { const response = await fetch(webUrl); if (response.ok) return { child, getOutput: () => output }; } catch { /* server is still starting */ }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  child.kill();
  throw new Error(`desktop_vite_start_timeout:${output.slice(-800)}`);
}

async function setupBridge(page: Page, host: Awaited<ReturnType<typeof startHost>>) {
  await page.exposeFunction("__desktopInvoke", async (command: string, args: Record<string, unknown> = {}) => {
    if (command === "health") return { status: "ok" };
    if (command === "initialize_local_state") return { integrity: true, interruptedRuns: 0 };
    if (command === "runtime_probe") return { ready: true, paths: {} };
    if (command === "read_config") return {
      schemaVersion: 1,
      locale: "zh",
      workspacePath,
      provider: { id: "image-main", source: "openai-compatible", model, baseUrl, apiKey },
      providers: { "image-main": { id: "image-main", source: "openai-compatible", model, models: [model], capabilities: ["image"], baseUrl, apiKey } },
      defaults: { image: "image-main" },
      runtime: { source: "system" },
    };
    if (command === "list_local_skill_catalog") return { schemaVersion: 1, skills: [] };
    if (command === "list_conversations" || command === "list_messages" || command === "list_runs" || command === "list_artifacts" || command === "list_workflows" || command === "list_recoverable_attempts") return [];
    if (command === "usage_summary") return { inputTokens: 0, outputTokens: 0, providerCost: 0, estimatedCost: 0 };
    if (command === "save_workflow") {
      const input = (args.input ?? {}) as Record<string, unknown>;
      return { id: String(input.id ?? `workflow-${randomUUID()}`), name: String(input.name ?? "Desktop stress workflow"), definition_json: String(input.definition_json ?? "{}"), updated_at: new Date().toISOString() };
    }
    if (command === "write_config" || command === "create_conversation" || command === "append_message" || command === "set_conversation_session" || command === "append_run_event" || command === "finish_run" || command === "record_usage" || command === "record_run_node" || command === "record_run_checkpoint" || command === "record_run_attempt" || command === "create_run") return {};
    if (command === "host_start") return { status: "ok" };
    if (command === "allocate_media_temp") return { relativePath: "artifacts/.tmp/" + String(args.runId ?? "run") + "/" + String(args.nodeKey ?? "image") };
    if (command === "register_artifact") {
      const relativePath = String(args.relativePath ?? "");
      const absolutePath = resolve(workspacePath, relativePath);
      const bytes = await readFile(absolutePath);
      const extension = relativePath.toLowerCase().split(".").pop() ?? "bin";
      const mimeType = extension === "png" ? "image/png" : extension === "jpg" || extension === "jpeg" ? "image/jpeg" : extension === "webp" ? "image/webp" : "application/octet-stream";
      return { relative_path: relativePath, mime_type: mimeType, byte_length: bytes.byteLength, sha256: createHash("sha256").update(bytes.toString("latin1"), "latin1").digest("hex") };
    }
    if (command === "host_send") {
      const message = args.message as Record<string, unknown>;
      host.send(message);
      return { accepted: true };
    }
    if (command === "read_artifact" || command === "open_artifact" || command === "open_artifact_default") return null;
    return {};
  });
  await page.context().addInitScript({ content: `(() => {
    const listeners = new Map();
    window.__desktopEmit = (event, payload) => { for (const handler of listeners.get(event) || []) handler(payload); };
    window.__TAURI__ = {
      core: { invoke: (command, args) => {
        const invoke = window.__desktopInvoke;
        return invoke ? invoke(command, args) : Promise.reject(new Error("desktop_invoke_bridge_unavailable"));
      } },
      event: { listen: async (event, handler) => { const set = listeners.get(event) || new Set(); set.add((payload) => handler({ payload })); listeners.set(event, set); return () => set.delete((payload) => handler({ payload })); } },
    };
  })();` });
  host.listeners.add((frame) => {
    if ((frame as unknown as Record<string, unknown>).type === "service_request") {
      const service = frame as unknown as { requestId: string; method: string; payload?: Record<string, unknown> };
      const payload = service.payload ?? {};
      const data = service.method === "workflow.repository.create" || service.method === "workflow.repository.update_status" || service.method === "workflow.event.append"
        ? { runId: String(payload.runId ?? "") }
        : service.method === "workflow.artifact.register"
          ? { artifactId: `${String(payload.runId ?? "")}:${String(payload.relativePath ?? "")}` }
          : service.method === "runtime.artifact.write"
            ? { relativePath: String(payload.relativePath ?? ""), byteLength: Buffer.byteLength(String(payload.content ?? ""), "utf8"), sha256: createHash("sha256").update(String(payload.content ?? ""), "utf8").digest("hex") }
            : {};
      host.send({ version: 1, requestId: service.requestId, type: "service_response", ok: true, data });
    }
    void page.evaluate(({ event, payload }) => (window as Window & { __desktopEmit?: (event: string, payload: unknown) => void }).__desktopEmit?.(event, payload), { event: "desktop://runtime-response", payload: { raw: encodeFrame(frame as unknown as Record<string, unknown>).trim() } }).catch(() => undefined);
  });
}

async function main() {
  await mkdir(workspacePath, { recursive: true });
  const vite = await startVite();
  const host = await startHost();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await setupBridge(page, host);
  const results: StressResult[] = [];
  try {
    await page.goto(`${webUrl}/dashboard/image-assistant`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.locator(".image-field-grid").waitFor({ state: "visible", timeout: 60_000 });
    console.log(JSON.stringify({ event: "bridge", state: await page.evaluate(() => ({ tauri: typeof (window as Window & { __TAURI__?: { core?: { invoke?: unknown } } }).__TAURI__, invoke: typeof (window as Window & { __TAURI__?: { core?: { invoke?: unknown } } }).__TAURI__?.core?.invoke, desktopInvoke: typeof (window as Window & { __desktopInvoke?: unknown }).__desktopInvoke })) }));
    await page.waitForFunction(() => document.body.innerText.includes("gpt-image-2"), undefined, { timeout: 60_000 }).catch(async (error) => {
      throw new Error(`desktop_ui_config_not_loaded:${error instanceof Error ? error.message : String(error)}:${(await page.locator("body").innerText()).slice(-1600)}`);
    });
    for (let iteration = 1; iteration <= requests; iteration += 1) {
      const startedAt = performance.now();
      const prompt = page.locator(".image-field-grid textarea").first();
      await prompt.fill(`桌面端端到端压力测试 ${iteration}：一只钴蓝色陶瓷杯置于浅灰色摄影棚台面，柔和自然阴影，居中构图，无文字、无 Logo、无水印。`);
      const generateButton = page.locator(".send-button");
      try {
        await generateButton.waitFor({ state: "visible", timeout: 60_000 });
        await page.waitForFunction(() => !(document.querySelector(".send-button") as HTMLButtonElement | null)?.disabled, undefined, { timeout: 60_000 });
      } catch (error) {
        throw new Error(`desktop_ui_generate_disabled:${error instanceof Error ? error.message : String(error)}:${(await page.locator("body").innerText()).slice(-1200)}`);
      }
      if (await generateButton.isDisabled()) {
        const diagnostics = await page.evaluate(() => ({
          url: location.href,
          button: (document.querySelector(".send-button") as HTMLButtonElement | null)?.disabled,
          body: document.body.innerText.slice(-1800),
          warning: document.querySelector(".media-provider-warning")?.textContent,
          model: document.querySelector(".image-field-grid")?.getAttribute("data-image-model-kind"),
        }));
        throw new Error(`desktop_ui_generate_disabled_after_wait:${JSON.stringify(diagnostics)}`);
      }
      const beforeRuns = new Set<string>();
      const runPromise = host.waitFor((frame) => {
        const event = frame.data?.event as Record<string, unknown> | undefined;
        const runId = typeof event?.runId === "string" ? event.runId : undefined;
        if (!runId) return false;
        const type = event?.event;
        return type === "done" || type === "runtime_error";
      }, 12 * 60 * 1000);
      await generateButton.click();
      let frame: Frame;
      try { frame = await runPromise; } catch (error) { results.push({ iteration, ok: false, durationMs: Math.round(performance.now() - startedAt), error: error instanceof Error ? error.message : String(error) }); continue; }
      const event = frame.data?.event as Record<string, unknown>;
      const runId = typeof event.runId === "string" ? event.runId : undefined;
      const eventType = event.event;
      const runDirectory = runId ? join(workspacePath, "artifacts", runId.replace(/[^a-zA-Z0-9_-]/gu, "_"), "capability") : "";
      const candidates = runId ? await stat(runDirectory).then(() => readFile(runDirectory).catch(() => undefined)).catch(() => undefined) : undefined;
      let artifactPath: string | undefined;
      let artifactMeta: Partial<StressResult> = {};
      if (runId && eventType === "done") {
        const { readdir } = await import("node:fs/promises");
        const findImage = async (directory: string): Promise<string | undefined> => {
          const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
          for (const entry of entries) { const next = join(directory, entry.name); if (entry.isDirectory()) { const found = await findImage(next); if (found) return found; } else if (/\.(png|jpe?g|webp|gif)$/iu.test(entry.name)) return next; }
          return undefined;
        };
        artifactPath = await findImage(join(workspacePath, "artifacts", runId.replace(/[^a-zA-Z0-9_-]/gu, "_")));
        if (artifactPath) {
          const bytes = await readFile(artifactPath);
          const metadata = await sharp(bytes, { failOn: "error" }).metadata();
          artifactMeta = { artifactPath: relative(repoRoot, artifactPath).replaceAll("\\", "/"), bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes.toString("latin1"), "latin1").digest("hex"), format: metadata.format, width: metadata.width, height: metadata.height };
        }
      }
      const ok = eventType === "done" && Boolean(artifactPath && artifactMeta.width && artifactMeta.height);
      const result = { iteration, ok, durationMs: Math.round(performance.now() - startedAt), runId, ...(artifactMeta.artifactPath ? artifactMeta : {}), ...(ok ? {} : { error: eventType === "runtime_error" ? String(event.message ?? "workflow_runtime_error") : "workflow_done_without_valid_image_artifact" }) };
      results.push(result);
      console.log(JSON.stringify({ event: "iteration", ...result }));
      if (iteration < requests) { await page.goto(`${webUrl}/dashboard/image-assistant`, { waitUntil: "domcontentloaded", timeout: 60_000 }); await page.locator(".image-field-grid").waitFor({ state: "visible", timeout: 60_000 }); }
    }
  } finally {
    await browser.close();
    host.child.kill();
    vite.child.kill();
  }
  const successful = results.filter((result) => result.ok);
  const summary = { baseUrl, model, requests, succeeded: successful.length, failed: results.length - successful.length, successRate: results.length ? successful.length / results.length : 0, averageDurationMs: successful.length ? Math.round(successful.reduce((total, result) => total + result.durationMs, 0) / successful.length) : null, results, workspacePath };
  const { writeFile } = await import("node:fs/promises");
  await writeFile(join(workspacePath, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ event: "complete", ...summary }));
  if (successful.length !== requests) process.exitCode = 1;
}

void main().catch((error) => { console.error(JSON.stringify({ event: "fatal", error: error instanceof Error ? error.message : String(error) })); process.exitCode = 1; });
