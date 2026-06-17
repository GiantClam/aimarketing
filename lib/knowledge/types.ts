export type KnowledgeProviderType = "ragflow" | "dify" | "hybrid"

export type KnowledgeScope =
  | "general"
  | "brand"
  | "product"
  | "case-study"
  | "compliance"
  | "campaign"

export type EnterpriseKnowledgeScope = KnowledgeScope

export type KnowledgeSourceStatus = "healthy" | "degraded" | "unavailable"

export type KnowledgeDocumentStatus =
  | "uploaded"
  | "parsing"
  | "ready"
  | "failed"
  | "reparsing"
  | "disabled"

export type KnowledgeChunkStatus = "active" | "disabled" | "edited"

export type KnowledgeSourceType = "file" | "url"

export type KnowledgeBindingTarget =
  | "ai_entry"
  | "writer"
  | "advisor_external_knowledge"

export type KnowledgeChunkingConfig = {
  method: string
  chunkSize: number
  overlap: number
  delimiter: string
  parser?: string | null
}

export type KnowledgeRetrievalConfig = {
  similarityThreshold: number
  topK: number
  topN?: number | null
  rerankEnabled: boolean
  metadataFilter?: Record<string, unknown> | null
}

export type KnowledgeSource = {
  id: number | null
  enterpriseId: number
  providerType: KnowledgeProviderType
  name: string
  baseUrl: string
  apiKey: string | null
  status: KnowledgeSourceStatus
  enabled: boolean
  lastCheckedAt: string | null
  lastError: string | null
}

export type KnowledgeSourceClientState = Omit<KnowledgeSource, "apiKey"> & {
  apiKeyConfigured: boolean
}

export type KnowledgeDataset = {
  id: number
  enterpriseId: number
  sourceId: number
  providerDatasetId: string | null
  name: string
  category: KnowledgeScope
  priority: number
  enabled: boolean
  chunkingConfig: KnowledgeChunkingConfig | null
  retrievalConfig: KnowledgeRetrievalConfig | null
  createdAt: string | null
  updatedAt: string | null
}

export type KnowledgeDocument = {
  id: number
  enterpriseId: number
  sourceId: number | null
  datasetId: number | null
  providerDocumentId: string | null
  name: string
  sourceType: KnowledgeSourceType
  sourceUrl: string | null
  category: KnowledgeScope
  status: KnowledgeDocumentStatus
  chunkCount: number
  parseSummary: Record<string, unknown> | null
  chunkingOverride: KnowledgeChunkingConfig | null
  errorMessage: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type KnowledgeChunk = {
  id: number
  documentId: number
  providerChunkId: string | null
  chunkIndex: number
  content: string
  excerpt: string
  keywords: string[]
  questions: string[]
  tags: string[]
  status: KnowledgeChunkStatus
  createdAt: string | null
  updatedAt: string | null
}

export type KnowledgeBinding = {
  id: number
  datasetId: number
  targetType: KnowledgeBindingTarget
  enabled: boolean
  createdAt: string | null
  updatedAt: string | null
}

export type EnterpriseKnowledgeSnippet = {
  datasetId: string
  datasetName: string
  scope: KnowledgeScope
  inferredScope?: KnowledgeScope
  score: number | null
  title: string
  content: string
}

export type EnterpriseKnowledgeContext = {
  source: KnowledgeProviderType
  datasetsUsed: Array<{
    datasetId: string
    datasetName: string
    scope: KnowledgeScope
  }>
  snippets: EnterpriseKnowledgeSnippet[]
}

export type KnowledgeOverview = {
  source: {
    provider: KnowledgeProviderType
    status: KnowledgeSourceStatus
    label: string
    lastCheckedAt: string | null
    name: string | null
  }
  stats: {
    documentCount: number
    processingCount: number
    chunkCount: number
    lastUpdatedAt: string | null
  }
  datasets: {
    total: number
    enabled: number
  }
}

export type KnowledgeRecentActivity = {
  id: string
  documentId: number | null
  title: string
  status: KnowledgeDocumentStatus
  at: string | null
}

export type KnowledgeRetrievalHit = {
  chunkId: string
  score: number | null
  datasetId: string
  datasetName: string
  documentId: string | null
  documentName: string | null
  content: string
  tags: string[]
}

export type KnowledgeSourceTestResult = {
  ok: boolean
  status: KnowledgeSourceStatus
  message: string
  checkedAt: string
  remoteDatasetCount?: number
}
