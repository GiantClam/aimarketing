import type { CoreMessage } from "ai"

export type IncomingMessage = {
  role?: string
  content?: unknown
}

export type IncomingAttachment = {
  name?: unknown
  mediaType?: unknown
  dataUrl?: unknown
  text?: unknown
  size?: unknown
}

export type EmbeddedAttachmentSummary = {
  name: string
  mediaType: string
}

type MessageTextPartLike =
  | string
  | {
      type?: unknown
      text?: unknown
    }

type AttachmentContextPart =
  | { type: "text"; text: string }
  | { type: "image"; image: string; mediaType: string }

export function normalizeAttachmentList(input: unknown) {
  if (!Array.isArray(input)) return []
  return input
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null
      const source = item as IncomingAttachment
      const name = typeof source.name === "string" ? source.name.trim().slice(0, 180) : "attachment"
      const mediaType = typeof source.mediaType === "string" ? source.mediaType.trim().toLowerCase() : ""
      const dataUrl = typeof source.dataUrl === "string" ? source.dataUrl.trim() : ""
      const text = typeof source.text === "string" ? source.text.slice(0, 80_000) : ""
      const size = typeof source.size === "number" && Number.isFinite(source.size) ? source.size : 0
      if (!mediaType || (!dataUrl && !text)) return null
      return { name, mediaType, dataUrl, text, size }
    })
    .filter((item): item is { name: string; mediaType: string; dataUrl: string; text: string; size: number } => Boolean(item))
    .slice(0, 4)
}

function extractDataUrlPayload(dataUrl: string) {
  const match = /^data:([^;,]+);base64,(.+)$/i.exec(dataUrl)
  if (!match) return null
  return {
    mediaType: match[1].toLowerCase(),
    data: match[2],
  }
}

export function buildAttachmentContextParts(attachments: ReturnType<typeof normalizeAttachmentList>): AttachmentContextPart[] {
  const parts: AttachmentContextPart[] = []
  for (const attachment of attachments) {
    if (attachment.mediaType.startsWith("text/") || attachment.mediaType.includes("json") || attachment.mediaType.includes("csv")) {
      parts.push({
        type: "text",
        text: `\n\n[Uploaded file: ${attachment.name} / ${attachment.mediaType}]\n${attachment.text || "(No readable text content was provided.)"}`,
      })
      continue
    }

    if (attachment.mediaType.startsWith("image/")) {
      const payload = extractDataUrlPayload(attachment.dataUrl)
      if (!payload) continue
      parts.push({
        type: "image",
        image: payload.data,
        mediaType: payload.mediaType,
      })
    }
  }
  return parts
}

export function normalizeMessages(messages: IncomingMessage[], attachments: ReturnType<typeof normalizeAttachmentList> = []) {
  const normalized: CoreMessage[] = []
  for (const [index, item] of messages.entries()) {
    const role = item?.role === "assistant" ? "assistant" : item?.role === "user" ? "user" : null
    const content = typeof item?.content === "string" ? item.content.trim() : ""
    if (!role || !content) continue
    if (role === "user" && index === messages.length - 1 && attachments.length > 0) {
      normalized.push({
        role,
        content: [
          { type: "text", text: content },
          ...buildAttachmentContextParts(attachments),
        ],
      } as CoreMessage)
      continue
    }
    normalized.push({ role, content })
  }
  return normalized
}

export function normalizeMessageTextContent(content: unknown) {
  if (typeof content === "string") return content.trim()
  if (!Array.isArray(content)) return ""

  return (content as MessageTextPartLike[])
    .map((part) => {
      if (typeof part === "string") return part
      if (part && typeof part === "object" && "text" in part) {
        return typeof part.text === "string" ? part.text : ""
      }
      return ""
    })
    .join(" ")
    .trim()
}

const EMBEDDED_ATTACHMENT_BLOCK_PATTERN =
  /\n*\[Uploaded file:\s*([^\]/\n]+?)\s*\/\s*([^\]\n]+?)\]\n[\s\S]*?(?=(?:\n*\[Uploaded file:\s*[^\]/\n]+?\s*\/\s*[^\]\n]+?\]\n)|$)/g

export function extractEmbeddedAttachmentSummaries(content: string | null | undefined) {
  const normalized = typeof content === "string" ? content : ""
  if (!normalized.trim()) {
    return {
      content: normalized,
      attachments: [] as EmbeddedAttachmentSummary[],
    }
  }

  const attachments: EmbeddedAttachmentSummary[] = []
  const strippedContent = normalized.replace(
    EMBEDDED_ATTACHMENT_BLOCK_PATTERN,
    (_block, rawName: string, rawMediaType: string) => {
      const name = rawName.trim()
      const mediaType = rawMediaType.trim().toLowerCase()
      if (name && mediaType) {
        attachments.push({ name, mediaType })
      }
      return ""
    },
  )

  return {
    content: strippedContent.replace(/\n{3,}/g, "\n\n").trim(),
    attachments,
  }
}

export function extractUserIntentFromMessageContent(content: unknown) {
  const normalized = normalizeMessageTextContent(content)
  if (!normalized) return ""
  return extractEmbeddedAttachmentSummaries(normalized).content
}
