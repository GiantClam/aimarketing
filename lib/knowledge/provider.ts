import "server-only"

import type {
  EnterpriseKnowledgeContext,
  KnowledgeChunk,
  KnowledgeDataset,
  KnowledgeDocument,
  KnowledgeSource,
  KnowledgeSourceTestResult,
} from "@/lib/knowledge/types"

export type KnowledgeRetrieveParams = {
  enterpriseId: number
  query: string
  queryVariants?: string[]
  preferredScopes?: string[]
  preferredDatasetIds?: number[]
  topK?: number
  scoreThreshold?: number
  platform?: string
  mode?: string
}

export type KnowledgeDatasetCreateParams = {
  source: KnowledgeSource
  name: string
  category: KnowledgeDocument["category"]
  chunkMethod?: string | null
  description?: string | null
}

export type KnowledgeDocumentUploadParams = {
  source: KnowledgeSource
  dataset: KnowledgeDataset
  fileName: string
  contentType: string
  bytes: Buffer
}

export type KnowledgeWebDocumentUploadParams = {
  source: KnowledgeSource
  dataset: KnowledgeDataset
  name: string
  url: string
}

export type KnowledgeDocumentReparseParams = {
  source: KnowledgeSource
  dataset: KnowledgeDataset
  document: KnowledgeDocument
}

export type KnowledgeDocumentDeleteParams = {
  source: KnowledgeSource
  dataset: KnowledgeDataset
  document: KnowledgeDocument
}

export type KnowledgeDocumentMigrateParams = {
  source: KnowledgeSource
  fromDataset: KnowledgeDataset
  toDataset: KnowledgeDataset
  document: KnowledgeDocument
}

export type KnowledgeRemoteDocument = {
  providerDocumentId: string
  status: KnowledgeDocument["status"]
  chunkCount: number
  parseSummary?: Record<string, unknown> | null
  errorMessage?: string | null
}

export type KnowledgeRemoteChunk = {
  providerChunkId: string | null
  chunkIndex: number
  content: string
  excerpt: string
  keywords: string[]
  questions: string[]
  tags: string[]
  status: KnowledgeChunk["status"]
}

export interface KnowledgeProvider {
  readonly type: KnowledgeSource["providerType"]

  testConnection(source: KnowledgeSource): Promise<KnowledgeSourceTestResult>

  retrieve(params: KnowledgeRetrieveParams): Promise<EnterpriseKnowledgeContext | null>

  listRemoteDatasets?(source: KnowledgeSource): Promise<Array<{ id: string; name: string }>>

  createRemoteDataset?(params: KnowledgeDatasetCreateParams): Promise<{
    providerDatasetId: string
    name: string
  }>

  listRemoteDocuments?(params: {
    source: KnowledgeSource
    dataset: KnowledgeDataset
  }): Promise<KnowledgeRemoteDocument[]>

  listRemoteChunks?(params: {
    source: KnowledgeSource
    dataset: KnowledgeDataset
    document: KnowledgeDocument
  }): Promise<KnowledgeRemoteChunk[]>

  uploadDocument?(params: KnowledgeDocumentUploadParams): Promise<{
    providerDocumentId: string | null
    status: KnowledgeDocument["status"]
    parseSummary?: Record<string, unknown> | null
  }>

  uploadWebDocument?(params: KnowledgeWebDocumentUploadParams): Promise<{
    providerDocumentId: string | null
    status: KnowledgeDocument["status"]
    parseSummary?: Record<string, unknown> | null
  }>

  reparseDocument?(params: KnowledgeDocumentReparseParams): Promise<{
    status: KnowledgeDocument["status"]
    parseSummary?: Record<string, unknown> | null
  }>

  migrateDocument?(params: KnowledgeDocumentMigrateParams): Promise<{
    providerDocumentId: string | null
    status: KnowledgeDocument["status"]
    parseSummary?: Record<string, unknown> | null
  }>

  deleteDocument?(params: KnowledgeDocumentDeleteParams): Promise<void>
}
