import type { WriterLanguage, WriterMode, WriterPlatform } from "@/lib/writer/config"

export type WriterConversationStatus = "drafting" | "text_ready" | "image_generating" | "ready" | "failed"

export type WriterConversationSummary = {
  id: string
  name: string
  status: WriterConversationStatus
  platform: WriterPlatform
  mode: WriterMode
  language: WriterLanguage
  images_requested: boolean
  created_at: number
  updated_at: number
}

export type WriterHistoryEntry = {
  id: string
  conversation_id: string
  query: string
  answer: string
  inputs: {
    contents: string
  }
  created_at: number
}

export type WriterConversationPage = {
  data: WriterConversationSummary[]
  has_more: boolean
  limit: number
}

export type WriterMessagePage = {
  data: WriterHistoryEntry[]
  limit: number
  has_more: boolean
  next_cursor: string | null
  conversation: WriterConversationSummary | null
}
