// lib/ai-entry/message-parts/types.ts

export type AiEntryStreamSourceResult = {
  title?: string
  url?: string
  snippet?: string
  provider?: string
}

export type AiEntryStreamVariantResult = {
  key?: string
  name?: string
  summary?: string | null
}

export type AiEntryStreamRecommendedTemplateResult = {
  rank?: number | null
  templateId?: string
  templateLabel?: string | null
  styleName?: string | null
}

/** SSE 事件在 reducer 输入侧的宽松类型（镜像 ai-entry-workspace.tsx 的 ChatStreamApiResponse + PPT 防御字段）。 */
export type AiEntryStreamEvent = {
  event?: string
  conversation_id?: string
  answer?: string
  provider?: string
  provider_model?: string
  artifact?: {
    kind?: string
    title?: string
    fileName?: string
    artifactId?: number | null
    previewUrl?: string | null
    downloadUrl?: string | null
    workLibraryHref?: string | null
  } | null
  data?: {
    toolName?: string
    toolCallId?: string
    status?: "hit" | "miss" | "failed"
    snippetCount?: number
    datasetCount?: number
    message?: string
    args?: { query?: string; intent?: string } | null
    result?: {
      ok?: boolean
      query?: string
      results?: AiEntryStreamSourceResult[]
      error?: { code?: string; message?: string }
      previewSessionId?: string
      title?: string
      recommendedVariantKey?: string | null
      fileName?: string
      artifactId?: number | null
      workLibraryHref?: string
      previewUrl?: string | null
      downloadUrl?: string | null
      variants?: AiEntryStreamVariantResult[]
      recommendedTemplates?: AiEntryStreamRecommendedTemplateResult[]
    } | null
    validation?: {
      ok?: boolean
      checks?: Array<{ code?: string; ok?: boolean; message?: string }>
    } | null
  } | null
}

export type ReasoningPart = {
  type: "reasoning"
  id: string
  text: string
  status: "running" | "done"
}

export type ToolCallPart = {
  type: "tool-call"
  id: string
  toolName: string
  toolCallId: string
  args: unknown
  state: "input-streaming" | "output-available" | "output-error" | "output-blocked"
  output?: unknown
}

export type SourcePart = {
  type: "source"
  id: string
  sourceType: "url" | "document"
  title: string | null
  url: string | null
  snippet: string | null
}

export type ArtifactPart = {
  type: "artifact"
  id: string
  artifactType: "pptx" | "html" | "image" | "generic"
  artifactId: number | null
  title: string | null
  fileName: string | null
  previewUrl: string | null
  downloadUrl: string | null
  workHref: string | null
  status: "created"
}

export type ReportPart = {
  type: "report"
  id: string
  reportType: "ppt-preview" | "seo"
  previewSessionId?: string | null
  defaultVariantKey?: string | null
  variantKeys?: string[]
  title: string | null
  variants: Array<{ key: string; name: string; summary: string | null }>
}

export type TemplateRecommendationPart = {
  type: "template-recommendation"
  id: string
  defaultTemplateId: string | null
  templates: Array<{ templateId: string; labels: string[] }>
}

export type ValidationPart = {
  type: "validation"
  id: string
  status: "passed" | "failed" | "warning"
  checks: Array<{ code: string; ok: boolean; message: string }>
}

export type WorkflowStatusPart = {
  type: "workflow-status"
  id: string
  runId: string
  slug: string
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled"
  nodes: Array<{ id: string; label: string; status: string; outputRef: string | null }>
}

export type TaskProgressStep = {
  type: string
  toolName?: string
  status: "running" | "completed" | "failed" | "waiting" | "info"
  detail?: string | null
  at: number
}

export type TaskProgressPart = {
  type: "task-progress"
  id: string
  status: "running" | "done"
  steps: TaskProgressStep[]
}

/** phase 1 不填充 text（正文由 message.content 承载）；类型保留以对齐 AI SDK v5。 */
export type TextPart = { type: "text"; id: string; text: string }

export type MessagePart =
  | TextPart
  | ReasoningPart
  | ToolCallPart
  | SourcePart
  | ArtifactPart
  | ReportPart
  | TemplateRecommendationPart
  | ValidationPart
  | WorkflowStatusPart
  | TaskProgressPart
