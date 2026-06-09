export const CHAT_ATTACHMENT_MAX_BYTES = 4 * 1024 * 1024
export const CHAT_ATTACHMENT_MAX_TEXT_CHARS = 80_000

export type ChatAttachmentKind = "text" | "image" | "document"

export type ChatAttachmentErrorCode =
  | "unsupported_file_type"
  | "file_too_large"
  | "empty_file"
  | "docx_parse_failed"
  | "pdf_parse_failed"
  | "pdf_encrypted"
  | "pdf_no_extractable_text"
  | "extracted_text_empty"

export type SupportedChatDocumentExtension = "txt" | "md" | "docx" | "pdf"

export type UnifiedChatAttachment = {
  id: string
  name: string
  mediaType: string
  originalMediaType?: string
  size: number
  kind: ChatAttachmentKind
  text?: string
  dataUrl?: string
  textCharCount?: number
  truncated?: boolean
  errorCode?: ChatAttachmentErrorCode
}

export type ExtractChatAttachmentInput = {
  fileName: string
  mediaType?: string
  bytes: Buffer
  maxTextChars?: number
}

export type ExtractedChatAttachmentText = {
  fileName: string
  extension: SupportedChatDocumentExtension
  mediaType: "text/plain"
  originalMediaType: string
  size: number
  text: string
  textCharCount: number
  truncated: boolean
}

export class ChatAttachmentError extends Error {
  readonly code: ChatAttachmentErrorCode
  readonly status: number

  constructor(code: ChatAttachmentErrorCode, message: string = code, status = 400) {
    super(message)
    this.name = "ChatAttachmentError"
    this.code = code
    this.status = status
  }
}
