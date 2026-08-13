import type {
  NavigationAdapter,
  WorkbenchArtifact,
  WorkbenchClient,
  WorkbenchConversation,
  WorkbenchMessage,
  WorkbenchRun,
  WorkbenchRunEvent,
  WorkbenchRunRequest,
  WorkbenchUsage,
} from "../../packages/workbench-client/src/index"

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

type WebWorkbenchClientOptions = {
  navigation: NavigationAdapter
  fetch?: FetchLike
  apiBase?: string
  createId?: (prefix: string) => string
  fileUrl?: (relativePath: string) => string
}

type PendingRun = {
  request: WorkbenchRunRequest
  run: WorkbenchRun
}

type AiEntryStreamEvent = {
  event?: string
  answer?: string
  error?: string
  provider_model?: string
  artifact?: Record<string, unknown>
  data?: Record<string, unknown>
}

function createId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`
}

function toIso(value: unknown) {
  const seconds = typeof value === "number" && Number.isFinite(value) ? value : 0
  return new Date(seconds > 1_000_000_000_000 ? seconds : seconds * 1_000).toISOString()
}

function messageRole(value: unknown): WorkbenchMessage["role"] {
  return value === "assistant" || value === "system" || value === "tool" ? value : "user"
}

function consumeSseEvents(buffer: string) {
  const blocks = buffer.split(/\r?\n\r?\n/u)
  const rest = blocks.pop() ?? ""
  const events: AiEntryStreamEvent[] = []
  for (const block of blocks) {
    const payload = block
      .split(/\r?\n/u)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim()
    if (!payload || payload === "[DONE]") continue
    try { events.push(JSON.parse(payload) as AiEntryStreamEvent) } catch { /* malformed frames remain server diagnostics */ }
  }
  return { events, rest }
}

async function jsonOrError(response: Response) {
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null
  if (response.ok) return payload
  const message = typeof payload?.error === "string" ? payload.error : `http_${response.status}`
  throw new Error(`web_workbench_request_failed:${message}`)
}

function eventArtifact(value: Record<string, unknown> | undefined): WorkbenchArtifact | null {
  if (!value) return null
  const relativePath = [value.relativePath, value.relative_path, value.fileName, value.file_name, value.title]
    .find((item): item is string => typeof item === "string" && item.trim().length > 0)
  if (!relativePath) return null
  return {
    id: String(value.artifactId ?? value.artifact_id ?? relativePath),
    relativePath,
    title: typeof value.title === "string" && value.title.trim() ? value.title : relativePath,
    mimeType: typeof value.mimeType === "string" ? value.mimeType : typeof value.mime_type === "string" ? value.mime_type : "application/octet-stream",
    byteLength: typeof value.byteLength === "number" ? value.byteLength : typeof value.byte_length === "number" ? value.byte_length : 0,
    sha256: typeof value.sha256 === "string" ? value.sha256 : "",
  }
}

/**
 * SaaS composition adapter. It deliberately owns `/api` knowledge and is
 * kept outside `workbench-client`, whose types remain host-neutral.
 */
export function createWebWorkbenchClient(options: WebWorkbenchClientOptions): WorkbenchClient {
  const fetchImpl = options.fetch ?? globalThis.fetch
  const apiBase = options.apiBase ?? "/api/ai"
  const makeId = options.createId ?? createId
  const pendingRuns = new Map<string, PendingRun>()
  const controllers = new Map<string, AbortController>()
  const usages = new Map<string, { conversationId: string; usage: WorkbenchUsage }>()
  const openFile = (relativePath: string) => {
    const target = (options.fileUrl ?? ((path) => path))(relativePath)
    if (typeof window !== "undefined") window.open(target, "_blank", "noopener,noreferrer")
    else options.navigation.go(target)
  }

  return {
    navigation: options.navigation,
    files: { open: async (relativePath) => openFile(relativePath), reveal: async (relativePath) => openFile(relativePath) },
    conversations: {
      async list() {
        const payload = await jsonOrError(await fetchImpl(`${apiBase}/conversations?limit=50`, { credentials: "same-origin" }))
        const data = Array.isArray(payload?.data) ? payload.data : []
        return data.map((row): WorkbenchConversation => {
          const value = row as Record<string, unknown>
          return { id: String(value.id), title: String(value.name ?? "New chat"), updatedAt: toIso(value.updated_at), messageCount: 0 }
        })
      },
      async create(title = "New chat") {
        const payload = await jsonOrError(await fetchImpl(`${apiBase}/conversations`, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ title }) }))
        const value = (payload?.data ?? payload ?? {}) as Record<string, unknown>
        return { id: String(value.id), title: String(value.name ?? title), updatedAt: toIso(value.updated_at), messageCount: 0 }
      },
      async messages(conversationId) {
        const payload = await jsonOrError(await fetchImpl(`${apiBase}/messages?conversation_id=${encodeURIComponent(conversationId)}&limit=200`, { credentials: "same-origin" }))
        const data = Array.isArray(payload?.data) ? payload.data : []
        return data.map((row): WorkbenchMessage => {
          const value = row as Record<string, unknown>
          return { id: String(value.id), conversationId: String(value.conversation_id ?? conversationId), role: messageRole(value.role), content: String(value.content ?? ""), createdAt: toIso(value.created_at) }
        })
      },
    },
    runs: {
      async start(request) {
        const run: WorkbenchRun = { id: makeId("web-run"), conversationId: request.conversationId, status: "queued", startedAt: new Date().toISOString() }
        pendingRuns.set(run.id, { request, run })
        return run
      },
      async cancel(runId) {
        controllers.get(runId)?.abort()
      },
      subscribe(runId, onEvent) {
        const pending = pendingRuns.get(runId)
        if (!pending) return () => undefined
        const controller = new AbortController()
        controllers.set(runId, controller)
        void streamRun({ apiBase, fetchImpl, pending, controller, onEvent, usages })
          .finally(() => { controllers.delete(runId); pendingRuns.delete(runId) })
        return () => controller.abort()
      },
    },
    usage: {
      async list(conversationId) {
        return [...usages.values()]
          .filter((entry) => !conversationId || entry.conversationId === conversationId)
          .map((entry) => entry.usage)
      },
    },
  }
}

async function streamRun(input: {
  apiBase: string
  fetchImpl: FetchLike
  pending: PendingRun
  controller: AbortController
  onEvent: (event: WorkbenchRunEvent) => void
  usages: Map<string, { conversationId: string; usage: WorkbenchUsage }>
}) {
  const { pending, controller, onEvent } = input
  try {
    onEvent({ type: "status", status: "running" })
    const response = await input.fetchImpl(`${input.apiBase}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      credentials: "same-origin",
      signal: controller.signal,
      body: JSON.stringify({
        stream: true,
        conversationId: pending.request.conversationId,
        messages: [{ role: "user", content: pending.request.prompt }],
        modelConfig: pending.request.model ? { modelId: pending.request.model, reasoningEffort: pending.request.reasoningEffort === "auto" ? undefined : pending.request.reasoningEffort } : undefined,
        skillConfig: pending.request.skillId ? { enabled: true, enabledSkillIds: [pending.request.skillId] } : undefined,
      }),
    })
    if (!response.ok) await jsonOrError(response)
    if (!response.body) throw new Error("web_workbench_stream_missing")
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let terminal = false
    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })
      const parsed = consumeSseEvents(buffer)
      buffer = parsed.rest
      for (const event of parsed.events) terminal ||= dispatchStreamEvent(event, pending, onEvent, input.usages)
      if (done) break
    }
    for (const event of consumeSseEvents(buffer).events) terminal ||= dispatchStreamEvent(event, pending, onEvent, input.usages)
    if (!terminal) onEvent({ type: "status", status: "interrupted" })
  } catch (_error) {
    if (controller.signal.aborted) onEvent({ type: "status", status: "cancelled" })
    else onEvent({ type: "status", status: "failed" })
  }
}

function dispatchStreamEvent(event: AiEntryStreamEvent, pending: PendingRun, onEvent: (event: WorkbenchRunEvent) => void, usages: Map<string, { conversationId: string; usage: WorkbenchUsage }>) {
  if (event.event === "message" && typeof event.answer === "string") onEvent({ type: "text", delta: event.answer })
  else if (event.event === "tool_call") onEvent({ type: "tool", tool: String(event.data?.toolName ?? "tool"), phase: "started" })
  else if (event.event === "tool_result") onEvent({ type: "tool", tool: String(event.data?.toolName ?? "tool"), phase: event.data?.result && (event.data.result as Record<string, unknown>).ok === false ? "failed" : "completed" })
  else if (event.event === "artifact_created") {
    const artifact = eventArtifact(event.artifact)
    if (artifact) onEvent({ type: "artifact", artifact })
  } else if (event.event === "usage") {
    const usage: WorkbenchUsage = { runId: pending.run.id, model: typeof event.provider_model === "string" ? event.provider_model : pending.request.model ?? "unknown", inputTokens: typeof event.data?.inputTokens === "number" ? event.data.inputTokens : undefined, outputTokens: typeof event.data?.outputTokens === "number" ? event.data.outputTokens : undefined }
    usages.set(pending.run.id, { conversationId: pending.run.conversationId, usage })
    onEvent({ type: "usage", usage })
  } else if (event.event === "message_end") {
    onEvent({ type: "status", status: "succeeded" })
    return true
  } else if (event.event === "error") {
    onEvent({ type: "status", status: "failed" })
    return true
  }
  return false
}
