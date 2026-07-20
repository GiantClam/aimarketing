import type {
  WorkflowFieldDefinition,
  WorkflowNodeDefinitionV2,
  WorkflowNodeType,
  WorkflowPortDefinition,
  WorkflowValueKind,
} from "@/lib/workflows/node-definitions/types"

const textPort = (id = "text", role?: WorkflowPortDefinition["role"]): WorkflowPortDefinition => ({
  id,
  valueKind: "text",
  role,
  required: false,
  cardinality: "many",
})

const inputPort = (valueKind: WorkflowValueKind, id: string = valueKind, role?: WorkflowPortDefinition["role"]): WorkflowPortDefinition => ({
  id,
  valueKind,
  role,
  required: false,
  cardinality: "many",
})

const outputPort = (valueKind: WorkflowValueKind, id: string = valueKind): WorkflowPortDefinition => ({
  id,
  valueKind,
  required: false,
  cardinality: "many",
})

const fields = (...items: WorkflowFieldDefinition[]) => items
const textField = (id: string, label: string, defaultValue = "", rendererId: WorkflowFieldDefinition["rendererId"] = "text"): WorkflowFieldDefinition => ({
  id,
  label: { zh: label, en: label },
  rendererId,
  valueType: "string",
  required: false,
  defaultValue,
})
const selectField = (id: string, label: string, options: Array<{ label: string; value: string }>, defaultValue?: string): WorkflowFieldDefinition => ({
  id,
  label: { zh: label, en: label },
  rendererId: "select",
  valueType: "string",
  required: false,
  options,
  defaultValue,
})
const assetField = (id: string, label: string, valueType: WorkflowFieldDefinition["valueType"] = "object"): WorkflowFieldDefinition => ({
  id,
  label: { zh: label, en: label },
  rendererId: "asset",
  valueType,
  required: false,
})
const numberField = (id: string, label: string, defaultValue: number, min?: number, max?: number): WorkflowFieldDefinition => ({
  id,
  label: { zh: label, en: label },
  rendererId: "number",
  valueType: "number",
  required: false,
  defaultValue,
  min,
  max,
})

const identityMigration = (config: Record<string, unknown>) => ({ ...config })

type BuiltinSpec = Omit<WorkflowNodeDefinitionV2, "type" | "version" | "migrate"> & {
  type: WorkflowNodeType
  version?: number
}

const definitions: BuiltinSpec[] = [
  { type: "upload", category: "input", title: { zh: "上传", en: "Upload" }, icon: "upload", colorToken: "amber", inputs: [], outputs: [outputPort("asset")], configSchema: fields(assetField("uploadedFiles", "上传文件", "object"), assetField("referencedArtifactIds", "引用资产", "string[]")), defaultConfig: { uploadedFiles: [], referencedArtifactIds: [] }, executorId: "upload", sideEffect: "persistent" },
  { type: "text_input", category: "input", title: { zh: "文本输入", en: "Text Input" }, icon: "text", colorToken: "sky", inputs: [], outputs: [outputPort("text")], configSchema: fields(textField("text", "文本")), defaultConfig: { text: "" }, executorId: "text_input", sideEffect: "none" },
  { type: "file_create", category: "output", title: { zh: "文件", en: "File" }, icon: "file", colorToken: "lime", inputs: [textPort()], outputs: [outputPort("asset")], configSchema: fields(textField("fileName", "文件名称"), selectField("fileFormat", "文件格式", [{ label: "Markdown", value: "md" }, { label: "Text", value: "txt" }, { label: "HTML", value: "html" }, { label: "JSON", value: "json" }], "md")), defaultConfig: { fileName: "", fileFormat: "md" }, executorId: "file_create", sideEffect: "persistent" },
  { type: "writer", category: "ai", title: { zh: "文章写作", en: "Writer" }, icon: "pen", colorToken: "indigo", inputs: [textPort("text", "text.prompt")], outputs: [outputPort("text")], configSchema: fields(textField("selectedProviderId", "Provider"), textField("selectedModelId", "Model")), defaultConfig: {}, executorId: "writer", sideEffect: "external" },
  { type: "llm_generate", category: "ai", title: { zh: "模型生成", en: "LLM Generate" }, icon: "sparkles", colorToken: "fuchsia", inputs: [textPort("text", "text.prompt")], outputs: [outputPort("text")], configSchema: fields(textField("selectedProviderId", "Provider"), textField("selectedModelId", "Model")), defaultConfig: {}, executorId: "llm_generate", sideEffect: "external", legacyTitles: ["文案生成", "大模型"] },
  { type: "agent_execute", category: "ai", title: { zh: "智能体", en: "Agent" }, icon: "bot", colorToken: "amber", inputs: [textPort(), inputPort("asset"), inputPort("image"), inputPort("video"), inputPort("audio"), inputPort("ppt")], outputs: [outputPort("text")], configSchema: fields(textField("prompt", "Prompt"), textField("selectedProviderId", "Provider"), textField("selectedModelId", "Model")), defaultConfig: {}, executorId: "agent_execute", sideEffect: "external" },
  { type: "image_generate", category: "media", title: { zh: "图片生成", en: "Image Generate" }, icon: "image", colorToken: "emerald", inputs: [textPort("text", "text.prompt"), inputPort("image", "images", "image.reference")], outputs: [outputPort("image")], configSchema: fields(textField("prompt", "Prompt"), textField("selectedProviderId", "Provider"), textField("selectedModelId", "Model")), defaultConfig: {}, executorId: "image_generate", sideEffect: "external" },
  { type: "video_generate", category: "media", title: { zh: "视频生成", en: "Video Generate" }, icon: "video", colorToken: "rose", inputs: [textPort("text", "text.prompt"), inputPort("image", "images", "image.first_frame"), inputPort("image", "image.last_frame", "image.last_frame"), inputPort("video", "videos")], outputs: [outputPort("video")], configSchema: fields(textField("prompt", "Prompt")), defaultConfig: {}, executorId: "video_generate", sideEffect: "external" },
  { type: "digital_human", category: "media", title: { zh: "口播数字人", en: "Digital Human" }, icon: "user", colorToken: "orange", inputs: [textPort("text", "text.prompt"), inputPort("image", "images"), inputPort("audio", "audios")], outputs: [outputPort("video")], configSchema: fields(textField("script", "Script")), defaultConfig: {}, executorId: "digital_human", sideEffect: "external" },
  { type: "music_generate", category: "media", title: { zh: "音乐生成", en: "Music Generate" }, icon: "music", colorToken: "cyan", inputs: [textPort("text", "text.prompt"), inputPort("audio", "audios")], outputs: [outputPort("audio")], configSchema: fields(textField("prompt", "Prompt")), defaultConfig: {}, executorId: "music_generate", sideEffect: "external" },
  { type: "voice_synthesis", category: "media", title: { zh: "语音合成", en: "Voice Synthesis" }, icon: "mic", colorToken: "teal", inputs: [textPort("text", "text.prompt")], outputs: [outputPort("audio")], configSchema: fields(textField("text", "Text")), defaultConfig: {}, executorId: "voice_synthesis", sideEffect: "external" },
  { type: "audio_generate", category: "media", title: { zh: "音频生成", en: "Audio Generate" }, icon: "audio", colorToken: "cyan", inputs: [textPort("text", "text.prompt"), inputPort("audio", "audios")], outputs: [outputPort("audio")], configSchema: fields(textField("prompt", "Prompt")), defaultConfig: {}, executorId: "audio_generate", sideEffect: "external" },
  { type: "ppt_generate", category: "media", title: { zh: "PPT 生成", en: "PPT Generate" }, icon: "presentation", colorToken: "violet", inputs: [textPort("text", "text.prompt"), inputPort("image", "images")], outputs: [outputPort("ppt")], configSchema: fields(textField("prompt", "Prompt")), defaultConfig: {}, executorId: "ppt_generate", sideEffect: "external" },
  { type: "knowledge_retrieve", category: "integration", title: { zh: "知识检索", en: "Knowledge Retrieve" }, icon: "link", colorToken: "sky", inputs: [textPort("text", "text.prompt"), inputPort("asset", "assets")], outputs: [outputPort("text")], configSchema: fields(textField("query", "Query")), defaultConfig: {}, executorId: "knowledge_retrieve", sideEffect: "external" },
  { type: "knowledge_write", category: "integration", title: { zh: "知识写入", en: "Knowledge Write" }, icon: "arrow-down", colorToken: "emerald", inputs: [textPort(), inputPort("asset"), inputPort("image"), inputPort("video"), inputPort("audio"), inputPort("ppt")], outputs: [outputPort("text"), outputPort("asset"), outputPort("image"), outputPort("video"), outputPort("audio"), outputPort("ppt")], configSchema: fields(textField("title", "Title")), defaultConfig: {}, executorId: "knowledge_write", sideEffect: "persistent" },
  { type: "product_store", category: "output", title: { zh: "资产库存储", en: "Asset Library" }, icon: "archive", colorToken: "slate", inputs: [inputPort("asset", "assets"), inputPort("image", "images"), inputPort("video", "videos"), inputPort("audio", "audios"), inputPort("ppt", "presentations")], outputs: [], configSchema: fields(textField("title", "Title")), defaultConfig: {}, executorId: "product_store", sideEffect: "persistent", legacyTitles: ["作品库存储", "素材库存储", "Work Library"] },
  {
    type: "foreach",
    category: "control",
    title: { zh: "逐项处理", en: "For Each" },
    icon: "repeat",
    colorToken: "amber",
    inputs: [inputPort("asset", "items.asset"), inputPort("image", "items.image")],
    outputs: [outputPort("asset", "item.asset"), outputPort("image", "item.image")],
    configSchema: fields(
      selectField("inputPortId", "输入集合", [
        { label: "Image reference", value: "image.reference" },
        { label: "Asset", value: "asset" },
      ], "image.reference"),
      selectField("failurePolicy", "失败策略", [
        { label: "Continue", value: "continue" },
        { label: "Fail fast", value: "fail_fast" },
      ], "continue"),
      numberField("concurrency", "并发数", 3, 1, 6),
      numberField("maxIterations", "最大轮数", 20, 1, 100),
      textField("collectNodeKey", "Collect 节点"),
    ),
    defaultConfig: {
      inputPortId: "image.reference",
      failurePolicy: "continue",
      concurrency: 3,
      maxIterations: 20,
      collectNodeKey: "",
    },
    executorId: "foreach",
    sideEffect: "none",
  },
  {
    type: "collect",
    category: "control",
    title: { zh: "汇总结果", en: "Collect" },
    icon: "list",
    colorToken: "sky",
    inputs: [inputPort("asset", "items.asset"), inputPort("image", "items.image"), inputPort("video", "items.video"), inputPort("audio", "items.audio"), inputPort("ppt", "items.ppt"), textPort("items.text")],
    outputs: [outputPort("asset", "assets"), outputPort("image", "images"), outputPort("video", "videos"), outputPort("audio", "audios"), outputPort("ppt", "presentations"), outputPort("text")],
    configSchema: fields(
      selectField("order", "排序", [{ label: "Input order", value: "input" }], "input"),
      { ...selectField("includeFailures", "包含失败项", [{ label: "Yes", value: "true" }, { label: "No", value: "false" }], "false"), rendererId: "toggle", valueType: "boolean", defaultValue: false, options: undefined },
    ),
    defaultConfig: { order: "input", includeFailures: false },
    executorId: "collect",
    sideEffect: "none",
  },
  {
    type: "output",
    category: "output",
    title: { zh: "工作流输出", en: "Output" },
    icon: "check-circle",
    colorToken: "lime",
    inputs: [inputPort("asset", "assets"), inputPort("image", "images"), inputPort("video", "videos"), inputPort("audio", "audios"), inputPort("ppt", "presentations"), textPort()],
    outputs: [outputPort("asset", "assets"), outputPort("image", "images"), outputPort("video", "videos"), outputPort("audio", "audios"), outputPort("ppt", "presentations"), outputPort("text")],
    configSchema: fields(
      textField("displayName", "展示名称"),
      { ...selectField("allowEmpty", "允许空输出", [{ label: "Yes", value: "true" }, { label: "No", value: "false" }], "false"), rendererId: "toggle", valueType: "boolean", defaultValue: false, options: undefined },
      { ...selectField("requireAllSucceeded", "要求全部成功", [{ label: "Yes", value: "true" }, { label: "No", value: "false" }], "true"), rendererId: "toggle", valueType: "boolean", defaultValue: true, options: undefined },
    ),
    defaultConfig: { displayName: "", allowEmpty: false, requireAllSucceeded: true },
    executorId: "output",
    sideEffect: "none",
  },
]

export const WORKFLOW_BUILTIN_NODE_DEFINITIONS: readonly WorkflowNodeDefinitionV2[] = definitions.map((definition) => ({
  ...definition,
  version: definition.version ?? 1,
  migrate: identityMigration,
}))
