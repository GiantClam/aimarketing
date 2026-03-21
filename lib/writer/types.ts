import type { WriterContentType, WriterLanguage, WriterMode, WriterPlatform } from "@/lib/writer/config"

export type WriterConversationStatus = "drafting" | "text_ready" | "image_generating" | "ready" | "failed"
export type WriterRetrievalStrategy =
  | "rewrite_only"
  | "no_retrieval"
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
  routing?: WriterRoutingDecision | null
}

export type WriterRoutingDecision = {
  contentType: WriterContentType
  targetPlatform: string
  outputForm: string
  lengthTarget: string
  renderPlatform: WriterPlatform
  renderMode: WriterMode
  selectedSkillId: string
  selectedSkillLabel: string
}

export type WriterPreloadedBrief = Partial<{
  topic: string
  audience: string
  objective: string
  tone: string
  constraints: string
}>

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
