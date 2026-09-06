import { desktopUIMessageText, type DesktopArtifactData, type DesktopUIMessage, type DesktopUIMessagePart } from "@coworkany/workbench-client";

function isImageArtifact(artifact: DesktopArtifactData) {
  return artifact.mimeType.startsWith("image/");
}

function isLegacyWriterImageRequest(message: DesktopUIMessage | undefined) {
  const content = message && message.role === "user" ? desktopUIMessageText(message).trim() : "";
  return content === "基于上一轮文案生成配图，并将图片产物写入当前项目目录。"
    || content === "Generate images for the previous article and write the image artifacts into the current project directory.";
}

function legacyArticleMessageId(messages: readonly DesktopUIMessage[], imageResultIndex: number) {
  if (!isLegacyWriterImageRequest(messages[imageResultIndex - 1])) return undefined;
  for (let index = imageResultIndex - 2; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "assistant" || !desktopUIMessageText(message).trim()) continue;
    if (message.parts.some((part) => part.type === "data-artifact" && isImageArtifact(part.data))) continue;
    return message.id;
  }
  return undefined;
}

/**
 * Finds persisted image artifacts generated explicitly for one Writer article.
 * The association is stored on the generation result, so history remains
 * correct after switching conversations or restarting the desktop app.
 */
export function writerImageArtifactsForArticle(messages: readonly DesktopUIMessage[], articleMessageId: string): DesktopArtifactData[] {
  const artifacts = messages.flatMap((message, index) => {
    const linked = message.parts.some((part): part is Extract<DesktopUIMessagePart, { type: "data-writerAsset" }> => part.type === "data-writerAsset" && part.data.articleMessageId === articleMessageId && part.data.kind === "image");
    if (!linked && legacyArticleMessageId(messages, index) !== articleMessageId) return [];
    return message.parts.flatMap((part): DesktopArtifactData[] => part.type === "data-artifact" && isImageArtifact(part.data) ? [part.data] : []);
  });
  return [...new Map(artifacts.map((artifact) => [artifact.id, artifact])).values()];
}
