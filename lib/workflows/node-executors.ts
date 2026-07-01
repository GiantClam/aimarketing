import { resolveUploadNodeOutputs, type WorkflowAssetRef } from "@/lib/workflows/uploads"
import { getDefaultEnterpriseWorkflowPreset } from "@/lib/workflows/presets"
import type { WorkflowDefinitionNode, WorkflowNodeType, WorkflowValueKind } from "@/lib/workflows/schema"

export type WorkflowMediaRef = {
  url?: string | null
  downloadUrl?: string | null
  title?: string | null
  mimeType?: string | null
  artifactId?: number
  assetId?: string | null
  storageKey?: string
  sourceNodeKey?: string | null
}

export type WorkflowNodeInputBundle = {
  text: string[]
  asset: WorkflowAssetRef[]
  image: WorkflowMediaRef[]
  video: WorkflowMediaRef[]
  audio: WorkflowMediaRef[]
  ppt: WorkflowMediaRef[]
}

export type WorkflowNodeOutputBundle = Partial<WorkflowNodeInputBundle>
type WorkflowFileFormat = "md" | "txt" | "html" | "json"

export type WorkflowCapabilityInvokeParams = {
  nodeType: WorkflowNodeType
  capabilitySlug: "ai-chat" | "agent-platform" | "content-repurpose" | "ai-image" | "ai-video" | "ai-music" | "ai-ppt"
  action: string
  node: WorkflowDefinitionNode
  input: WorkflowNodeInputBundle
}

export type WorkflowNodeExecutionContext = {
  enterpriseId: number
  ownerUserId: number
  node: WorkflowDefinitionNode
  input: WorkflowNodeInputBundle
  workflowMetadata?: Record<string, unknown> | null
  capabilityInvoker?: (params: WorkflowCapabilityInvokeParams) => Promise<WorkflowNodeExecutionResult>
}

export type WorkflowNodeExecutionResult = {
  output: WorkflowNodeOutputBundle
  providerId?: string | null
  modelId?: string | null
  taskRunId?: number | null
  creditsConsumed?: number
  metadata?: Record<string, unknown> | null
}

export type WorkflowNodeExecutor = {
  nodeType: WorkflowNodeType
  capabilitySlug?: "ai-chat" | "agent-platform" | "content-repurpose" | "ai-image" | "ai-video" | "ai-music" | "ai-ppt"
  action: string
  outputKinds: WorkflowValueKind[]
  execute(context: WorkflowNodeExecutionContext): Promise<WorkflowNodeExecutionResult>
}

function createEmptyBundle(): WorkflowNodeInputBundle {
  return {
    text: [],
    asset: [],
    image: [],
    video: [],
    audio: [],
    ppt: [],
  }
}

function normalizeNodeTextConfig(node: WorkflowDefinitionNode) {
  const textValue =
    typeof node.config.text === "string"
      ? node.config.text
      : typeof node.config.value === "string"
        ? node.config.value
        : typeof node.config.prompt === "string"
          ? node.config.prompt
          : ""

  return textValue.trim()
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  const numeric =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : NaN
  return Number.isInteger(numeric) && numeric > 0 ? numeric : fallback
}

function normalizePositiveIntegerList(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is number => Number.isInteger(item) && item > 0)
}

function normalizeWorkflowFileFormat(value: unknown): WorkflowFileFormat {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : ""
  if (normalized === "txt" || normalized === "html" || normalized === "json") {
    return normalized
  }
  return "md"
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function resolveWorkflowFileMimeType(format: WorkflowFileFormat) {
  if (format === "txt") return "text/plain"
  if (format === "html") return "text/html"
  if (format === "json") return "application/json"
  return "text/markdown"
}

function ensureWorkflowFileName(value: unknown, format: WorkflowFileFormat, fallbackTitle: string) {
  const normalized =
    typeof value === "string" && value.trim()
      ? value.trim().slice(0, 255)
      : `${fallbackTitle || "workflow-output"}`.trim().slice(0, 255) || "workflow-output"
  const extension = `.${format}`
  if (normalized.toLowerCase().endsWith(extension)) return normalized
  return `${normalized}${extension}`.slice(0, 255)
}

function buildWorkflowFileContent(textItems: string[], format: WorkflowFileFormat, fileName: string) {
  const normalizedItems = textItems.map((item) => item.trim()).filter(Boolean)
  if (normalizedItems.length === 0) {
    throw new Error("workflow_file_create_text_required")
  }

  if (format === "json") {
    const parsedItems = normalizedItems.map((item) => {
      try {
        return JSON.parse(item)
      } catch {
        throw new Error(`workflow_file_create_invalid_json:${fileName}`)
      }
    })
    return JSON.stringify(parsedItems.length === 1 ? parsedItems[0] : parsedItems, null, 2)
  }

  const combined = normalizedItems.join("\n\n")
  if (format === "html") {
    const looksLikeHtml = /<([a-z][\w-]*)\b[^>]*>/i.test(combined)
    if (looksLikeHtml) return combined
    return [
      "<!doctype html>",
      '<html lang="en">',
      "<head>",
      '  <meta charset="utf-8" />',
      `  <title>${escapeHtml(fileName)}</title>`,
      "</head>",
      "<body>",
      `  <pre>${escapeHtml(combined)}</pre>`,
      "</body>",
      "</html>",
    ].join("\n")
  }

  return combined
}

export function resolveKnowledgeRetrieveEnterpriseDatasetSelection(input: {
  selectedDatasetIds: unknown
  workflowMetadata?: Record<string, unknown> | null
}) {
  const selectedDatasetIds = normalizePositiveIntegerList(input.selectedDatasetIds)
  const defaultPreset = getDefaultEnterpriseWorkflowPreset(input.workflowMetadata, "en")
  const allowedDatasetIds = defaultPreset?.allowedKnowledgeDatasetIds ?? []

  if (allowedDatasetIds.length === 0) {
    return {
      datasetIds: selectedDatasetIds,
      restrictedByPreset: false,
    }
  }

  if (selectedDatasetIds.length > 0) {
    const allowedSet = new Set(allowedDatasetIds)
    return {
      datasetIds: selectedDatasetIds.filter((id) => allowedSet.has(id)),
      restrictedByPreset: true,
    }
  }

  return {
    datasetIds: allowedDatasetIds,
    restrictedByPreset: true,
  }
}

function buildKnowledgeWriteDocument(input: {
  title: string
  node: WorkflowDefinitionNode
  bundle: WorkflowNodeInputBundle
}) {
  const sections = [
    `# ${input.title}`,
    input.bundle.text.length > 0 ? `## Text\n\n${input.bundle.text.join("\n\n")}` : "",
    input.bundle.asset.length > 0
      ? `## Files\n${input.bundle.asset.map((item) => `- ${item.fileName}${item.url ? `: ${item.url}` : ""}`).join("\n")}`
      : "",
    input.bundle.image.length > 0
      ? `## Images\n${input.bundle.image.map((item) => `- ${(item.title || "Image").trim()}: ${item.url || item.downloadUrl || ""}`).join("\n")}`
      : "",
    input.bundle.video.length > 0
      ? `## Videos\n${input.bundle.video.map((item) => `- ${(item.title || "Video").trim()}: ${item.url || item.downloadUrl || ""}`).join("\n")}`
      : "",
    input.bundle.audio.length > 0
      ? `## Audio\n${input.bundle.audio.map((item) => `- ${(item.title || "Audio").trim()}: ${item.url || item.downloadUrl || ""}`).join("\n")}`
      : "",
    input.bundle.ppt.length > 0
      ? `## Presentations\n${input.bundle.ppt.map((item) => `- ${(item.title || "Presentation").trim()}: ${item.url || item.downloadUrl || ""}`).join("\n")}`
      : "",
    `## Workflow metadata\n- nodeKey: ${input.node.nodeKey}\n- nodeTitle: ${input.node.title}`,
  ].filter(Boolean)

  return sections.join("\n\n").trim()
}

function createCapabilityBackedExecutor(input: {
  nodeType: WorkflowNodeType
  capabilitySlug: "ai-chat" | "agent-platform" | "content-repurpose" | "ai-image" | "ai-video" | "ai-music" | "ai-ppt"
  action: string
  outputKinds: WorkflowValueKind[]
}): WorkflowNodeExecutor {
  return {
    ...input,
    async execute(context) {
      if (!context.capabilityInvoker) {
        throw new Error("workflow_capability_invoker_missing")
      }

      return context.capabilityInvoker({
        nodeType: input.nodeType,
        capabilitySlug: input.capabilitySlug,
        action: input.action,
        node: context.node,
        input: context.input,
      })
    },
  }
}

const WORKFLOW_NODE_EXECUTORS: Record<WorkflowNodeType, WorkflowNodeExecutor> = {
  upload: {
    nodeType: "upload",
    action: "upload",
    outputKinds: ["asset"],
    async execute(context) {
      const uploadedFiles = Array.isArray(context.node.config.uploadedFiles)
        ? context.node.config.uploadedFiles
        : []
      const referencedArtifactIds = Array.isArray(context.node.config.referencedArtifactIds)
        ? context.node.config.referencedArtifactIds.filter((value): value is number => Number.isInteger(value) && value > 0)
        : []

      const resolved = await resolveUploadNodeOutputs({
        enterpriseId: context.enterpriseId,
        ownerUserId: context.ownerUserId,
        uploadedFiles: uploadedFiles
          .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
          .map((item) => ({
            fileName: typeof item.fileName === "string" ? item.fileName : "",
            mimeType: typeof item.mimeType === "string" ? item.mimeType : "application/octet-stream",
            artifactId: typeof item.artifactId === "number" ? item.artifactId : undefined,
            storageKey: typeof item.storageKey === "string" ? item.storageKey : undefined,
            url: typeof item.url === "string" ? item.url : null,
          })),
        referencedArtifactIds,
      })

      return {
        output: {
          asset: resolved.assets,
        },
      }
    },
  },
  text_input: {
    nodeType: "text_input",
    action: "text-input",
    outputKinds: ["text"],
    async execute(context) {
      const configured = normalizeNodeTextConfig(context.node)
      const inherited = context.input.text.join("\n\n").trim()
      const text = configured || inherited

      if (!text) {
        throw new Error("workflow_text_input_missing_text")
      }

      return {
        output: {
          text: [text],
        },
      }
    },
  },
  file_create: {
    nodeType: "file_create",
    action: "file-create",
    outputKinds: ["asset"],
    async execute(context) {
      const format = normalizeWorkflowFileFormat(context.node.config.fileFormat)
      const fileName = ensureWorkflowFileName(context.node.config.fileName, format, context.node.title || "workflow-file")
      const content = buildWorkflowFileContent(context.input.text, format, fileName)

      const asset: WorkflowAssetRef = {
        source: "upload",
        fileName,
        mimeType: resolveWorkflowFileMimeType(format),
        embeddedContentBase64: Buffer.from(content, "utf8").toString("base64"),
        inlinePreviewText: content,
      }

      return {
        output: {
          asset: [asset],
        },
        metadata: {
          persistenceTarget: "file_create",
          fileName,
          fileFormat: format,
        },
      }
    },
  },
  writer: createCapabilityBackedExecutor({
    nodeType: "writer",
    capabilitySlug: "content-repurpose",
    action: "chat",
    outputKinds: ["text"],
  }),
  llm_generate: createCapabilityBackedExecutor({
    nodeType: "llm_generate",
    capabilitySlug: "ai-chat",
    action: "chat",
    outputKinds: ["text"],
  }),
  agent_execute: createCapabilityBackedExecutor({
    nodeType: "agent_execute",
    capabilitySlug: "agent-platform",
    action: "chat",
    outputKinds: ["text"],
  }),
  image_generate: createCapabilityBackedExecutor({
    nodeType: "image_generate",
    capabilitySlug: "ai-image",
    action: "generate",
    outputKinds: ["image"],
  }),
  video_generate: createCapabilityBackedExecutor({
    nodeType: "video_generate",
    capabilitySlug: "ai-video",
    action: "workflow-plan",
    outputKinds: ["video"],
  }),
  digital_human: createCapabilityBackedExecutor({
    nodeType: "digital_human",
    capabilitySlug: "ai-video",
    action: "generate",
    outputKinds: ["video"],
  }),
  music_generate: createCapabilityBackedExecutor({
    nodeType: "music_generate",
    capabilitySlug: "ai-music",
    action: "generate",
    outputKinds: ["audio"],
  }),
  voice_synthesis: createCapabilityBackedExecutor({
    nodeType: "voice_synthesis",
    capabilitySlug: "ai-music",
    action: "voice-synthesis",
    outputKinds: ["audio"],
  }),
  audio_generate: createCapabilityBackedExecutor({
    nodeType: "audio_generate",
    capabilitySlug: "ai-music",
    action: "generate",
    outputKinds: ["audio"],
  }),
  ppt_generate: createCapabilityBackedExecutor({
    nodeType: "ppt_generate",
    capabilitySlug: "ai-ppt",
    action: "preview",
    outputKinds: ["ppt"],
  }),
  knowledge_retrieve: {
    nodeType: "knowledge_retrieve",
    action: "knowledge-retrieve",
    outputKinds: ["text"],
    async execute(context) {
      const configuredPrompt = normalizeNodeTextConfig(context.node)
      const upstreamText = context.input.text.join("\n\n").trim()
      const query = [configuredPrompt, upstreamText].filter(Boolean).join("\n\n").trim()
      if (!query) {
        throw new Error("workflow_knowledge_retrieve_query_required")
      }

      const configuredEnterpriseDatasetIds = normalizePositiveIntegerList(context.node.config.selectedDatasetIds)
      const enterpriseDatasetSelection = resolveKnowledgeRetrieveEnterpriseDatasetSelection({
        selectedDatasetIds: configuredEnterpriseDatasetIds,
        workflowMetadata: context.workflowMetadata,
      })
      const preferredPersonalDatasetIds = normalizePositiveIntegerList(context.node.config.selectedPersonalDatasetIds)
      const topK = normalizePositiveInteger(context.node.config.topK, 4)
      const shouldQueryEnterprise =
        configuredEnterpriseDatasetIds.length > 0
          ? enterpriseDatasetSelection.datasetIds.length > 0
          : preferredPersonalDatasetIds.length === 0 &&
            (enterpriseDatasetSelection.datasetIds.length > 0 || !enterpriseDatasetSelection.restrictedByPreset)

      const [enterpriseRetrieval, personalRetrieval] = await Promise.all([
        shouldQueryEnterprise
          ? (async () => {
              const { loadEnterpriseKnowledgeContext } = await import("@/lib/knowledge/service")
              return loadEnterpriseKnowledgeContext({
                enterpriseId: context.enterpriseId,
                query,
                preferredDatasetIds: enterpriseDatasetSelection.datasetIds,
                topK,
              })
            })()
          : Promise.resolve(null),
        preferredPersonalDatasetIds.length > 0
          ? (async () => {
              const { loadPersonalKnowledgeContext } = await import("@/lib/knowledge/personal-datasets")
              return loadPersonalKnowledgeContext({
                userId: context.ownerUserId,
                query,
                preferredDatasetIds: preferredPersonalDatasetIds,
                topK,
              })
            })()
          : Promise.resolve(null),
      ])

      const mergedDatasetsUsed = [
        ...(enterpriseRetrieval?.datasetsUsed ?? []),
        ...(personalRetrieval?.datasetsUsed ?? []),
      ]
      const mergedSnippets = [
        ...(enterpriseRetrieval?.snippets ?? []),
        ...(personalRetrieval?.snippets ?? []),
      ]

      const retrievalText =
        mergedSnippets.length
          ? mergedSnippets
              .map((snippet, index) => `[#${index + 1}] ${snippet.title}\n${snippet.content}`)
              .join("\n\n")
          : "No knowledge snippets found."

      return {
        output: {
          text: [retrievalText],
        },
        metadata: {
          persistenceTarget: "knowledge_retrieve",
          datasetsUsed: mergedDatasetsUsed,
          snippetCount: mergedSnippets.length,
          preferredEnterpriseDatasetIds: enterpriseDatasetSelection.datasetIds,
        },
      }
    },
  },
  knowledge_write: {
    nodeType: "knowledge_write",
    action: "knowledge-write",
    outputKinds: ["text", "asset", "image", "video", "audio", "ppt"],
    async execute(context) {
      const datasetScope = context.node.config.datasetScope === "personal" ? "personal" : "enterprise"
      const datasetId = normalizePositiveInteger(context.node.config.datasetId, 0)
      if (!datasetId) {
        throw new Error("workflow_knowledge_write_dataset_required")
      }

      const title =
        (typeof context.node.config.documentTitle === "string" && context.node.config.documentTitle.trim()) ||
        `${context.node.title || "workflow-knowledge"}-${context.node.nodeKey}`
      const content = buildKnowledgeWriteDocument({
        title,
        node: context.node,
        bundle: context.input,
      })

      const knowledgeCategory =
        typeof context.node.config.knowledgeCategory === "string" &&
        ["general", "brand", "product", "case-study", "compliance", "campaign"].includes(context.node.config.knowledgeCategory)
          ? (context.node.config.knowledgeCategory as "general" | "brand" | "product" | "case-study" | "compliance" | "campaign")
          : "general"

      return {
        output: {
          text: [...context.input.text],
          asset: [...context.input.asset],
          image: [...context.input.image],
          video: [...context.input.video],
          audio: [...context.input.audio],
          ppt: [...context.input.ppt],
        },
        metadata: {
          persistenceTarget: "knowledge_write",
          manualConfirmationRequired: true,
          knowledgeDocumentTitle: title,
          knowledgeDraftContent: content,
          targetType: datasetScope === "personal" ? "personal_knowledge_base" : "knowledge_base",
          datasetId,
          datasetScope,
          knowledgeCategory,
        },
      }
    },
  },
  product_store: {
    nodeType: "product_store",
    action: "store-output",
    outputKinds: [],
    async execute(context) {
      const persistToWorkLibrary = Boolean(context.node.config.persistToWorkLibrary)
      const persistToKnowledgeBase = Boolean(context.node.config.persistToKnowledgeBase)
      return {
        output: {
          asset: [...context.input.asset],
          image: [...context.input.image],
          video: [...context.input.video],
          audio: [...context.input.audio],
          ppt: [...context.input.ppt],
        },
        metadata: {
          persistenceTarget: "asset_library",
          persistToWorkLibrary,
          persistToKnowledgeBase,
        },
      }
    },
  },
}

export function resolveWorkflowNodeExecutor(nodeType: WorkflowNodeType): WorkflowNodeExecutor {
  return WORKFLOW_NODE_EXECUTORS[nodeType]
}

export function createWorkflowNodeInputBundle(): WorkflowNodeInputBundle {
  return createEmptyBundle()
}

export function mergeWorkflowNodeOutputBundles(
  base: WorkflowNodeInputBundle,
  additions: WorkflowNodeOutputBundle,
): WorkflowNodeInputBundle {
  return {
    text: additions.text ? [...base.text, ...additions.text.filter(Boolean)] : [...base.text],
    asset: additions.asset ? [...base.asset, ...additions.asset] : [...base.asset],
    image: additions.image ? [...base.image, ...additions.image] : [...base.image],
    video: additions.video ? [...base.video, ...additions.video] : [...base.video],
    audio: additions.audio ? [...base.audio, ...additions.audio] : [...base.audio],
    ppt: additions.ppt ? [...base.ppt, ...additions.ppt] : [...base.ppt],
  }
}
