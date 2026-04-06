import type { WriterConversationSummary, WriterTurnDiagnostics } from "@/lib/writer/types"

const WRITER_STREAM_CHUNK_SIZE = 120
const WRITER_STREAM_CHUNK_DELAY_MS = 16

function buildSseEvent(payload: Record<string, unknown>) {
  return `data: ${JSON.stringify(payload)}\n\n`
}

function splitAnswerIntoChunks(answer: string) {
  const normalized = answer.trim()
  if (!normalized) return []

  const chunks: string[] = []
  for (let index = 0; index < normalized.length; index += WRITER_STREAM_CHUNK_SIZE) {
    chunks.push(normalized.slice(index, index + WRITER_STREAM_CHUNK_SIZE))
  }
  return chunks
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function createWriterSseStream({
  answer,
  conversation,
  taskId,
  outcome,
  diagnostics,
}: {
  answer: string
  conversation: WriterConversationSummary
  taskId: string
  outcome?: "needs_clarification" | "draft_ready"
  diagnostics?: WriterTurnDiagnostics
}) {
  const encoder = new TextEncoder()
  const chunks = splitAnswerIntoChunks(answer)

  return new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encoder.encode(
          buildSseEvent({
            event: "conversation_init",
            task_id: taskId,
            conversation_id: conversation.id,
            conversation,
          }),
        ),
      )

      for (const chunk of chunks) {
        controller.enqueue(
          encoder.encode(
            buildSseEvent({
              event: "message",
              task_id: taskId,
              conversation_id: conversation.id,
              answer: chunk,
            }),
          ),
        )
        await sleep(WRITER_STREAM_CHUNK_DELAY_MS)
      }

      controller.enqueue(
        encoder.encode(
          buildSseEvent({
            event: "message_end",
            task_id: taskId,
            conversation_id: conversation.id,
            answer,
            conversation,
            outcome,
            diagnostics,
          }),
        ),
      )
      controller.close()
    },
  })
}
