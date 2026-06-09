import {
  CHAT_ATTACHMENT_MAX_BYTES,
  ChatAttachmentError,
  type SupportedChatDocumentExtension,
} from "./types"

const EXTENSION_MEDIA_TYPES: Record<SupportedChatDocumentExtension, string[]> = {
  txt: ["text/plain", "text/*", ""],
  md: ["text/markdown", "text/plain", "text/x-markdown", "text/*", ""],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/octet-stream", ""],
  pdf: ["application/pdf", "application/octet-stream", ""],
}

export const SUPPORTED_CHAT_DOCUMENT_EXTENSIONS = Object.keys(EXTENSION_MEDIA_TYPES) as SupportedChatDocumentExtension[]

export function normalizeFileName(fileName: string) {
  return fileName.trim().replace(/[/\\]/g, "_").slice(0, 180) || "attachment"
}

export function getChatDocumentExtension(fileName: string): SupportedChatDocumentExtension | null {
  const match = /\.([A-Za-z0-9]+)$/.exec(fileName.trim())
  if (!match) return null
  const extension = match[1].toLowerCase()
  return SUPPORTED_CHAT_DOCUMENT_EXTENSIONS.includes(extension as SupportedChatDocumentExtension)
    ? (extension as SupportedChatDocumentExtension)
    : null
}

export function isSupportedChatDocumentFile(fileName: string, mediaType?: string) {
  const extension = getChatDocumentExtension(fileName)
  if (!extension) return false
  return isAllowedMediaTypeForExtension(extension, mediaType)
}

export function isAllowedMediaTypeForExtension(extension: SupportedChatDocumentExtension, mediaType?: string) {
  const normalized = (mediaType || "").trim().toLowerCase()
  const allowed = EXTENSION_MEDIA_TYPES[extension]
  if (allowed.includes(normalized)) return true
  if (extension === "txt" || extension === "md") return normalized.startsWith("text/")
  return false
}

export function validateChatAttachmentFile(input: {
  fileName: string
  mediaType?: string
  size: number
  maxBytes?: number
}) {
  const maxBytes = input.maxBytes ?? CHAT_ATTACHMENT_MAX_BYTES
  if (input.size <= 0) {
    throw new ChatAttachmentError("empty_file", "Attachment is empty")
  }
  if (input.size > maxBytes) {
    throw new ChatAttachmentError("file_too_large", "Attachment is too large", 413)
  }

  const extension = getChatDocumentExtension(input.fileName)
  if (!extension || !isAllowedMediaTypeForExtension(extension, input.mediaType)) {
    throw new ChatAttachmentError("unsupported_file_type", "Unsupported attachment type")
  }

  return extension
}
