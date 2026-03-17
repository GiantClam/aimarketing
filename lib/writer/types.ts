import type { WriterLanguage, WriterMode, WriterPlatform } from "@/lib/writer/config"

export type WriterConversationStatus = "drafting" | "text_ready" | "image_generating" | "ready" | "failed"
export type WriterRetrievalStrategy =
  | "rewrite_only"
  | "enterprise_grounded"
  | "fresh_external"
  | "hybrid_grounded"

export type WriterTurnDiagnostics = {
  retrievalStrategy: WriterRetrievalStrategy
  enterpriseKnowledgeEnabled: boolean
  enterpriseKnowledgeUsed: boolean
  enterpriseDatasetCount: number
  enterpriseSourceCount: number
  enterpriseDatasets: string[]
  enterpriseTitles: string[]
  webResearchUsed: boolean
  webResearchStatus: "ready" | "disabled" | "timed_out" | "unavailable" | "skipped"
  webSourceCount: number
}

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
  diagnostics?: WriterTurnDiagnostics | null
  inputs: {
    contents: string
  }
  created_at: number
}

export type WriterConversationPage = {
  data: WriterConversationSummary[]
  has_more: boolean
  limit: number
  next_cursor: string | null
}

export type WriterMessagePage = {
  data: WriterHistoryEntry[]
  limit: number
  has_more: boolean
  next_cursor: string | null
  conversation: WriterConversationSummary | null
}
