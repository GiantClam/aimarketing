type WriterMemoryTelemetryTags = {
  agentType?: string
  memoryScopeHash?: string | null
  source?: string
}

type WriterMemoryTelemetryEventName =
  | "writer.memory.write.explicit"
  | "writer.memory.write.implicit"
  | "writer.memory.retrieve.hit"
  | "writer.soul.apply"
  | "writer.memory.delete"

export function emitWriterMemoryTelemetry(
  _name: WriterMemoryTelemetryEventName,
  _tags: WriterMemoryTelemetryTags = {},
) {
  // Phase 0 intentionally keeps telemetry as a no-op shell.
  return
}

