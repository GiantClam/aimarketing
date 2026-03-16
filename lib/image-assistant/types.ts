export type ImageAssistantTaskType = "generate" | "edit" | "blend" | "style_transfer" | "mask_edit"

export type ImageAssistantSessionStatus = "active" | "archived" | "deleted"
export type ImageAssistantMode = "chat" | "canvas"
export type ImageAssistantVersionKind = "ai_generate" | "ai_edit" | "canvas_save" | "restore"
export type ImageAssistantAssetType = "reference" | "generated" | "canvas_snapshot" | "mask" | "sticker" | "export"
export type ImageAssistantReferenceRole = "subject" | "background" | "style" | "logo"

export type ImageAssistantSizePreset = "1:1" | "4:5" | "3:4" | "16:9" | "9:16"
export type ImageAssistantQualityMode = "high" | "low_cost"

export type ImageAssistantConversationSummary = {
  id: string
  name: string
  status: ImageAssistantSessionStatus
  current_mode: ImageAssistantMode
  cover_asset_url: string | null
  current_version_id: string | null
  current_canvas_document_id: string | null
  created_at: number
  updated_at: number
}

export type ImageAssistantAsset = {
  id: string
  session_id: string | null
  asset_type: ImageAssistantAssetType
  reference_role: ImageAssistantReferenceRole | null
  url: string | null
  mime_type: string
  file_size: number
  width: number | null
  height: number | null
  status: "pending" | "ready" | "failed"
  meta?: Record<string, unknown> | null
  created_at: number
}

export type ImageAssistantCandidate = {
  id: string
  version_id: string
  asset_id: string
  candidate_index: number
  is_selected: boolean
  url: string | null
}

export type ImageAssistantVersionSummary = {
  id: string
  parent_version_id: string | null
  version_kind: ImageAssistantVersionKind
  status: "processing" | "ready" | "failed"
  provider: string | null
  model: string | null
  prompt_text: string | null
  selected_candidate_id: string | null
  created_at: number
  candidates: ImageAssistantCandidate[]
}

export type ImageAssistantMessage = {
  id: string
  session_id: string
  role: "user" | "assistant" | "system"
  message_type: "prompt" | "result_summary" | "error" | "note"
  task_type: ImageAssistantTaskType | null
  content: string
  created_version_id: string | null
  created_at: number
}

export type ImageAssistantLayerType = "background" | "text" | "shape" | "image" | "paint"
export type ImageAssistantShapeType = "rect" | "circle" | "arrow" | "line"

export type ImageAssistantLayerTransform = {
  x: number
  y: number
  width: number
  height: number
  rotation?: number
}

export type ImageAssistantLayerStyle = {
  fill?: string
  stroke?: string
  strokeWidth?: number
  opacity?: number
  fontSize?: number
  fontFamily?: string
  fontWeight?: number
  color?: string
  borderRadius?: number
}

export type ImageAssistantLayerContent = {
  text?: string
  shapeType?: ImageAssistantShapeType
}

export type ImageAssistantLayer = {
  id: string
  layer_type: ImageAssistantLayerType
  name: string
  z_index: number
  visible: boolean
  locked: boolean
  transform: ImageAssistantLayerTransform
  style: ImageAssistantLayerStyle | null
  content: ImageAssistantLayerContent | null
  asset_id: string | null
  asset_url?: string | null
}

export type ImageAssistantCanvasDocument = {
  id: string
  session_id: string
  base_version_id: string | null
  width: number
  height: number
  background_asset_id: string | null
  revision: number
  status: "draft" | "saved" | "failed"
  updated_at: number
  layers: ImageAssistantLayer[]
}

export type ImageAssistantSessionDetail = {
  session: ImageAssistantConversationSummary
  messages: ImageAssistantMessage[]
  versions: ImageAssistantVersionSummary[]
  assets: ImageAssistantAsset[]
  canvas_document: ImageAssistantCanvasDocument | null
}

export type ImageAssistantGenerateResult = {
  conversation: ImageAssistantConversationSummary
  message_id: string
  version_id: string
  text_summary: string
  candidates: ImageAssistantCandidate[]
}
