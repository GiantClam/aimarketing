import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { createReadStream, existsSync } from "node:fs"
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import net from "node:net"
import os from "node:os"
import path from "node:path"

import { discoverOpenCodeCandidates, type OpenCodeCandidate } from "./candidates.ts"
import { buildEvidence, redactEvidence, type SpikeCheck } from "./evidence.ts"
import { EventAccumulator, SseDecoder, classifyEvent } from "./protocol.ts"

const SPIKE_DIRECTORY = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:([A-Za-z]):)/u, "$1:"))
const DEFAULT_PRIVATE_VERSION = "1.18.14"
const MAX_LOG_BYTES = 64 * 1024

type ServerHandle = {
  child: ChildProcess
  port: number
  username: string
  password: string
  baseUrl: string
  stdout: string
  stderr: string
  startedAt: number
}

type HttpResult = {
  status: number
  body: unknown
  text: string
}

type PromptResult = HttpResult & {
  durationMs: number
  timedOut?: boolean
  error?: string
  completed?: boolean
  responseText?: string
  providerBlocker?: ReturnType<typeof blockerFrom>
}

function parseArgs(argv: string[]) {
  const result: Record<string, string | boolean> = {}
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index]
    if (!raw?.startsWith("--")) continue
    const key = raw.slice(2)
    const next = argv[index + 1]
    if (next && !next.startsWith("--")) {
      result[key] = next
      index += 1
    } else {
      result[key] = true
    }
  }
  return result
}

function appendBounded(current: string, chunk: Buffer | string) {
  if (current.length >= MAX_LOG_BYTES) return current
  return (current + chunk.toString()).slice(0, MAX_LOG_BYTES)
}

function basicAuth(username: string, password: string) {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`
}

async function randomLoopbackPort() {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      const port = typeof address === "object" && address ? address.port : 0
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
}

async function sha256File(filePath: string) {
  return await new Promise<string>((resolve, reject) => {
    const hash = createHash("sha256")
    const stream = createReadStream(filePath)
    stream.on("error", reject)
    stream.on("data", (chunk: Buffer) => hash.update(chunk.toString("latin1"), "latin1"))
    stream.on("end", () => resolve(hash.digest("hex")))
  })
}

function sha256Text(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

async function withTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController()
  let rejectTimeout: ((reason: Error) => void) | undefined
  const timeout = new Promise<never>((_resolve, reject) => { rejectTimeout = reject })
  const timer = setTimeout(() => {
    const error = new Error(`timeout_after_${timeoutMs}ms`)
    controller.abort(error)
    rejectTimeout?.(error)
  }, timeoutMs)
  timer.unref()
  try {
    return await Promise.race([operation(controller.signal), timeout])
  } finally {
    clearTimeout(timer)
  }
}

async function abortableDelay(timeoutMs: number, signal: AbortSignal) {
  if (signal.aborted) throw signal.reason
  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      signal.removeEventListener("abort", abort)
      resolve()
    }
    const timer = setTimeout(finish, timeoutMs)
    const abort = () => {
      clearTimeout(timer)
      reject(signal.reason)
    }
    signal.addEventListener("abort", abort, { once: true })
    timer.unref()
  })
}

async function parseResponse(response: Response): Promise<HttpResult> {
  const text = await response.text()
  let body: unknown = text
  if (text) {
    try {
      body = JSON.parse(text) as unknown
    } catch {
      body = text
    }
  }
  return { status: response.status, body, text }
}

async function request(server: ServerHandle, route: string, init: RequestInit = {}, authenticated = true, timeoutMs = 10_000) {
  const headers = new Headers(init.headers)
  if (authenticated) headers.set("authorization", basicAuth(server.username, server.password))
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json")
  return await withTimeout(async (signal) => {
    const response = await fetch(`${server.baseUrl}${route}`, { ...init, headers, signal })
    return await parseResponse(response)
  }, timeoutMs)
}

type IsolatedRuntime = {
  environment: Record<string, string>
  modelConfigured: boolean
  credentialConfigured: boolean
}

async function prepareIsolatedRuntime(workspace: string, model: string): Promise<IsolatedRuntime> {
  const selection = modelSelection(model)
  const runtimeRoot = path.join(workspace, "runtime-state")
  const configHome = path.join(runtimeRoot, "config")
  const configDirectory = path.join(configHome, "opencode")
  const dataHome = path.join(runtimeRoot, "data")
  const dataDirectory = path.join(dataHome, "opencode")
  await mkdir(configDirectory, { recursive: true })
  await mkdir(dataDirectory, { recursive: true })

  if (process.platform === "win32") {
    const identity = spawnSync("whoami.exe", [], { encoding: "utf8", windowsHide: true }).stdout.trim()
    const acl = identity
      ? spawnSync("icacls.exe", [runtimeRoot, "/inheritance:r", "/grant:r", `${identity}:(OI)(CI)F`], { encoding: "utf8", windowsHide: true })
      : null
    if (!identity || acl?.status !== 0) throw new Error("cannot_apply_private_runtime_acl")
  }

  let providerConfig: unknown
  let providerAuth: unknown
  if (selection) {
    try {
      const userConfig = JSON.parse(await readFile(path.join(os.homedir(), ".config", "opencode", "opencode.json"), "utf8")) as { provider?: Record<string, unknown> }
      providerConfig = userConfig.provider?.[selection.providerID]
    } catch {
      providerConfig = undefined
    }
    try {
      const userAuth = JSON.parse(await readFile(path.join(os.homedir(), ".local", "share", "opencode", "auth.json"), "utf8")) as Record<string, unknown>
      providerAuth = userAuth[selection.providerID]
    } catch {
      providerAuth = undefined
    }
  }

  const minimalConfig = providerConfig && selection
    ? { provider: { [selection.providerID]: providerConfig } }
    : {}
  const minimalAuth = providerAuth && selection
    ? { [selection.providerID]: providerAuth }
    : {}
  await writeFile(path.join(configDirectory, "opencode.json"), `${JSON.stringify(minimalConfig, null, 2)}\n`, "utf8")
  await writeFile(path.join(dataDirectory, "auth.json"), `${JSON.stringify(minimalAuth, null, 2)}\n`, "utf8")

  return {
    environment: {
      OPENCODE_CONFIG_DIR: configDirectory,
      XDG_CONFIG_HOME: configHome,
      XDG_DATA_HOME: dataHome,
      XDG_CACHE_HOME: path.join(runtimeRoot, "cache"),
    },
    modelConfigured: Boolean(providerConfig),
    credentialConfigured: Boolean(providerAuth),
  }
}

function serverEnvironment(workspace: string, username: string, password: string, runtime: IsolatedRuntime) {
  return {
    ...process.env,
    OPENCODE_SERVER_USERNAME: username,
    OPENCODE_SERVER_PASSWORD: password,
    OPENCODE_DISABLE_AUTOUPDATE: "true",
    OPENCODE_DISABLE_MODELS_FETCH: "true",
    ...runtime.environment,
  }
}

async function startServer(candidatePath: string, workspace: string, runtime: IsolatedRuntime): Promise<ServerHandle> {
  const port = await randomLoopbackPort()
  const username = `spike-${randomBytes(8).toString("hex")}`
  const password = randomBytes(32).toString("base64url")
  const child = spawn(candidatePath, [
    "serve",
    "--hostname", "127.0.0.1",
    "--port", String(port),
    "--print-logs",
    "--log-level", "INFO",
  ], {
    cwd: workspace,
    env: serverEnvironment(workspace, username, password, runtime),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  })
  const handle: ServerHandle = {
    child,
    port,
    username,
    password,
    baseUrl: `http://127.0.0.1:${port}`,
    stdout: "",
    stderr: "",
    startedAt: Date.now(),
  }
  child.stdout?.on("data", (chunk: Buffer) => { handle.stdout = appendBounded(handle.stdout, chunk) })
  child.stderr?.on("data", (chunk: Buffer) => { handle.stderr = appendBounded(handle.stderr, chunk) })
  try {
    await withTimeout(async (signal) => {
      while (child.exitCode === null) {
        signal.throwIfAborted()
        try {
          const health = await request(handle, "/global/health", {}, true, 1_000)
          if (health.status === 200) return
        } catch {
          // Server startup is polled until the bounded deadline.
        }
        await abortableDelay(150, signal)
      }
      throw new Error(`opencode_exited_during_startup:${child.exitCode}`)
    }, 20_000)
  } catch (error) {
    await stopServer(handle)
    throw error
  }
  return handle
}

async function stopServer(server: ServerHandle) {
  const started = Date.now()
  const startedAtUtc = new Date(server.startedAt).toISOString()
  if (server.child.exitCode === null) server.child.kill("SIGTERM")
  await Promise.race([
    new Promise<void>((resolve) => server.child.once("exit", () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
  ])
  if (server.child.exitCode === null) {
    server.child.kill("SIGKILL")
    await Promise.race([
      new Promise<void>((resolve) => server.child.once("exit", () => resolve())),
      new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
    ])
  }
  return {
    startedAtUtc,
    finishedAtUtc: new Date().toISOString(),
    exited: server.child.exitCode !== null || server.child.signalCode !== null,
    exitCode: server.child.exitCode,
    signal: server.child.signalCode,
    durationMs: Date.now() - started,
    stdoutBytes: Buffer.byteLength(server.stdout, "utf8"),
    stderrBytes: Buffer.byteLength(server.stderr, "utf8"),
    stdoutSha256: sha256Text(server.stdout),
    stderrSha256: sha256Text(server.stderr),
  }
}

function sessionIdFrom(body: unknown) {
  if (!body || typeof body !== "object") return ""
  const direct = (body as { id?: unknown }).id
  const data = (body as { data?: { id?: unknown } }).data?.id
  return typeof direct === "string" ? direct : typeof data === "string" ? data : ""
}

function blockerFrom(value: unknown) {
  const diagnostic = typeof value === "string" ? value : JSON.stringify(value)
  if (!/ProviderAuthError|api.?key|credential|unauthorized|authentication failed|model.*(?:not found|missing|invalid|unknown|unavailable)|no provider|provider.*not configured/i.test(diagnostic)) return null
  const code = /model.*(?:not|missing|invalid|unknown)/i.test(diagnostic)
    ? "provider_model_unavailable_or_invalid"
    : "provider_credentials_unavailable_or_invalid"
  return { code, diagnostic: diagnostic.slice(0, 400) }
}

function modelSelection(model: string) {
  const separator = model.indexOf("/")
  if (separator <= 0 || separator === model.length - 1) return undefined
  return { providerID: model.slice(0, separator), modelID: model.slice(separator + 1) }
}

function messageItems(body: unknown) {
  return Array.isArray(body) ? body : []
}

function assistantMessages(body: unknown) {
  return messageItems(body).filter((item) => item && typeof item === "object" && (item as { info?: { role?: unknown } }).info?.role === "assistant") as Array<Record<string, unknown>>
}

function assistantText(message: Record<string, unknown> | undefined) {
  const parts = Array.isArray(message?.parts) ? message.parts : []
  return parts
    .filter((part) => part && typeof part === "object" && (part as { type?: unknown }).type === "text")
    .map((part) => typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : "")
    .join("")
}

function assistantDiagnostic(message: Record<string, unknown> | undefined) {
  const info = message?.info && typeof message.info === "object" ? message.info as Record<string, unknown> : {}
  return info.error ?? ""
}

async function waitForTurn(server: ServerHandle, sessionId: string, baselineAssistants: number, timeoutMs: number) {
  return await withTimeout(async (signal) => {
    while (!signal.aborted) {
      const messages = await request(server, `/session/${encodeURIComponent(sessionId)}/message`, {}, true, 5_000)
      const assistants = assistantMessages(messages.body)
      if (assistants.length > baselineAssistants) {
        const latest = assistants.at(-1)
        const info = latest?.info && typeof latest.info === "object" ? latest.info as Record<string, unknown> : {}
        const time = info.time && typeof info.time === "object" ? info.time as Record<string, unknown> : {}
        if (typeof time.completed === "number" || info.error) return { completed: true, message: latest }
      }
      await new Promise((resolve) => setTimeout(resolve, 350))
    }
    throw signal.reason
  }, timeoutMs)
}

async function sessionBusy(server: ServerHandle, sessionId: string) {
  const status = await request(server, "/session/status")
  const states = status.body && typeof status.body === "object" ? status.body as Record<string, unknown> : {}
  const state = states[sessionId] && typeof states[sessionId] === "object" ? states[sessionId] as Record<string, unknown> : {}
  return state.type !== undefined && state.type !== "idle"
}

type ToolObservation = {
  partId: string
  tool: string
  status: string
}

function findTool(body: unknown, partId?: string, activeOnly = false, terminalOnly = false): ToolObservation | null {
  for (const message of [...assistantMessages(body)].reverse()) {
    const parts = Array.isArray(message.parts) ? message.parts : []
    for (const value of [...parts].reverse()) {
      if (!value || typeof value !== "object") continue
      const part = value as Record<string, unknown>
      if (part.type !== "tool") continue
      const state = part.state && typeof part.state === "object" ? part.state as Record<string, unknown> : {}
      const status = typeof state.status === "string" ? state.status : "unknown"
      const observedPartId = typeof part.id === "string" ? part.id : ""
      if (partId && observedPartId !== partId) continue
      if (activeOnly && !["pending", "running"].includes(status)) continue
      if (terminalOnly && ["pending", "running"].includes(status)) continue
      return {
        partId: observedPartId,
        tool: typeof part.tool === "string" ? part.tool : "unknown",
        status,
      }
    }
  }
  return null
}

async function waitForTool(server: ServerHandle, sessionId: string, timeoutMs: number, partId?: string, activeOnly = false, terminalOnly = false) {
  return await withTimeout(async (signal) => {
    while (true) {
      signal.throwIfAborted()
      const messages = await request(server, `/session/${encodeURIComponent(sessionId)}/message`, {}, true, 5_000)
      const tool = findTool(messages.body, partId, activeOnly, terminalOnly)
      if (tool) return tool
      await abortableDelay(150, signal)
    }
  }, timeoutMs)
}

async function prompt(server: ServerHandle, sessionId: string, text: string, model: string, timeoutMs = 120_000): Promise<PromptResult> {
  const started = Date.now()
  try {
    const before = await request(server, `/session/${encodeURIComponent(sessionId)}/message`)
    const baselineAssistants = assistantMessages(before.body).length
    const result = await request(server, `/session/${encodeURIComponent(sessionId)}/prompt_async`, {
      method: "POST",
      body: JSON.stringify({
        agent: "build",
        tools: { bash: true },
        ...(modelSelection(model) ? { model: modelSelection(model) } : {}),
        parts: [{ type: "text", text }],
      }),
    }, true, 10_000)
    if (result.status !== 200 && result.status !== 204) return { ...result, durationMs: Date.now() - started }
    const completion = await waitForTurn(server, sessionId, baselineAssistants, timeoutMs)
    const responseText = assistantText(completion.message)
    const diagnostic = assistantDiagnostic(completion.message)
    return {
      ...result,
      durationMs: Date.now() - started,
      completed: completion.completed,
      responseText,
      providerBlocker: blockerFrom(diagnostic),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      status: 0,
      body: null,
      text: "",
      durationMs: Date.now() - started,
      timedOut: /timeout|abort/i.test(message),
      error: message,
    }
  }
}

async function startEventStream(server: ServerHandle, sessionId: string, workspace: string) {
  const controller = new AbortController()
  const headers = { authorization: basicAuth(server.username, server.password) }
  const url = new URL("/event", server.baseUrl)
  url.searchParams.set("directory", workspace)
  const response = await withTimeout(async (timeoutSignal) => {
    const signal = AbortSignal.any([controller.signal, timeoutSignal])
    return await fetch(url, { headers, signal })
  }, 10_000)
  if (!response.ok || !response.body) {
    controller.abort()
    throw new Error(`event_stream_http_${response.status}`)
  }
  const accumulator = new EventAccumulator(sessionId)
  const decoder = new SseDecoder()
  const consume = (async () => {
    const reader = response.body!.getReader()
    try {
      while (true) {
        const next = await reader.read()
        if (next.done) break
        for (const frame of decoder.push(next.value)) accumulator.accept(frame.data)
      }
      for (const frame of decoder.finish()) accumulator.accept(frame.data)
    } catch (error) {
      if (!controller.signal.aborted) throw error
    } finally {
      reader.releaseLock()
    }
  })()
  return {
    close: async () => {
      controller.abort()
      await consume.catch(() => undefined)
    },
    summary: () => accumulator.summary(),
  }
}

async function fixtureCheck(): Promise<SpikeCheck> {
  const started = Date.now()
  const fixtures = JSON.parse(await readFile(path.join(SPIKE_DIRECTORY, "fixtures", "protocol-events.json"), "utf8")) as Array<{ event: unknown }>
  const accumulator = new EventAccumulator("session_fixture")
  for (const fixture of fixtures) accumulator.accept(fixture.event)
  const summary = accumulator.summary()
  const pass = summary.textEvents > 0
    && ["started", "completed", "failed"].every((phase) => summary.toolPhases.includes(phase as "started" | "completed" | "failed"))
    && summary.usageEvents > 0
    && summary.unknownEventTypes.length > 0
    && classifyEvent("not-json").kind === "unknown"
  return {
    name: "protocol_fixture_compatibility",
    status: pass ? "pass" : "fail",
    durationMs: Date.now() - started,
    observed: summary,
  }
}

async function runCandidate(candidate: OpenCodeCandidate, evidenceDirectory: string, model: string) {
  const runId = randomUUID()
  const startedAt = new Date().toISOString()
  const runRoot = path.join(os.tmpdir(), "coworkany-opencode-spike", `${candidate.kind}-${runId}`)
  const workspace = path.join(runRoot, "workspace-中文 空格")
  try {
  await mkdir(workspace, { recursive: true })
  await writeFile(path.join(workspace, "opencode.json"), `${JSON.stringify({
    $schema: "https://opencode.ai/config.json",
    autoupdate: false,
    share: "disabled",
    permission: { "*": "allow" },
  }, null, 2)}\n`, "utf8")

  const checks: SpikeCheck[] = [await fixtureCheck()]
  const isolatedRuntime = await prepareIsolatedRuntime(workspace, model)
  checks.push({
    name: "model_provider_preflight",
    status: model && isolatedRuntime.modelConfigured && isolatedRuntime.credentialConfigured ? "pass" : "blocked",
    durationMs: 0,
    ...(!model ? { blocker: "explicit_model_not_selected" } : !isolatedRuntime.modelConfigured ? { blocker: "provider_configuration_unavailable" } : !isolatedRuntime.credentialConfigured ? { blocker: "provider_credentials_unavailable" } : {}),
    observed: { model: model || "default", providerConfigured: isolatedRuntime.modelConfigured, credentialsConfigured: isolatedRuntime.credentialConfigured },
  })
  const versionResult = spawnSync(candidate.path, ["--version"], { encoding: "utf8", timeout: 15_000, windowsHide: true })
  const version = (versionResult.stdout || versionResult.stderr || "unknown").trim().split(/\r?\n/u)[0] ?? "unknown"
  checks.push({
    name: "candidate_version",
    status: versionResult.status === 0 && version !== "unknown" ? "pass" : "fail",
    durationMs: 0,
    observed: { version, exitCode: versionResult.status },
  })

  let server: ServerHandle | null = null
  let firstProcess: Record<string, unknown> = {}
  let protocol: Record<string, unknown> = {}
  try {
    const startupStarted = Date.now()
    server = await startServer(candidate.path, workspace, isolatedRuntime)
    checks.push({
      name: "random_loopback_basic_auth_start",
      status: server.port > 0 && server.username.startsWith("spike-") && server.password.length >= 32 ? "pass" : "fail",
      durationMs: Date.now() - startupStarted,
      observed: { hostname: "127.0.0.1", portSelection: "ephemeral-random", username: "[generated]", password: "[redacted]", mdns: "default-disabled", cors: "not-enabled" },
    })

    const healthStarted = Date.now()
    const health = await request(server, "/global/health")
    checks.push({ name: "health", status: health.status === 200 ? "pass" : "fail", durationMs: Date.now() - healthStarted, observed: { status: health.status } })

    const unauthStarted = Date.now()
    const unauthList = await request(server, "/session", {}, false)
    const unauthCreate = await request(server, "/session", { method: "POST", body: "{}" }, false)
    checks.push({
      name: "unauthenticated_rejection",
      status: unauthList.status === 401 && unauthCreate.status === 401 ? "pass" : "fail",
      durationMs: Date.now() - unauthStarted,
      observed: { sessionListStatus: unauthList.status, sessionCreateStatus: unauthCreate.status },
    })

    const createStarted = Date.now()
    const created = await request(server, "/session", { method: "POST", body: JSON.stringify({ title: `desktop-spike-${runId}` }) }, true, 30_000)
    const sessionId = sessionIdFrom(created.body)
    checks.push({
      name: "session_create",
      status: created.status === 200 && Boolean(sessionId) ? "pass" : "fail",
      durationMs: Date.now() - createStarted,
      observed: { status: created.status, sessionIdPresent: Boolean(sessionId) },
    })
    if (!sessionId) throw new Error(`session_create_failed_http_${created.status}`)

    let eventStream: Awaited<ReturnType<typeof startEventStream>> | null = null
    const streamStarted = Date.now()
    try {
      eventStream = await startEventStream(server, sessionId, workspace)
      checks.push({ name: "event_stream_connect", status: "pass", durationMs: Date.now() - streamStarted })
    } catch (error) {
      checks.push({ name: "event_stream_connect", status: "not-supported", durationMs: Date.now() - streamStarted, detail: error instanceof Error ? error.message : String(error) })
    }

    const firstPrompt = await prompt(server, sessionId, "Reply with exactly SPIKE_TURN_ONE. Do not use tools.", model)
    const firstBlocker = firstPrompt.providerBlocker ?? blockerFrom(firstPrompt.error ?? firstPrompt.body)
    checks.push({
      name: "prompt_turn_1",
      status: firstPrompt.completed && firstPrompt.responseText?.includes("SPIKE_TURN_ONE") ? "pass" : firstBlocker ? "blocked" : "fail",
      durationMs: firstPrompt.durationMs,
      ...(firstBlocker ? { blocker: firstBlocker.code, detail: firstBlocker.diagnostic } : {}),
      observed: { status: firstPrompt.status, completed: Boolean(firstPrompt.completed), markerPresent: firstPrompt.responseText?.includes("SPIKE_TURN_ONE") ?? false, timedOut: Boolean(firstPrompt.timedOut), model: model || "default" },
    })

    const secondPrompt = await prompt(server, sessionId, "Use the bash tool to run `node -e \"console.log('SPIKE_TOOL_OK')\"`, then reply with exactly SPIKE_TURN_TWO.", model)
    const secondBlocker = secondPrompt.providerBlocker ?? blockerFrom(secondPrompt.error ?? secondPrompt.body)
    const messages = await request(server, `/session/${encodeURIComponent(sessionId)}/message`)
    const messageItems = Array.isArray(messages.body) ? messages.body : []
    const userMessages = messageItems.filter((item) => item && typeof item === "object" && (item as { info?: { role?: unknown } }).info?.role === "user").length
    checks.push({
      name: "prompt_turn_2_same_session",
      status: secondPrompt.completed && secondPrompt.responseText?.includes("SPIKE_TURN_TWO") && userMessages >= 2 ? "pass" : secondBlocker || firstBlocker ? "blocked" : "fail",
      durationMs: secondPrompt.durationMs,
      ...(secondBlocker ? { blocker: secondBlocker.code, detail: secondBlocker.diagnostic } : firstBlocker ? { blocker: firstBlocker.code } : {}),
      observed: { status: secondPrompt.status, completed: Boolean(secondPrompt.completed), markerPresent: secondPrompt.responseText?.includes("SPIKE_TURN_TWO") ?? false, sameSessionUserMessages: userMessages, model: model || "default" },
    })

    const abortText = "Use the bash tool to run `node -e \"setTimeout(() => console.log('SPIKE_ABORT_TOO_LATE'), 30000)\"`. Do not finish before the command exits."
    let abortPromptSettled = false
    const abortBefore = await request(server, `/session/${encodeURIComponent(sessionId)}/message`)
    const abortBaseline = assistantMessages(abortBefore.body).length
    const abortSubmit = await request(server, `/session/${encodeURIComponent(sessionId)}/prompt_async`, {
      method: "POST",
      body: JSON.stringify({
        agent: "build",
        tools: { bash: true },
        ...(modelSelection(model) ? { model: modelSelection(model) } : {}),
        parts: [{ type: "text", text: abortText }],
      }),
    })
    const abortPrompt: Promise<PromptResult> = waitForTurn(server, sessionId, abortBaseline, 40_000).then((completion): PromptResult => {
      abortPromptSettled = true
      return {
        status: abortSubmit.status,
        body: completion.message,
        text: assistantText(completion.message),
        durationMs: 0,
        completed: completion.completed,
        providerBlocker: blockerFrom(assistantDiagnostic(completion.message)),
      }
    }).catch((error): PromptResult => ({ status: 0, body: null, text: "", durationMs: 0, error: error instanceof Error ? error.message : String(error) }))
    const activeTool = await waitForTool(server, sessionId, 15_000, undefined, true).catch(() => null)
    const activeAtAbort = Boolean(activeTool) && !abortPromptSettled && await sessionBusy(server, sessionId).catch(() => false)
    const abortStarted = Date.now()
    const abortResponse = await request(server, `/session/${encodeURIComponent(sessionId)}/abort`, { method: "POST" })
    checks.push({
      name: "abort_endpoint",
      status: abortResponse.status === 200 ? "pass" : "fail",
      durationMs: Date.now() - abortStarted,
      observed: { status: abortResponse.status },
    })
    const abortOutcome = await Promise.race([
      abortPrompt.then((result) => ({ settled: true, result })),
      new Promise<{ settled: false }>((resolve) => setTimeout(() => resolve({ settled: false }), 5_000)),
    ])
    const terminalTool = activeTool
      ? await waitForTool(server, sessionId, 5_000, activeTool.partId, false, true).catch(() => null)
      : null
    const toolStopped = Boolean(terminalTool && !["pending", "running"].includes(terminalTool.status))
    const abortBlocker = abortOutcome.settled ? abortOutcome.result.providerBlocker ?? blockerFrom(abortOutcome.result.error ?? abortOutcome.result.body) : null
    checks.push({
      name: "abort_active_prompt",
      status: activeAtAbort && abortResponse.status === 200 && abortOutcome.settled && toolStopped ? "pass" : abortBlocker || firstBlocker ? "blocked" : "fail",
      durationMs: Date.now() - abortStarted,
      ...(abortBlocker ? { blocker: abortBlocker.code, detail: abortBlocker.diagnostic } : !activeAtAbort && firstBlocker ? { blocker: firstBlocker.code } : {}),
      observed: {
        activeAtAbort,
        settledWithinFiveSeconds: abortOutcome.settled,
        tool: activeTool?.tool ?? null,
        toolPartIdPresent: Boolean(activeTool?.partId),
        toolStatusAtAbort: activeTool?.status ?? null,
        toolStatusAfterAbort: terminalTool?.status ?? null,
        toolStopped,
      },
    })

    await new Promise((resolve) => setTimeout(resolve, 500))
    if (eventStream) {
      await eventStream.close()
      const summary = eventStream.summary()
      protocol = { eventSummary: summary }
      const promptsBlocked = Boolean(firstBlocker || secondBlocker)
      checks.push({ name: "stream_text", status: summary.textEvents > 0 ? "pass" : promptsBlocked ? "blocked" : "fail", durationMs: 0, ...(promptsBlocked && summary.textEvents === 0 ? { blocker: (firstBlocker ?? secondBlocker)!.code } : {}), observed: { count: summary.textEvents, characters: summary.textCharacters } })
      checks.push({ name: "tool_events", status: summary.toolPhases.includes("started") && summary.toolPhases.includes("completed") ? "pass" : promptsBlocked ? "blocked" : "fail", durationMs: 0, ...(promptsBlocked ? { blocker: (firstBlocker ?? secondBlocker)!.code } : {}), observed: { tools: summary.tools, phases: summary.toolPhases } })
      checks.push({ name: "usage_events", status: summary.usageEvents > 0 ? "pass" : promptsBlocked ? "blocked" : "fail", durationMs: 0, ...(promptsBlocked ? { blocker: (firstBlocker ?? secondBlocker)!.code } : {}), observed: { count: summary.usageEvents } })
    } else {
      for (const name of ["stream_text", "tool_events", "usage_events"]) checks.push({ name, status: "not-supported", durationMs: 0, blocker: "event_stream_not_supported" })
    }

    const initialPort = server.port
    const processExitStarted = Date.now()
    firstProcess = await stopServer(server)
    checks.push({ name: "process_exit", status: firstProcess.exited ? "pass" : "fail", durationMs: Date.now() - processExitStarted, observed: { exitCode: firstProcess.exitCode, signal: firstProcess.signal } })
    server = null

    const restartStarted = Date.now()
    const restarted = await startServer(candidate.path, workspace, isolatedRuntime)
    try {
      const restartHealth = await request(restarted, "/global/health")
      const restartUnauth = await request(restarted, "/session", {}, false)
      checks.push({
        name: "restart",
        status: restartHealth.status === 200 && restartUnauth.status === 401 ? "pass" : "fail",
        durationMs: Date.now() - restartStarted,
        observed: { newRandomPort: restarted.port !== initialPort, healthStatus: restartHealth.status, unauthenticatedStatus: restartUnauth.status },
      })
    } finally {
      const restartedProcess = await stopServer(restarted)
      firstProcess = { ...firstProcess, restartProcess: restartedProcess }
    }
  } catch (error) {
    checks.push({
      name: "harness_completion",
      status: "fail",
      durationMs: 0,
      detail: error instanceof Error ? error.message : String(error),
    })
  } finally {
    if (server) {
      firstProcess = await stopServer(server)
      server = null
    }
  }

  const finishedAt = new Date().toISOString()
  const executableSha256 = await sha256File(candidate.path)
  const fixturePath = path.join(SPIKE_DIRECTORY, "fixtures", "protocol-events.json")
  const fixtureStat = await stat(fixturePath)
  const evidence = buildEvidence({
    runId,
    candidate: { kind: candidate.kind, version, executableSha256 },
    startedAt,
    finishedAt,
    checks,
    process: firstProcess,
    protocol,
    artifacts: [{
      path: "fixtures/protocol-events.json",
      sizeBytes: fixtureStat.size,
      sha256: await sha256File(fixturePath),
    }],
  })
  const redacted = redactEvidence(evidence, {
    userRoots: [os.homedir(), SPIKE_DIRECTORY, runRoot],
  })
  const outputPath = path.join(evidenceDirectory, `${candidate.kind}.json`)
  await writeFile(outputPath, `${JSON.stringify(redacted, null, 2)}\n`, "utf8")
  const evidenceSha256 = await sha256File(outputPath)
  return { outputPath, evidenceSha256, evidence: redacted as ReturnType<typeof buildEvidence> }
  } finally {
    await rm(runRoot, { recursive: true, force: true })
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const evidenceDirectory = path.resolve(String(args["evidence-dir"] || path.join(SPIKE_DIRECTORY, "evidence")))
  const privateVersion = String(args["private-version"] || DEFAULT_PRIVATE_VERSION)
  const model = String(args.model || process.env.OPENCODE_SPIKE_MODEL || "")
  await mkdir(evidenceDirectory, { recursive: true })
  const detected = discoverOpenCodeCandidates(SPIKE_DIRECTORY, privateVersion)
  const runnable = detected.filter((candidate) => candidate.runnable !== false && candidate.kind !== "desktop-gui")
  const requestedKind = typeof args.candidate === "string" ? args.candidate : "all"
  const selected = requestedKind === "all" ? runnable : runnable.filter((candidate) => candidate.kind === requestedKind)
  if (selected.length === 0) throw new Error(`no_runnable_opencode_candidate:${requestedKind}`)

  const results = []
  for (const candidate of selected) results.push(await runCandidate(candidate, evidenceDirectory, model))
  const summary = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    candidates: await Promise.all(detected.map(async (candidate) => ({
      kind: candidate.kind,
      runnable: candidate.runnable !== false,
      reason: candidate.reason,
      executableSha256: existsSync(candidate.path) ? await sha256File(candidate.path) : null,
    }))),
    results: results.map((result) => ({
      candidate: result.evidence.candidate,
      verdict: result.evidence.verdict,
      evidenceFile: path.basename(result.outputPath),
      evidenceSha256: result.evidenceSha256,
    })),
  }
  await writeFile(path.join(evidenceDirectory, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8")
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exitCode = 1
})
