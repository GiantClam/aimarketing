import type { AgentRuntimeEvent, AgentRuntimeInput } from "./contracts"

// Dashi tool events can carry rendered SVG/HTML payloads in a single NDJSON
// record. Keep the per-record guard below the total 8 MiB stdout budget while
// allowing normal presentation-sized events to pass through intact.
const MAX_LINE_BYTES = 2 * 1024 * 1024
const MAX_DIAGNOSTIC_BYTES = 1024
const MAX_TOOL_NAME_LENGTH = 80

function safeDiagnostic(value: unknown, fallback: string) {
  const text = typeof value === "string"
    ? [...value].map((character) => {
        const code = character.charCodeAt(0)
        return code < 32 || code === 127 ? " " : character
      }).join("").trim()
    : ""
  return (text || fallback).slice(0, MAX_DIAGNOSTIC_BYTES)
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null
}

function readString(...values: unknown[]) {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim() || null
}

function readFiniteNumber(...values: unknown[]) {
  return values.find((value): value is number => typeof value === "number" && Number.isFinite(value)) ?? null
}

function sanitizeToolName(value: unknown) {
  const name = typeof value === "string" ? value.trim() : ""
  if (!name) return "tool"
  return name.replace(/[^a-zA-Z0-9._:-]/g, "_").slice(0, MAX_TOOL_NAME_LENGTH) || "tool"
}

function getNested(record: Record<string, unknown> | null, key: string) {
  return record?.[key]
}

export function buildOpenCodeCommand(input: Pick<AgentRuntimeInput, "modelHint">): { command: string; args: string[] } {
  const args = ["run", "--format", "json"]
  const modelHint = typeof input.modelHint === "string" ? input.modelHint.trim() : ""
  const normalizedModel = modelHint.includes("/")
    ? modelHint
    : /^deepseek(?:[-_.]|$)/iu.test(modelHint)
      ? `deepseek/${modelHint}`
      : modelHint === "gpt-5.4" || modelHint === "grok-4.5"
        ? `pptoken/${modelHint}`
        : /^minimax[-_]/iu.test(modelHint)
          ? `minimax/${modelHint}`
        : modelHint
  if (normalizedModel) args.push("--model", normalizedModel.slice(0, 200))
  return { command: "opencode", args }
}

function parseOpenCodeEvent(runId: string, value: unknown): AgentRuntimeEvent[] {
  const record = readRecord(value)
  if (!record) {
    return [{ event: "runtime_warning", code: "unknown_event", message: "OpenCode emitted a non-object event.", runId }]
  }

  const type = readString(record.type) || "unknown"
  const part = readRecord(record.part)
  const state = readRecord(part?.state)
  const error = readRecord(record.error)

  if (type === "text") {
    const text = readString(part?.text, record.text, getNested(record, "delta"))
    return text ? [{ event: "text_delta", delta: text, runId }] : []
  }

  if (type === "tool_use") {
    const phaseValue = readString(state?.status, part?.status, record.status)?.toLowerCase()
    const phase = phaseValue === "error" || phaseValue === "failed" ? "failed" : phaseValue === "completed" || phaseValue === "success" ? "completed" : "started"
    return [{
      event: "tool_event",
      tool: sanitizeToolName(readString(part?.tool, part?.name, record.tool, record.toolName)),
      phase,
      ...(readString(state?.title, state?.message, part?.message, record.message) ? { message: safeDiagnostic(readString(state?.title, state?.message, part?.message, record.message), "") } : {}),
      runId,
    }]
  }

  if (type === "step_finish") {
    const tokens = readRecord(part?.tokens) || readRecord(record.tokens)
    const costUsd = readFiniteNumber(part?.cost, record.cost, part?.costUsd, record.costUsd)
    const inputTokens = readFiniteNumber(tokens?.input, tokens?.inputTokens, part?.inputTokens, record.inputTokens)
    const outputTokens = readFiniteNumber(tokens?.output, tokens?.outputTokens, part?.outputTokens, record.outputTokens)
    if (inputTokens === null && outputTokens === null && costUsd === null) return []
    return [{
      event: "usage",
      ...(inputTokens === null ? {} : { inputTokens }),
      ...(outputTokens === null ? {} : { outputTokens }),
      ...(costUsd === null ? {} : { costUsd }),
      runId,
    }]
  }

  if (type === "error") {
    const message = safeDiagnostic(
      readString(error?.message, getNested(readRecord(error?.data), "message"), record.message, error?.name),
      "OpenCode runtime failed.",
    )
    return [{ event: "runtime_error", code: "opencode_error", message, retryable: true, runId }]
  }

  if (type === "step_start") return []

  return [{
    event: "runtime_warning",
    code: "unknown_event",
    message: `Ignored OpenCode event type: ${safeDiagnostic(type, "unknown")}`,
    runId,
  }]
}

export function createOpenCodeEventParser(runId: string) {
  let buffer = ""
  let malformedLines = 0
  let finished = false
  let fatal = false

  const parseLine = (line: string) => {
    const normalized = line.trim()
    if (!normalized) return []
    if (new TextEncoder().encode(normalized).byteLength > MAX_LINE_BYTES) {
      malformedLines += 1
      const warning: AgentRuntimeEvent = {
        event: "runtime_warning",
        code: malformedLines >= 3 ? "fatal_parse_error" : "oversized_line",
        message: "OpenCode emitted an oversized event line.",
        runId,
      }
      if (warning.code === "fatal_parse_error") fatal = true
      return [warning]
    }

    try {
      const events = parseOpenCodeEvent(runId, JSON.parse(normalized))
      malformedLines = 0
      return events
    } catch {
      malformedLines += 1
      const event = {
        event: malformedLines >= 3 ? "runtime_error" : "runtime_warning",
        code: malformedLines >= 3 ? "fatal_parse_error" : "malformed_json_line",
        message: malformedLines >= 3 ? "OpenCode emitted too many malformed event lines." : "OpenCode emitted a malformed event line.",
        ...(malformedLines >= 3 ? { retryable: false } : {}),
        runId,
      } as AgentRuntimeEvent
      if (event.event === "runtime_error") fatal = true
      return [event]
    }
  }

  return {
    push(chunk: string) {
      if (finished || !chunk) return []
      buffer += chunk
      if (new TextEncoder().encode(buffer).byteLength > MAX_LINE_BYTES * 2) {
        buffer = ""
        malformedLines += 1
        const event = {
          event: malformedLines >= 3 ? "runtime_error" : "runtime_warning",
          code: malformedLines >= 3 ? "fatal_parse_error" : "oversized_line",
          message: "OpenCode emitted an oversized incomplete event line.",
          ...(malformedLines >= 3 ? { retryable: false } : {}),
          runId,
        } as AgentRuntimeEvent
        if (event.event === "runtime_error") fatal = true
        return [event]
      }

      const events: AgentRuntimeEvent[] = []
      let newlineIndex = buffer.indexOf("\n")
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).replace(/\r$/, "")
        buffer = buffer.slice(newlineIndex + 1)
        events.push(...parseLine(line))
        newlineIndex = buffer.indexOf("\n")
      }
      return events
    },
    finish() {
      if (finished) return []
      finished = true
      const events = buffer.trim() ? parseLine(buffer) : []
      buffer = ""
      if (fatal || events.some((event) => event.event === "runtime_error" && event.code === "fatal_parse_error")) return events
      events.push({ event: "done", runId })
      return events
    },
  }
}

export const opencodeRuntimeDefinition = {
  provider: "opencode" as const,
  executableNames: ["opencode-cli", "opencode"],
  stdinMode: "text" as const,
  buildArgs(input: Pick<AgentRuntimeInput, "modelHint">) {
    return buildOpenCodeCommand(input).args
  },
  capabilities: {
    streaming: true,
    cancellation: true,
    artifacts: true,
    nativeSessionResume: true,
  },
}
