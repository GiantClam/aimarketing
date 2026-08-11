export type LegacySsePayload = Record<string, unknown>

export type LegacySseTerminalState = {
  terminal: "success" | "error" | null
}

function parseFrame(frame: string): LegacySsePayload | null {
  const data = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .join("\n")

  if (!data || data === "[DONE]") return null

  try {
    return JSON.parse(data) as LegacySsePayload
  } catch {
    throw new Error("ai_entry_stream_invalid_frame")
  }
}

function updateTerminalState(payload: LegacySsePayload, state: LegacySseTerminalState) {
  if (payload.event === "error") state.terminal = "error"
  if (payload.event === "message_end" || payload.event === "done") state.terminal = "success"
}

export async function* readLegacySse(
  response: Response,
  state: LegacySseTerminalState,
): AsyncGenerator<LegacySsePayload> {
  if (!response.body) throw new Error("ai_entry_stream_missing_body")

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const frames = buffer.split(/\r?\n\r?\n/)
      buffer = frames.pop() || ""
      for (const frame of frames) {
        const payload = parseFrame(frame)
        if (!payload) continue
        updateTerminalState(payload, state)
        yield payload
      }
    }

    buffer += decoder.decode()
    if (buffer.trim()) {
      const payload = parseFrame(buffer)
      if (payload) {
        updateTerminalState(payload, state)
        yield payload
      }
    }
  } finally {
    reader.releaseLock()
  }

  if (state.terminal === null) throw new Error("ai_entry_stream_incomplete")
}
