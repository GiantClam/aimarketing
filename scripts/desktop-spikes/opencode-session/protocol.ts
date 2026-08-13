export type ClassifiedEvent =
  | { kind: "text"; type: string; sessionId: string; delta: string; partId: string }
  | { kind: "tool"; type: string; sessionId: string; tool: string; phase: "started" | "completed" | "failed"; partId: string }
  | { kind: "usage"; type: string; sessionId: string; inputTokens?: number; outputTokens?: number; cost?: number }
  | { kind: "terminal"; type: string; sessionId: string; status: string }
  | { kind: "error"; type: string; sessionId: string; message: string }
  | { kind: "unknown"; type: string; sessionId: string }

export type SseFrame = {
  event?: string
  id?: string
  data: string
}

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null
}

function eventRecord(value: unknown): UnknownRecord | null {
  let candidate = value
  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate) as unknown
    } catch {
      return null
    }
  }
  const record = asRecord(candidate)
  if (!record) return null
  const data = asRecord(record.data)
  if (data && typeof data.type === "string") return data
  const payload = asRecord(record.payload)
  if (payload && typeof payload.type === "string") return payload
  return record
}

function eventSessionId(properties: UnknownRecord, part: UnknownRecord | null, info: UnknownRecord | null) {
  const candidates = [properties.sessionID, part?.sessionID, info?.sessionID]
  return candidates.find((candidate): candidate is string => typeof candidate === "string") ?? ""
}

export function classifyEvent(value: unknown): ClassifiedEvent {
  const event = eventRecord(value)
  if (!event || typeof event.type !== "string") return { kind: "unknown", type: "invalid-json", sessionId: "" }
  const type = event.type
  const properties = asRecord(event.properties) ?? {}
  const part = asRecord(properties.part)
  const info = asRecord(properties.info)
  const sessionId = eventSessionId(properties, part, info)

  if (type === "message.part.updated" && part?.type === "text") {
    const delta = typeof properties.delta === "string"
      ? properties.delta
      : typeof part.text === "string" ? part.text : ""
    return {
      kind: "text",
      type,
      sessionId,
      delta,
      partId: typeof part.id === "string" ? part.id : "",
    }
  }

  if (type === "message.part.updated" && part?.type === "tool") {
    const state = asRecord(part.state) ?? {}
    const phase = state.status === "completed" ? "completed" : state.status === "error" ? "failed" : "started"
    return {
      kind: "tool",
      type,
      sessionId,
      tool: typeof part.tool === "string" ? part.tool : "unknown",
      phase,
      partId: typeof part.id === "string" ? part.id : "",
    }
  }

  if (type === "message.updated") {
    const tokens = asRecord(info?.tokens) ?? {}
    return {
      kind: "usage",
      type,
      sessionId,
      ...(typeof tokens.input === "number" ? { inputTokens: tokens.input } : {}),
      ...(typeof tokens.output === "number" ? { outputTokens: tokens.output } : {}),
      ...(typeof info?.cost === "number" ? { cost: info.cost } : {}),
    }
  }

  if (type === "session.status") {
    const status = asRecord(properties.status)
    return {
      kind: "terminal",
      type,
      sessionId,
      status: typeof status?.type === "string" ? status.type : "unknown",
    }
  }

  if (type === "session.idle") return { kind: "terminal", type, sessionId, status: "idle" }

  if (type === "session.error") {
    const error = asRecord(properties.error) ?? {}
    const data = asRecord(error.data) ?? error
    return {
      kind: "error",
      type,
      sessionId,
      message: typeof data.message === "string" ? data.message.slice(0, 500) : "OpenCode session error",
    }
  }

  return { kind: "unknown", type, sessionId }
}

export class SseDecoder {
  readonly #decoder = new TextDecoder("utf-8", { fatal: false })
  #buffer = ""

  push(chunk: Uint8Array): SseFrame[] {
    this.#buffer += this.#decoder.decode(chunk, { stream: true })
    return this.#drain(false)
  }

  finish(): SseFrame[] {
    this.#buffer += this.#decoder.decode()
    return this.#drain(true)
  }

  #drain(flush: boolean): SseFrame[] {
    const frames: SseFrame[] = []
    while (true) {
      const match = /\r?\n\r?\n/u.exec(this.#buffer)
      if (!match || match.index === undefined) break
      const block = this.#buffer.slice(0, match.index)
      this.#buffer = this.#buffer.slice(match.index + match[0].length)
      const frame = this.#parse(block)
      if (frame) frames.push(frame)
    }
    if (flush && this.#buffer.trim()) {
      const frame = this.#parse(this.#buffer)
      this.#buffer = ""
      if (frame) frames.push(frame)
    }
    return frames
  }

  #parse(block: string): SseFrame | null {
    let event: string | undefined
    let id: string | undefined
    const data: string[] = []
    for (const line of block.split(/\r?\n/u)) {
      if (!line || line.startsWith(":")) continue
      const separator = line.indexOf(":")
      const field = separator < 0 ? line : line.slice(0, separator)
      const value = separator < 0 ? "" : line.slice(separator + 1).replace(/^ /u, "")
      if (field === "data") data.push(value)
      else if (field === "event") event = value
      else if (field === "id") id = value
    }
    if (data.length === 0) return null
    return { ...(event ? { event } : {}), ...(id ? { id } : {}), data: data.join("\n") }
  }
}

export type EventSummary = {
  observedEventTypes: string[]
  textEvents: number
  textCharacters: number
  textPreview: string
  toolPhases: Array<"started" | "completed" | "failed">
  tools: string[]
  usageEvents: number
  terminalEvents: number
  errorEvents: number
  errorMessages: string[]
  unknownEventTypes: string[]
}

export class EventAccumulator {
  readonly #sessionId: string
  readonly #events: ClassifiedEvent[] = []

  constructor(sessionId: string) {
    this.#sessionId = sessionId
  }

  accept(value: unknown) {
    const event = classifyEvent(value)
    if (event.sessionId && this.#sessionId && event.sessionId !== this.#sessionId) return
    this.#events.push(event)
  }

  summary(): EventSummary {
    const text = this.#events.filter((event): event is Extract<ClassifiedEvent, { kind: "text" }> => event.kind === "text")
    const tools = this.#events.filter((event): event is Extract<ClassifiedEvent, { kind: "tool" }> => event.kind === "tool")
    const unknown = this.#events.filter((event): event is Extract<ClassifiedEvent, { kind: "unknown" }> => event.kind === "unknown")
    return {
      observedEventTypes: [...new Set(this.#events.map((event) => event.type))].sort(),
      textEvents: text.length,
      textCharacters: text.reduce((sum, event) => sum + event.delta.length, 0),
      textPreview: text.map((event) => event.delta).join("").slice(0, 600),
      toolPhases: tools.map((event) => event.phase),
      tools: [...new Set(tools.map((event) => event.tool))].sort(),
      usageEvents: this.#events.filter((event) => event.kind === "usage").length,
      terminalEvents: this.#events.filter((event) => event.kind === "terminal").length,
      errorEvents: this.#events.filter((event) => event.kind === "error").length,
      errorMessages: this.#events
        .filter((event): event is Extract<ClassifiedEvent, { kind: "error" }> => event.kind === "error")
        .map((event) => event.message.slice(0, 300)),
      unknownEventTypes: [...new Set(unknown.map((event) => event.type))].sort(),
    }
  }
}
