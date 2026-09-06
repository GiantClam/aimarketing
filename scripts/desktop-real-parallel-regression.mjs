import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const TERMINAL_EVENTS = new Set(["done", "runtime_error"]);
const DEFAULT_ROUNDS = 6;
const DEFAULT_COUNT = 2;
const DEFAULT_STRESS_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_IPC_TIMEOUT_MS = 120_000;
const DEFAULT_UI_TIMEOUT_MS = 60_000;
const PRESENTATION_AGENT_ID = "executive-presentation-ppt";

function parseArgs(argv) {
  const options = { count: DEFAULT_COUNT, rounds: DEFAULT_ROUNDS, stressTimeoutMs: DEFAULT_STRESS_TIMEOUT_MS, suites: ["ai", "ppt", "presentation", "workflow", "agent", "image", "assets", "ui"], cdpUrl: process.env.DESKTOP_CDP_URL ?? "http://127.0.0.1:9222", reportPath: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--suite") options.suites = String(argv[++index] ?? "").split(",").map((value) => value.trim()).filter(Boolean);
    else if (argument === "--count") options.count = Math.max(1, Number(argv[++index] ?? DEFAULT_COUNT));
    else if (argument === "--rounds") options.rounds = Math.max(6, Number(argv[++index] ?? DEFAULT_ROUNDS));
    else if (argument === "--timeout-ms") options.stressTimeoutMs = Math.max(60_000, Number(argv[++index] ?? DEFAULT_STRESS_TIMEOUT_MS));
    else if (argument === "--cdp-url") options.cdpUrl = String(argv[++index] ?? options.cdpUrl);
    else if (argument === "--report") options.reportPath = String(argv[++index] ?? "");
  }
  return options;
}

function nowStamp() {
  return new Date().toISOString().replace(/[-:.TZ]/gu, "").slice(0, 14);
}

function id(prefix, index) {
  return `desktop-regression-${prefix}-${nowStamp()}-${String(index + 1).padStart(2, "0")}`;
}

function safeProvider(provider) {
  if (!provider || typeof provider !== "object") return null;
  return { id: provider.id, model: provider.model, source: provider.source, baseUrl: provider.baseUrl, reasoningEffort: provider.reasoningEffort };
}

function parseRuntimeFrame(raw) {
  if (!raw || typeof raw !== "object" || typeof raw.raw !== "string") return null;
  const separator = raw.raw.indexOf(":");
  if (separator < 1) return null;
  const length = Number(raw.raw.slice(0, separator));
  const body = raw.raw.slice(separator + 1);
  if (!Number.isInteger(length) || Buffer.byteLength(body, "utf8") !== length) return null;
  try { return JSON.parse(body); } catch { return null; }
}

function isResponse(frame) {
  return Boolean(frame && typeof frame.requestId === "string" && typeof frame.ok === "boolean" && !(frame.data && typeof frame.data === "object" && frame.data.event));
}

function terminalEvent(frame, runId) {
  const event = frame?.data?.event;
  return Boolean(event && event.runId === runId && TERMINAL_EVENTS.has(event.event));
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function percentile(values, ratio) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function latencySummary(items) {
  const durations = items.map((item) => Number(item.durationMs)).filter(Number.isFinite);
  const response = items.map((item) => Number(item.responseMs)).filter(Number.isFinite);
  return {
    count: items.length,
    success: items.filter((item) => item.status === "succeeded").length,
    failed: items.filter((item) => item.status !== "succeeded").length,
    responseMs: { p50: percentile(response, 0.5), p95: percentile(response, 0.95), max: Math.max(...response, 0) },
    durationMs: { p50: percentile(durations, 0.5), p95: percentile(durations, 0.95), max: Math.max(...durations, 0) },
  };
}

class DesktopFrameCollector {
  constructor(page) {
    this.page = page;
    this.frames = [];
    this.waiters = new Set();
    this.running = true;
    this.listenerPromise = Promise.resolve();
    this.error = null;
  }

  async installListener() {
    this.listenerPromise = this.listenerPromise.then(async () => {
      await this.page.waitForFunction(() => Boolean(window.__TAURI__?.core?.invoke), undefined, { timeout: 60_000 });
      await this.page.evaluate(() => {
        window.__desktopParallelRegressionFrames = [];
        window.__desktopParallelRegressionDirectFrames = [];
        window.__desktopParallelRegressionDirectUnlisteners = {};
      });
    });
    await this.listenerPromise;
  }

  async start() {
    await this.installListener();
    this.pumpPromise = this.pump();
  }

  async pump() {
    try {
      while (this.running) {
      let rawFrames;
      try {
        rawFrames = await this.page.evaluate(() => {
          const frames = [
            ...(window.__desktopParallelRegressionFrames ?? []),
            ...(window.__desktopParallelRegressionDirectFrames ?? []),
          ];
          window.__desktopParallelRegressionFrames = [];
          window.__desktopParallelRegressionDirectFrames = [];
          return frames;
        });
      } catch (error) {
        if (/execution context was destroyed|target page|page has been closed|browser has been closed/i.test(String(error))) throw error;
        throw error;
      }
      for (const raw of rawFrames) {
        const frame = parseRuntimeFrame(raw);
        if (!frame) continue;
        this.frames.push(frame);
        for (const waiter of [...this.waiters]) {
          if (!waiter.predicate(frame)) continue;
          this.waiters.delete(waiter);
          clearTimeout(waiter.timer);
          waiter.resolve(frame);
        }
      }
      await sleep(50);
      }
    } catch (error) {
      this.error = error instanceof Error ? error : new Error(String(error));
      for (const waiter of [...this.waiters]) {
        this.waiters.delete(waiter);
        clearTimeout(waiter.timer);
        waiter.reject(this.error);
      }
    }
  }

  waitFor(predicate, timeoutMs) {
    if (this.error) return Promise.reject(this.error);
    const existing = this.frames.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject, timer: undefined };
      // Runtime completion is governed by OpenCode's provider/chunk timeout
      // settings and arrives as a terminal SSE event. The load-test caller
      // may add its own safety ceiling without changing the desktop runtime.
      if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
        waiter.timer = setTimeout(() => {
          this.waiters.delete(waiter);
          reject(new Error(`desktop_runtime_wait_timeout:${timeoutMs}`));
        }, timeoutMs);
      }
      this.waiters.add(waiter);
    });
  }

  framesFor(requestId, startAt) {
    return this.frames.slice(startAt).filter((frame) => frame.requestId === requestId);
  }

  async stop() {
    this.running = false;
    await this.pumpPromise?.catch(() => undefined);
    await this.page.evaluate(async () => {
      for (const unlisten of Object.values(window.__desktopParallelRegressionDirectUnlisteners ?? {})) await unlisten?.();
      delete window.__desktopParallelRegressionDirectUnlisteners;
      delete window.__desktopParallelRegressionDirectFrames;
      delete window.__desktopParallelRegressionFrames;
    }).catch(() => undefined);
  }
}

let sessionStartQueue = Promise.resolve();

function enqueueSessionStart(task) {
  const next = sessionStartQueue.then(task);
  sessionStartQueue = next.catch(() => undefined);
  return next;
}

async function invoke(page, command, args = {}, timeoutMs = DEFAULT_IPC_TIMEOUT_MS) {
  return Promise.race([
    page.evaluate(async ({ command: name, args: payload }) => window.__TAURI__.core.invoke(name, payload), { command, args }),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`desktop_ipc_timeout:${command}:${timeoutMs}`)), timeoutMs)),
  ]);
}

async function sendHost(page, collector, message, timeoutMs = DEFAULT_IPC_TIMEOUT_MS) {
  const startAt = collector.frames.length;
  const listenerKey = `${message.requestId}-${Math.random().toString(36).slice(2)}`;
  await page.evaluate(async ({ listenerKey }) => {
    window.__desktopParallelRegressionDirectUnlisteners ??= {};
    window.__desktopParallelRegressionDirectFrames ??= [];
    window.__desktopParallelRegressionDirectUnlisteners[listenerKey] = await window.__TAURI__.event.listen("desktop://runtime-response", (event) => {
      window.__desktopParallelRegressionDirectFrames.push(event.payload);
    });
  }, { listenerKey });
  await invoke(page, "host_send", { message });
  const response = await collector.waitFor((frame) => frame.requestId === message.requestId && isResponse(frame), timeoutMs);
  if (!response.ok) {
    await page.evaluate(({ listenerKey }) => window.__desktopParallelRegressionDirectUnlisteners?.[listenerKey]?.(), { listenerKey }).catch(() => undefined);
    throw new Error(`${response.error?.code ?? "runtime_request_failed"}:${response.error?.message ?? "unknown error"}`);
  }
  return {
    response,
    frames: () => collector.framesFor(message.requestId, startAt),
    dispose: () => page.evaluate(({ listenerKey }) => {
      const unlisten = window.__desktopParallelRegressionDirectUnlisteners?.[listenerKey];
      delete window.__desktopParallelRegressionDirectUnlisteners?.[listenerKey];
      return unlisten?.();
    }, { listenerKey }).catch(() => undefined),
  };
}

async function emergencyStop(page, runId) {
  await invoke(page, "host_send", { message: { version: 1, requestId: `${runId}:emergency-stop`, runId, type: "run.emergency_stop", payload: { runId } } }).catch(() => undefined);
}

async function appendMessage(page, input) {
  await invoke(page, "append_message", { input });
}

async function createConversation(page, conversationId, title, agentId) {
  return invoke(page, "create_conversation", { input: { id: conversationId, title, project_id: null, agent_id: agentId ?? null } });
}

function messageTime(sequence) {
  return new Date(Date.now() + sequence).toISOString();
}

async function startConversation(page, collector, options, index, agentId, allowArtifacts = false, kind = agentId ? "agent" : "ai", workspacePath = options.workspacePath, conversationId = id(kind, index)) {
  const titlePrefix = kind === "presentation" ? "Presentation" : agentId ? "Agent" : "AI";
  await createConversation(page, conversationId, `${titlePrefix} parallel regression ${index + 1}`, agentId);
  const requestId = `${conversationId}:session`;
  const payload = { conversationId, workspacePath, model: options.provider.model, provider: options.provider, allowArtifacts, ...(agentId ? { agentId } : {}) };
  const sent = await enqueueSessionStart(() => sendHost(page, collector, { version: 1, requestId, type: "session.create", payload }));
  await sent.dispose();
  const { response } = sent;
  const sessionId = String(response.data?.sessionId ?? "");
  if (!sessionId) throw new Error(`${conversationId}:session_id_missing`);
  await invoke(page, "set_conversation_session", { conversationId, sessionId });
  console.log(`[desktop-regression] session-ready kind=${kind} conversation=${conversationId}`);
  return { conversationId, sessionId, agentId, workspacePath };
}

function conversationPrompt(kind, round, index) {
  if (kind === "presentation") return `Desktop regression presentation ${index + 1}: use the executive-presentation-ppt Dashi workflow to create and export exactly one logical-slide PowerPoint PPTX presentation about a quarterly product launch. The final deliverable must include a valid .pptx file, not only an HTML preview, goal.json, outline, explanation, or tool-calls turn. Execute the full render, validation, and PPTX export flow in this session workspace, verify the exported PPTX exists and is readable, and only then reply.`;
  const subject = kind === "agent" ? "sales qualification" : "desktop parallel execution";
  return `Regression ${kind} conversation ${index + 1}, round ${round}/${DEFAULT_ROUNDS}. Reply briefly about ${subject}. Include one Markdown bullet and no tool/process narration.`;
}

async function runConversationTurn(page, collector, options, session, round, index, kind) {
  const runId = `${session.conversationId}:round-${round}`;
  const requestId = `${runId}:prompt`;
  const prompt = conversationPrompt(kind, round, index);
  const createdAt = messageTime(round * 2);
  const startedAt = Date.now();
  await invoke(page, "create_run", { runId, conversationId: session.conversationId, model: options.provider.model });
  await appendMessage(page, { id: `${runId}:user`, conversation_id: session.conversationId, role: "user", content: prompt, parts_json: JSON.stringify([{ type: "text", text: prompt }]), metadata_json: JSON.stringify({ regression: true, kind, round }), created_at: createdAt });
  let terminal;
  let error;
  try {
    console.log(`[desktop-regression] turn-start kind=${kind} conversation=${session.conversationId} round=${round}`);
    const allowArtifacts = kind === "presentation";
    const presentationSystemPrompt = "Use the native skill tool to load the local dashi-ppt Skill. The selected Skill is authoritative for this task's behavior and response flow.";
    const command = { version: 1, requestId, runId, sessionId: session.sessionId, type: "session.prompt", payload: { prompt, model: options.provider.model, provider: options.provider, allowArtifacts, ...(kind === "presentation" ? { systemPrompt: presentationSystemPrompt } : {}), ...(session.agentId ? { agentId: session.agentId } : {}) } };
    const requestStartedAt = Date.now();
    const sent = await sendHost(page, collector, command);
    const responseMs = Date.now() - requestStartedAt;
    console.log(`[desktop-regression] turn-accepted kind=${kind} conversation=${session.conversationId} round=${round} responseMs=${responseMs}`);
    terminal = await collector.waitFor((frame) => terminalEvent(frame, runId), options.stressTimeoutMs);
    // Host artifact finalization intentionally runs after a terminal runtime
    // error as a last-chance recovery path. Give that event a short window to
    // arrive before taking the frame snapshot used by the regression report.
    if (kind === "presentation" && terminal.data.event.event === "runtime_error") {
      await collector.waitFor((frame) => frame.data?.event?.event === "artifact" && frame.data.event.runId === runId, 5_000).catch(() => undefined);
    }
    await sent.dispose();
    const frames = sent.frames();
    const events = frames.map((frame) => frame.data?.event).filter(Boolean);
    const text = events.filter((event) => event.event === "text_delta").map((event) => String(event.delta ?? "")).join("");
    const reasoningEvents = events.filter((event) => event.event === "reasoning_delta" || event.event === "reasoning_start");
    const terminalStatus = terminal.data.event.event === "done" ? "succeeded" : terminal.data.event.code === "opencode_aborted" ? "cancelled" : "failed";
    await invoke(page, "finish_run", { runId, status: terminalStatus });
    if (terminalStatus === "succeeded") {
      await appendMessage(page, { id: `${runId}:assistant`, conversation_id: session.conversationId, role: "assistant", content: text, parts_json: JSON.stringify([{ type: "text", text }]), metadata_json: JSON.stringify({ regression: true, kind, round, reasoningEvents: reasoningEvents.length }), created_at: messageTime(round * 2 + 1) });
    }
    const artifactEvents = events.filter((event) => event.event === "artifact");
    const terminalError = terminal.data.event.event === "runtime_error" ? String(terminal.data.event.message ?? terminal.data.event.code ?? "runtime_error") : undefined;
    console.log(`[desktop-regression] turn-terminal kind=${kind} conversation=${session.conversationId} round=${round} status=${terminalStatus} durationMs=${Date.now() - startedAt}`);
    return { runId, round, status: terminalStatus, ...(terminalError ? { error: terminalError } : {}), textLength: text.length, reasoningEvents: reasoningEvents.length, artifactPaths: artifactEvents.map((event) => event.artifact?.relativePath).filter(Boolean), responseMs, durationMs: Date.now() - startedAt };
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
    await invoke(page, "finish_run", { runId, status: "failed" }).catch(() => undefined);
    return { runId, round, status: "failed", error, responseMs: null, artifactPaths: [], durationMs: Date.now() - startedAt };
  }
}

async function verifyConversation(page, options, session, turns) {
  const messages = await invoke(page, "list_messages", { conversationId: session.conversationId, limit: null, beforeCreatedAt: null, beforeId: null });
  const expected = turns.flatMap((turn) => turn.status === "succeeded" ? ["user", "assistant"] : ["user"]);
  const roles = messages.map((message) => message.role);
  const orderCorrect = roles.length === expected.length && roles.every((role, index) => role === expected[index]);
  const runs = await invoke(page, "list_runs");
  const ownRuns = runs.filter((run) => run.conversation_id === session.conversationId);
  const ended = ownRuns.length === turns.length && ownRuns.every((run) => ["succeeded", "failed", "cancelled", "interrupted"].includes(run.status));
  const allRoundsSucceeded = turns.length >= 6 && turns.every((turn) => turn.status === "succeeded");
  return { conversationId: session.conversationId, agentId: session.agentId ?? null, rounds: turns.length, messageRoles: roles, expectedRoles: expected, orderCorrect, ended, allRoundsSucceeded, runStatuses: ownRuns.map((run) => run.status) };
}

async function runConversationSuite(page, collector, options, kind, agentId) {
  const sessions = await Promise.all(Array.from({ length: options.count }, (_, index) => startConversation(page, collector, options, index, agentId, false, kind)));
  const turnsBySession = new Map(sessions.map((session) => [session.conversationId, []]));
  for (let round = 1; round <= options.rounds; round += 1) {
    const results = await Promise.all(sessions.map((session, index) => runConversationTurn(page, collector, options, session, round, index, kind)));
    for (const result of results) turnsBySession.get(sessions.find((session) => result.runId.startsWith(session.conversationId))?.conversationId)?.push(result);
    console.log(`[desktop-regression] ${kind} round ${round}/${options.rounds}: ${results.filter((result) => result.status === "succeeded").length}/${results.length} succeeded`);
  }
  const verified = await Promise.all(sessions.map((session) => verifyConversation(page, options, session, turnsBySession.get(session.conversationId) ?? [])));
  const turns = [...turnsBySession.values()].flat();
  return { kind, count: sessions.length, rounds: options.rounds, passed: verified.filter((item) => item.orderCorrect && item.ended && item.allRoundsSucceeded).length, items: verified, turns, latency: latencySummary(turns) };
}

async function runPresentationSuite(page, collector, options) {
  const sessions = await Promise.all(Array.from({ length: options.count }, (_, index) => {
    const conversationId = id("presentation", index);
    const workspacePath = join(options.workspacePath, "parallel-regression-workspaces", conversationId);
    return startConversation(page, collector, options, index, PRESENTATION_AGENT_ID, true, "presentation", workspacePath, conversationId);
  }));
  const turns = await Promise.all(sessions.map((session, index) => runConversationTurn(page, collector, options, session, 1, index, "presentation")));
  const items = await Promise.all(sessions.map(async (session, index) => {
    const detail = await invoke(page, "inspect_run", { runId: turns[index].runId }).catch(() => null);
    const persistedArtifacts = artifactsFromRunDetail(detail);
    const allArtifactPaths = [...new Set([...turns[index].artifactPaths, ...persistedArtifacts.map((artifact) => artifact.relativePath).filter(Boolean)])];
    const pptxPaths = allArtifactPaths.filter((path) => /\.pptx$/iu.test(String(path)));
    return { conversationId: session.conversationId, agentId: session.agentId, workspacePath: session.workspacePath, runId: turns[index].runId, status: turns[index].status, artifactPaths: pptxPaths, allArtifactPaths, pptxPaths, persistedArtifacts: persistedArtifacts.length, artifactMissing: pptxPaths.length === 0, error: turns[index].error };
  }));
  return { kind: "presentation", agentId: PRESENTATION_AGENT_ID, count: items.length, rounds: 1, passed: items.filter((item) => item.agentId === PRESENTATION_AGENT_ID && item.status === "succeeded" && item.pptxPaths.length > 0).length, items, turns, latency: latencySummary(turns) };
}

function workflowDefinition(prompt, action, index) {
  const input = { nodeKey: "input", type: "text_input", nodeVersion: 1, title: "Input", positionX: 0, positionY: 0, config: { text: prompt } };
  const capability = action === "ppt_generate"
    ? { nodeKey: "capability", type: "ppt_generate", nodeVersion: 1, title: "Editable PPT", positionX: 408, positionY: 0, config: { prompt, script: prompt, text: prompt, previewRuntime: "ppt-master-agent", pageCount: 1, language: "en-US", scenario: "business-report" } }
    : { nodeKey: "capability", type: "file_create", nodeVersion: 1, title: "File", positionX: 408, positionY: 0, config: { fileName: `desktop-parallel-workflow-${index + 1}.md`, fileFormat: "md" } };
  const output = { nodeKey: "output", type: "output", nodeVersion: 1, title: "Output", positionX: 816, positionY: 0, config: { requireAllSucceeded: true } };
  return { schemaVersion: 2, revision: 1, definitionHash: "", nodes: [input, capability, output], edges: [{ edgeKey: "input-capability", sourceNodeKey: "input", sourcePortId: "text", targetNodeKey: "capability", targetPortId: "text" }, { edgeKey: "capability-output", sourceNodeKey: "capability", sourcePortId: action === "ppt_generate" ? "ppt" : "asset", targetNodeKey: "output", targetPortId: action === "ppt_generate" ? "presentations" : "assets" }] };
}

function imageWorkflowDefinition(prompt, providerId) {
  const input = { nodeKey: "input", type: "text_input", nodeVersion: 1, title: "Input", positionX: 0, positionY: 0, config: { text: prompt } };
  const image = { nodeKey: "image", type: "image_generate", nodeVersion: 1, title: "Image", positionX: 408, positionY: 0, config: { prompt, provider: providerId } };
  const output = { nodeKey: "output", type: "output", nodeVersion: 1, title: "Output", positionX: 816, positionY: 0, config: { requireAllSucceeded: true } };
  return { schemaVersion: 2, revision: 1, definitionHash: "", nodes: [input, image, output], edges: [{ edgeKey: "input-image", sourceNodeKey: "input", sourcePortId: "text", targetNodeKey: "image", targetPortId: "text" }, { edgeKey: "image-output", sourceNodeKey: "image", sourcePortId: "image", targetNodeKey: "output", targetPortId: "images" }] };
}

function artifactsFromRunDetail(detail) {
  return (detail?.nodes ?? []).flatMap((node) => {
    if (typeof node.output_json !== "string") return [];
    try {
      const output = JSON.parse(node.output_json);
      const values = Array.isArray(output.artifacts) ? output.artifacts : output.artifact ? [output.artifact] : [];
      return values.filter((value) => value && typeof value === "object");
    } catch {
      return [];
    }
  });
}

function textualArtifactsFromRunDetail(detail, workspacePath, projectRoot) {
  return (detail?.nodes ?? []).flatMap((node) => {
    if (typeof node.output_json !== "string") return [];
    let output;
    try { output = JSON.parse(node.output_json); } catch { return []; }
    const text = typeof output.text === "string" ? output.text : "";
    return [...text.matchAll(/(?:File|Artifact):\s*`([^`]+)`/giu)].flatMap((match) => {
      const segments = String(match[1]).replaceAll("\\", "/").split("/").filter(Boolean);
      const workspaceName = workspacePath.split(/[\\/]/u).filter(Boolean).at(-1);
      const candidate = segments[0] === workspaceName ? join(workspacePath, ...segments.slice(1)) : join(workspacePath, ...segments);
      if (!existsSync(candidate)) return [];
      return [{ relativePath: relative(projectRoot, candidate).split(sep).join("/"), mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }];
    });
  });
}

async function runWorkflowSuite(page, collector, options, action) {
  const prefix = action === "ppt_generate" ? "ppt" : "workflow";
  const items = await Promise.all(Array.from({ length: options.count }, async (_, index) => {
    const runId = id(prefix, index);
    const runWorkspacePath = action === "ppt_generate" ? join(options.workspacePath, "parallel-regression-workspaces", runId) : options.workspacePath;
    const prompt = action === "ppt_generate"
      ? `Quick generate one minimal one-slide editable PPTX for desktop regression ${runId}. Invoke the ppt-master skill and follow its quick-generate workflow now; do not stop after loading or describing the skill. You must actually create a valid editable PPTX in this project workspace before replying, and return only after the PPTX artifact and its validation are complete. Proceed without user confirmation gates.`
      : `Create a short Markdown regression artifact for workflow ${runId}.`;
    const startedAt = Date.now();
    await invoke(page, "create_run", { runId, conversationId: null, model: options.provider.model });
    try {
      const requestId = `${runId}:workflow`;
      const requestStartedAt = Date.now();
      const sent = await sendHost(page, collector, { version: 1, requestId, runId, type: "workflow.run", payload: { workspacePath: runWorkspacePath, provider: options.provider, media: options.provider, providers: options.providers, definition: workflowDefinition(prompt, action, index) } });
      const responseMs = Date.now() - requestStartedAt;
      const terminal = await collector.waitFor((frame) => terminalEvent(frame, runId), options.stressTimeoutMs);
      await sent.dispose();
      const frames = sent.frames();
      const events = frames.map((frame) => frame.data?.event).filter(Boolean);
      const status = terminal.data.event.event === "done" ? "succeeded" : terminal.data.event.code === "opencode_aborted" ? "cancelled" : "failed";
      const artifacts = events.filter((event) => event.event === "artifact" || String(event.tool ?? "").startsWith("artifact:"));
      await invoke(page, "finish_run", { runId, status }).catch(() => undefined);
      const detail = await invoke(page, "inspect_run", { runId }).catch(() => null);
      const persistedArtifacts = artifactsFromRunDetail(detail);
      const textualArtifacts = action === "ppt_generate" ? textualArtifactsFromRunDetail(detail, runWorkspacePath, options.workspacePath) : [];
      const artifactRows = [...persistedArtifacts, ...textualArtifacts];
      const abnormalEvents = events.filter((event) => event.event === "runtime_error" || event.code === "workflow_host_exit");
      const pptxPaths = artifactRows.map((artifact) => artifact.relativePath).filter((path) => /\.pptx$/iu.test(String(path)));
      const artifactMissing = action === "ppt_generate" && pptxPaths.length === 0;
      return { runId, status: artifactMissing ? "failed" : status, error: artifactMissing ? "ppt_artifact_missing" : undefined, workspacePath: runWorkspacePath, artifactEvents: artifacts.length, persistedArtifacts: artifactRows.length, pptxPaths, artifactPaths: pptxPaths, abnormalEvents: abnormalEvents.length, responseMs, durationMs: Date.now() - startedAt };
    } catch (caught) {
      const error = caught instanceof Error ? caught.message : String(caught);
      await emergencyStop(page, runId);
      await invoke(page, "finish_run", { runId, status: "failed" }).catch(() => undefined);
      const detail = await invoke(page, "inspect_run", { runId }).catch(() => null);
      const persistedArtifacts = artifactsFromRunDetail(detail);
      return { runId, status: "failed", error, responseMs: null, runStatus: detail?.run?.status ?? null, nodeStatuses: (detail?.nodes ?? []).map((node) => ({ nodeKey: node.node_key, status: node.status })), workspacePath: runWorkspacePath, artifactEvents: 0, persistedArtifacts: persistedArtifacts.length, artifactPaths: persistedArtifacts.map((artifact) => artifact.relativePath).filter(Boolean), durationMs: Date.now() - startedAt };
    }
  }));
  return { kind: action === "ppt_generate" ? "ppt" : "workflow", count: items.length, passed: items.filter((item) => item.status === "succeeded" && item.abnormalEvents === 0 && (action !== "ppt_generate" || item.pptxPaths?.length > 0)).length, items, latency: latencySummary(items) };
}

async function runImageSuite(page, collector, options) {
  if (!options.imageProvider?.id || !options.imageProvider?.model || !options.imageProvider?.baseUrl || !options.imageProvider?.apiKey) throw new Error("configured_image_provider_missing");
  const items = await Promise.all(Array.from({ length: options.count }, async (_, index) => {
    const runId = id("image", index);
    const requestId = `${runId}:workflow`;
    const prompt = `Desktop regression image ${index + 1}: a cobalt blue ceramic cup on a light gray studio table, soft natural shadow, centered composition, no text, no logo, no watermark.`;
    const startedAt = Date.now();
    await invoke(page, "create_run", { runId, conversationId: null, model: options.imageProvider.model });
    try {
      const requestStartedAt = Date.now();
      const sent = await sendHost(page, collector, { version: 1, requestId, runId, type: "workflow.run", payload: { workspacePath: options.workspacePath, provider: options.provider, media: options.imageProvider, providers: options.providers, definition: imageWorkflowDefinition(prompt, options.imageProvider.id) } });
      const responseMs = Date.now() - requestStartedAt;
      const terminal = await collector.waitFor((frame) => terminalEvent(frame, runId), options.stressTimeoutMs);
      await sent.dispose();
      const events = sent.frames().map((frame) => frame.data?.event).filter(Boolean);
      const status = terminal.data.event.event === "done" ? "succeeded" : terminal.data.event.code === "opencode_aborted" ? "cancelled" : "failed";
      const detail = await invoke(page, "inspect_run", { runId }).catch(() => null);
      const persistedArtifacts = artifactsFromRunDetail(detail);
      const artifactPaths = persistedArtifacts.map((artifact) => artifact.relativePath).filter((path) => /\.(png|jpe?g|webp)$/iu.test(String(path)));
      const abnormalEvents = events.filter((event) => event.event === "runtime_error" || event.code === "workflow_host_exit");
      await invoke(page, "finish_run", { runId, status }).catch(() => undefined);
      return { runId, status: status === "succeeded" && artifactPaths.length ? status : "failed", error: status === "succeeded" && !artifactPaths.length ? "image_artifact_missing" : undefined, artifactPaths, persistedArtifacts: persistedArtifacts.length, abnormalEvents: abnormalEvents.length, responseMs, durationMs: Date.now() - startedAt };
    } catch (caught) {
      const error = caught instanceof Error ? caught.message : String(caught);
      await emergencyStop(page, runId);
      await invoke(page, "finish_run", { runId, status: "failed" }).catch(() => undefined);
      return { runId, status: "failed", error, responseMs: null, artifactPaths: [], persistedArtifacts: 0, abnormalEvents: 0, durationMs: Date.now() - startedAt };
    }
  }));
  return { kind: "image", count: items.length, passed: items.filter((item) => item.status === "succeeded" && item.abnormalEvents === 0).length, items, latency: latencySummary(items) };
}

async function verifyAssetLibrary(page, report, options) {
  const expectedPaths = [...new Set(report.suites.flatMap((suite) => suite.items ?? []).flatMap((item) => item.artifactPaths ?? []))];
  const rows = await invoke(page, "list_artifacts");
  const byPath = new Map(rows.map((row) => [row.relative_path, row]));
  const checks = await Promise.all(expectedPaths.map(async (relativePath) => {
    const row = byPath.get(relativePath);
    if (!row) return { relativePath, listed: false, readable: false, available: false, error: "artifact_not_listed" };
    try {
      const payload = await invoke(page, "read_artifact", { relativePath: row.relative_path, mimeType: row.mime_type });
      const byteLength = Array.isArray(payload?.data) ? payload.data.length : 0;
      return { relativePath, listed: true, readable: byteLength > 0, available: row.available !== false, byteLength, mimeType: row.mime_type };
    } catch (error) {
      return { relativePath, listed: true, readable: false, available: row.available !== false, error: error instanceof Error ? error.message : String(error) };
    }
  }));
  await page.goto("http://127.0.0.1:1420/dashboard/assets", { waitUntil: "domcontentloaded", timeout: DEFAULT_UI_TIMEOUT_MS });
  await page.getByText("资产库").first().waitFor({ timeout: 30_000 }).catch(() => undefined);
  const visibleExpected = await page.evaluate((paths) => paths.filter((path) => document.body.innerText.includes(path)), expectedPaths);
  const openChecks = await Promise.all(expectedPaths.map(async (relativePath) => {
    const row = byPath.get(relativePath);
    if (!row) return { relativePath, opened: false, error: "artifact_not_listed" };
    try {
      await invoke(page, "open_artifact", { relativePath: row.relative_path, mimeType: row.mime_type });
      return { relativePath, opened: true };
    } catch (error) {
      return { relativePath, opened: false, error: error instanceof Error ? error.message : String(error) };
    }
  }));
  let route = "";
  try { route = page.url(); } catch { /* renderer may have closed after shell reveal */ }
  const assetCards = await page.locator(".asset-library-card").count().catch(() => null);
  return { kind: "assets", count: checks.length, passed: checks.filter((check) => check.listed && check.available && check.readable).length, expectedPaths, checks, openChecks, ui: { route, visibleExpectedCount: visibleExpected.length, assetCards } };
}

async function verifyUiSurfaces(page, options) {
  const routes = [
    { name: "ai", path: "http://127.0.0.1:1420/dashboard/ai", marker: "textarea" },
    { name: "editable-ppt", path: "http://127.0.0.1:1420/dashboard/ai?agent=executive-ppt", marker: "textarea" },
    { name: "presentation-ppt", path: "http://127.0.0.1:1420/dashboard/ai?agent=executive-presentation-ppt", marker: "textarea" },
    { name: "image", path: "http://127.0.0.1:1420/dashboard/image-assistant", marker: ".image-field-grid" },
    { name: "tasks", path: "http://127.0.0.1:1420/dashboard/tasks", marker: ".library-workspace" },
    { name: "assets", path: "http://127.0.0.1:1420/dashboard/assets", marker: ".asset-library-surface" },
  ];
  const checks = [];
  for (const route of routes) {
    const startedAt = Date.now();
    try {
      await page.goto(route.path, { waitUntil: "domcontentloaded", timeout: DEFAULT_UI_TIMEOUT_MS });
      await page.locator(route.marker).first().waitFor({ state: "visible", timeout: 30_000 });
      checks.push({ name: route.name, path: route.path, ok: true, responseMs: Date.now() - startedAt });
    } catch (error) {
      checks.push({ name: route.name, path: route.path, ok: false, responseMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { kind: "ui", count: checks.length, passed: checks.filter((check) => check.ok).length, checks };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const browser = await chromium.connectOverCDP(options.cdpUrl);
  const pages = browser.contexts().flatMap((context) => context.pages());
  const page = pages.find((candidate) => candidate.url().includes(":1420")) ?? pages[0];
  if (!page) throw new Error("desktop_window_not_found");
  await page.waitForFunction(() => Boolean(window.__TAURI__?.core?.invoke), undefined, { timeout: 60_000 });
  const probe = await invoke(page, "runtime_probe");
  if (!probe?.ready) throw new Error("desktop_runtime_not_ready");
  await invoke(page, "host_start");
  const config = await invoke(page, "read_config");
  const providerId = config.defaults?.text ?? config.provider?.id;
  const provider = config.providers?.[providerId] ?? config.provider;
  const imageProviderId = config.defaults?.image;
  const imageProvider = imageProviderId ? config.providers?.[imageProviderId] : undefined;
  if (!provider?.model || !provider?.baseUrl || !provider?.apiKey) throw new Error("configured_text_provider_missing");
  const workspacePath = config.workspacePath;
  const reportDirectory = join(process.cwd(), ".artifacts", "desktop-real-parallel-regression", nowStamp());
  await mkdir(reportDirectory, { recursive: true });
  const collector = new DesktopFrameCollector(page);
  await collector.start();
  const suiteOptions = { ...options, workspacePath, provider, imageProvider, providers: config.providers ?? {}, safeProvider: safeProvider(provider) };
  const previousReport = options.reportPath ? JSON.parse(await readFile(options.reportPath, "utf8")) : null;
  const report = { startedAt: new Date().toISOString(), cdpUrl: options.cdpUrl, desktopUrl: page.url(), runtime: probe, configuration: { workspacePath, provider: safeProvider(provider), imageProvider: safeProvider(imageProvider), count: options.count, rounds: options.rounds, stressTimeoutMs: options.stressTimeoutMs, ipcTimeoutMs: DEFAULT_IPC_TIMEOUT_MS, uiTimeoutMs: DEFAULT_UI_TIMEOUT_MS, sourceReport: options.reportPath }, suites: previousReport?.suites ? [...previousReport.suites] : [] };
  try {
    const generationSuites = options.suites.filter((suite) => !["assets", "ui"].includes(suite));
    const generationResults = await Promise.all(generationSuites.map(async (suite) => {
      try {
        if (suite === "ai") return await runConversationSuite(page, collector, suiteOptions, "ai");
        if (suite === "agent") return await runConversationSuite(page, collector, suiteOptions, "agent", "agency-sales-deal-strategist");
        if (suite === "ppt") return await runWorkflowSuite(page, collector, suiteOptions, "ppt_generate");
        if (suite === "presentation") return await runPresentationSuite(page, collector, suiteOptions);
        if (suite === "workflow") return await runWorkflowSuite(page, collector, suiteOptions, "file_create");
        if (suite === "image") return await runImageSuite(page, collector, suiteOptions);
        throw new Error(`unknown_suite:${suite}`);
      } catch (error) {
        return { kind: suite, count: suite === "ai" || suite === "agent" ? options.count : options.count, passed: 0, items: [], error: error instanceof Error ? error.message : String(error) };
      }
    }));
    report.suites.push(...generationResults);
    if (options.suites.includes("assets")) report.suites.push(await verifyAssetLibrary(page, report, suiteOptions));
    if (options.suites.includes("ui")) report.suites.push(await verifyUiSurfaces(page, suiteOptions));
  } finally {
    await collector.stop().catch(() => undefined);
    report.finishedAt = new Date().toISOString();
    report.durationMs = Date.parse(report.finishedAt) - Date.parse(report.startedAt);
    report.summary = { total: report.suites.reduce((sum, suite) => sum + suite.count, 0), passed: report.suites.reduce((sum, suite) => sum + suite.passed, 0), failed: report.suites.reduce((sum, suite) => sum + (suite.count - suite.passed), 0), generationSuites: report.suites.filter((suite) => !["assets", "ui"].includes(suite.kind)).map((suite) => ({ kind: suite.kind, count: suite.count, passed: suite.passed, latency: suite.latency })) };
    await writeFile(join(reportDirectory, "report.json"), JSON.stringify(report, null, 2), "utf8");
    console.log(`[desktop-regression] report=${join(reportDirectory, "report.json")}`);
    console.log(`[desktop-regression] summary=${JSON.stringify(report.summary)}`);
  }
  await browser.close();
  if (report.summary.failed > 0) process.exitCode = 1;
}

main().catch((error) => { console.error(`[desktop-regression] fatal=${error instanceof Error ? error.stack ?? error.message : String(error)}`); process.exitCode = 1; });
