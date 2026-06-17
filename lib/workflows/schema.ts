export const WORKFLOW_NODE_TYPES = [
  "upload",
  "text_input",
  "writer",
  "llm_generate",
  "image_generate",
  "video_generate",
  "music_generate",
  "voice_synthesis",
  "audio_generate",
  "ppt_generate",
  "product_store",
] as const

export const WORKFLOW_VALUE_KINDS = ["text", "asset", "image", "video", "audio", "ppt"] as const

export type WorkflowNodeType = (typeof WORKFLOW_NODE_TYPES)[number]
export type WorkflowValueKind = (typeof WORKFLOW_VALUE_KINDS)[number]
export type WorkflowLocale = "zh" | "en"

export type WorkflowNodeInputName = "text" | "assets" | "images" | "videos" | "audios" | "presentations"

export type WorkflowNodeDefinition = {
  type: WorkflowNodeType
  title: string
  outputKinds: WorkflowValueKind[]
  acceptedInputKinds: WorkflowValueKind[]
}

export type WorkflowDefinitionNode = {
  nodeKey: string
  type: WorkflowNodeType
  title: string
  positionX: number
  positionY: number
  config: Record<string, unknown>
}

export type WorkflowDefinitionEdge = {
  sourceNodeKey: string
  targetNodeKey: string
  inputName?: string | null
}

const WORKFLOW_NODE_TITLE_CATALOG: Record<WorkflowNodeType, Record<WorkflowLocale, string>> = {
  upload: {
    zh: "上传",
    en: "Upload",
  },
  text_input: {
    zh: "文本输入",
    en: "Text Input",
  },
  writer: {
    zh: "文章写作",
    en: "Writer",
  },
  llm_generate: {
    zh: "大模型",
    en: "LLM Generate",
  },
  image_generate: {
    zh: "图片生成",
    en: "Image Generate",
  },
  video_generate: {
    zh: "视频生成",
    en: "Video Generate",
  },
  music_generate: {
    zh: "音乐生成",
    en: "Music Generate",
  },
  voice_synthesis: {
    zh: "语音合成",
    en: "Voice Synthesis",
  },
  audio_generate: {
    zh: "音频生成",
    en: "Audio Generate",
  },
  ppt_generate: {
    zh: "PPT 生成",
    en: "PPT Generate",
  },
  product_store: {
    zh: "作品库存储",
    en: "Work Library",
  },
}

const WORKFLOW_NODE_LEGACY_TITLES: Partial<Record<WorkflowNodeType, string[]>> = {
  llm_generate: ["文案生成"],
}

export const WORKFLOW_NODE_DEFINITIONS: Record<WorkflowNodeType, WorkflowNodeDefinition> = {
  upload: {
    type: "upload",
    title: "Upload",
    outputKinds: ["asset"],
    acceptedInputKinds: [],
  },
  text_input: {
    type: "text_input",
    title: "Text Input",
    outputKinds: ["text"],
    acceptedInputKinds: [],
  },
  writer: {
    type: "writer",
    title: "Writer",
    outputKinds: ["text"],
    acceptedInputKinds: ["text"],
  },
  llm_generate: {
    type: "llm_generate",
    title: "LLM Generate",
    outputKinds: ["text"],
    acceptedInputKinds: ["text"],
  },
  image_generate: {
    type: "image_generate",
    title: "Image Generate",
    outputKinds: ["image"],
    acceptedInputKinds: ["text", "image"],
  },
  video_generate: {
    type: "video_generate",
    title: "Video Generate",
    outputKinds: ["video"],
    acceptedInputKinds: ["text", "image", "video"],
  },
  music_generate: {
    type: "music_generate",
    title: "Music Generate",
    outputKinds: ["audio"],
    acceptedInputKinds: ["text", "audio"],
  },
  voice_synthesis: {
    type: "voice_synthesis",
    title: "Voice Synthesis",
    outputKinds: ["audio"],
    acceptedInputKinds: ["text"],
  },
  audio_generate: {
    type: "audio_generate",
    title: "Audio Generate",
    outputKinds: ["audio"],
    acceptedInputKinds: ["text", "audio"],
  },
  ppt_generate: {
    type: "ppt_generate",
    title: "PPT Generate",
    outputKinds: ["ppt"],
    acceptedInputKinds: ["text", "image"],
  },
  product_store: {
    type: "product_store",
    title: "Work Library",
    outputKinds: [],
    acceptedInputKinds: ["text", "asset", "image", "video", "audio", "ppt"],
  },
}

export function isWorkflowNodeType(value: string): value is WorkflowNodeType {
  return value in WORKFLOW_NODE_DEFINITIONS
}

export function isWorkflowValueKind(value: string): value is WorkflowValueKind {
  return (WORKFLOW_VALUE_KINDS as readonly string[]).includes(value)
}

export function getWorkflowNodeDefinition(type: WorkflowNodeType): WorkflowNodeDefinition {
  return WORKFLOW_NODE_DEFINITIONS[type]
}

export function getAllowedWorkflowTargetInputKinds(type: WorkflowNodeType): WorkflowValueKind[] {
  return [...WORKFLOW_NODE_DEFINITIONS[type].acceptedInputKinds]
}

export function getWorkflowNodeOutputKinds(type: WorkflowNodeType): WorkflowValueKind[] {
  return [...WORKFLOW_NODE_DEFINITIONS[type].outputKinds]
}

export function isWorkflowFileKind(kind: WorkflowValueKind) {
  return kind === "asset" || kind === "image" || kind === "video" || kind === "audio" || kind === "ppt"
}

export function getDefaultWorkflowNodeTitle(type: WorkflowNodeType, locale: WorkflowLocale = "en") {
  return WORKFLOW_NODE_TITLE_CATALOG[type][locale]
}

export function isDefaultWorkflowNodeTitle(type: WorkflowNodeType, value: string | null | undefined) {
  if (!value) return true
  const normalized = value.trim()
  if (!normalized) return true
  return (
    Object.values(WORKFLOW_NODE_TITLE_CATALOG[type]).includes(normalized) ||
    (WORKFLOW_NODE_LEGACY_TITLES[type] ?? []).includes(normalized)
  )
}

export function resolveWorkflowNodeTitle(
  type: WorkflowNodeType,
  value: string | null | undefined,
  locale: WorkflowLocale = "en",
) {
  return isDefaultWorkflowNodeTitle(type, value) ? getDefaultWorkflowNodeTitle(type, locale) : String(value).trim()
}

export function canWorkflowNodeAcceptValueKind(type: WorkflowNodeType, valueKind: WorkflowValueKind) {
  return WORKFLOW_NODE_DEFINITIONS[type].acceptedInputKinds.includes(valueKind)
}

export function canWorkflowNodeConnectValueKind(type: WorkflowNodeType, valueKind: WorkflowValueKind) {
  if (canWorkflowNodeAcceptValueKind(type, valueKind)) return true
  if (valueKind !== "asset") return false
  return WORKFLOW_NODE_DEFINITIONS[type].acceptedInputKinds.some((kind) => isWorkflowFileKind(kind) && kind !== "asset")
}
