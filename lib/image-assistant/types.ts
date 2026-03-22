export type ImageAssistantTaskType = "generate" | "edit" | "blend" | "style_transfer" | "mask_edit"
export type ImageAssistantSizePreset = "1:1" | "4:5" | "3:4" | "4:3" | "16:9" | "9:16"
export type ImageAssistantResolution = "512" | "1K" | "2K" | "4K"
export type ImageAssistantUsagePresetId = "website_banner" | "social_cover" | "ad_poster" | "avatar"
export type ImageAssistantOrientation = "landscape" | "portrait"
export type ImageAssistantBriefField =
  | "usage"
  | "orientation"
  | "resolution"
  | "ratio"
  | "goal"
  | "subject"
  | "style"
  | "composition"
export type ImageAssistantSkillId = "graphic-design-brief" | "canvas-design-execution" | "enterprise-ad-image"
export type ImageAssistantToolName =
  | "collect_brief"
  | "analyze_references"
  | "select_skill"
  | "compose_generation_prompt"
export type ImageAssistantTurnOutcome = "needs_clarification" | "generated"

export type ImageAssistantSessionStatus = "active" | "archived" | "deleted"
export type ImageAssistantMode = "chat" | "canvas"
export type ImageAssistantVersionKind = "ai_generate" | "ai_edit" | "canvas_save" | "restore"
export type ImageAssistantAssetType = "reference" | "generated" | "canvas_snapshot" | "mask" | "sticker" | "export"
export type ImageAssistantReferenceRole = "subject" | "background" | "style" | "logo"

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

export type ImageAssistantConversationPage = {
  data: ImageAssistantConversationSummary[]
  has_more: boolean
  limit: number
  next_cursor: string | null
}

export type ImageAssistantBrief = {
  usage_preset: ImageAssistantUsagePresetId | ""
  usage_label: string
  orientation: ImageAssistantOrientation | ""
  resolution: ImageAssistantResolution | ""
  size_preset: ImageAssistantSizePreset | ""
  ratio_confirmed: boolean
  goal: string
  subject: string
  style: string
  composition: string
  constraints: string
}

export type ImageAssistantPromptOption = {
  id: string
  label: string
  description?: string
  emphasis?: "card" | "button"
  prompt_value?: string
  brief_patch?: Partial<ImageAssistantBrief>
  size_preset?: ImageAssistantSizePreset | null
  resolution?: ImageAssistantResolution | null
}

export type ImageAssistantPromptQuestion = {
  id: string
  title: string
  description?: string
  display: "cards" | "buttons"
  options: ImageAssistantPromptOption[]
}

export type ImageAssistantGuidedSelection = {
  source_message_id?: string | null
  question_id?: string | null
  option_id?: string | null
}

export type ImageAssistantSkillSelection = {
  id: ImageAssistantSkillId
  label: string
  stage: "briefing" | "execution"
}

export type ImageAssistantToolTrace = {
  name: ImageAssistantToolName
  status: "completed" | "skipped"
  summary: string
}

export type ImageAssistantOrchestrationState = {
  brief: ImageAssistantBrief
  missing_fields: ImageAssistantBriefField[]
  turn_count: number
  max_turns: number
  ready_for_generation: boolean
  planner_strategy?: "rule_shortcut" | "text_model" | "heuristic"
  schema_version?: string
  prompt_version?: string
  extraction_confidence?: number
  extraction_conflicts?: string[]
  selected_skill: ImageAssistantSkillSelection
  tool_traces: ImageAssistantToolTrace[]
  reference_count: number
  recommended_mode: "generate" | "edit"
  follow_up_question: string | null
  prompt_questions: ImageAssistantPromptQuestion[]
  generated_prompt: string | null
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

export type ImageAssistantMessagePage = {
  data: ImageAssistantMessage[]
  has_more: boolean
  limit: number
  next_cursor: string | null
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
  meta?: Record<string, unknown> | null
  created_at: number
  candidates: ImageAssistantCandidate[]
}

export type ImageAssistantVersionPage = {
  data: ImageAssistantVersionSummary[]
  has_more: boolean
  limit: number
  next_cursor: string | null
}

export type ImageAssistantMessage = {
  id: string
  session_id: string
  role: "user" | "assistant" | "system"
  message_type: "prompt" | "result_summary" | "error" | "note"
  task_type: ImageAssistantTaskType | null
  content: string
  created_version_id: string | null
  request_payload?: Record<string, unknown> | null
  response_payload?: Record<string, unknown> | null
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

export type ImageAssistantSessionDetailMeta = {
  messages_total: number
  messages_loaded: number
  messages_has_more: boolean
  messages_next_cursor: string | null
  versions_total: number
  versions_loaded: number
  versions_has_more: boolean
  versions_next_cursor: string | null
}

export type ImageAssistantSessionDetail = {
  session: ImageAssistantConversationSummary
  messages: ImageAssistantMessage[]
  versions: ImageAssistantVersionSummary[]
  assets: ImageAssistantAsset[]
  canvas_document: ImageAssistantCanvasDocument | null
  meta: ImageAssistantSessionDetailMeta
}

export type ImageAssistantGenerateResult = {
  conversation: ImageAssistantConversationSummary
  message_id: string
  version_id: string | null
  version_meta?: Record<string, unknown> | null
  text_summary: string
  candidates: ImageAssistantCandidate[]
  outcome: ImageAssistantTurnOutcome
  follow_up_message_id?: string | null
  orchestration?: ImageAssistantOrchestrationState | null
  max_reference_attachments?: number
}
