import { ImageAssistantWorkspace } from "@/components/image-assistant/image-assistant-workspace"

export default async function ImageAssistantSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const resolved = await params
  return <ImageAssistantWorkspace initialSessionId={resolved.sessionId} />
}
