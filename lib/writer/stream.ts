import type { WriterConversationSummary } from "@/lib/writer/types"

function buildSseEvent(payload: Record<string, unknown>) {
  return `data: ${JSON.stringify(payload)}\n\n`
}

export function createWriterSseStream({
  answer,
  conversation,
  taskId,
}: {
  answer: string
  conversation: WriterConversationSummary
  taskId: string
}) {
  const encoder = new TextEncoder()
  const splitIndex = Math.max(1, Math.floor(answer.length * 0.55))
  const chunks = [answer.slice(0, splitIndex), answer.slice(splitIndex)].filter(Boolean)

  return new ReadableStream({
    start(controller) {
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
      }

      controller.enqueue(
        encoder.encode(
          buildSseEvent({
            event: "message_end",
            task_id: taskId,
            conversation_id: conversation.id,
            conversation,
          }),
        ),
      )
      controller.close()
    },
  })
}
