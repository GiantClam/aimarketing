import { resolveUploadNodeOutputs, type WorkflowAssetRef } from "@/lib/workflows/uploads"
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

export type WorkflowCapabilityInvokeParams = {
  nodeType: WorkflowNodeType
  capabilitySlug: "ai-chat" | "content-repurpose" | "ai-image" | "ai-video" | "ai-music" | "ai-ppt"
  action: string
  node: WorkflowDefinitionNode
  input: WorkflowNodeInputBundle
}

export type WorkflowNodeExecutionContext = {
  enterpriseId: number
  ownerUserId: number
  node: WorkflowDefinitionNode
  input: WorkflowNodeInputBundle
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
  capabilitySlug?: "ai-chat" | "content-repurpose" | "ai-image" | "ai-video" | "ai-music" | "ai-ppt"
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

function createCapabilityBackedExecutor(input: {
  nodeType: WorkflowNodeType
  capabilitySlug: "ai-chat" | "content-repurpose" | "ai-image" | "ai-video" | "ai-music" | "ai-ppt"
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
  product_store: {
    nodeType: "product_store",
    action: "store-output",
    outputKinds: [],
    async execute(context) {
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
          persistenceTarget: "work_library",
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
