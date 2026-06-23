import { DEFAULT_MINIMAX_VIDEO_MODEL, MINIMAX_VIDEO_MODEL_OPTIONS } from "@/lib/platform/minimax-video-options"

import type { ModelCapability } from "@/lib/ai-runtime/capabilities"
import type { ModelDefinition, ModelParameterDefinition } from "@/lib/ai-runtime/types"

function selectParameter(
  id: string,
  label: string,
  defaultValue: string,
  options: Array<{ label: string; value: string }>,
  extra: Partial<ModelParameterDefinition> = {},
): ModelParameterDefinition {
  return {
    id,
    label,
    type: "select",
    defaultValue,
    options,
    ...extra,
  }
}

const VIDEO_RATIO_OPTIONS = [
  { label: "Adaptive", value: "adaptive" },
  { label: "16:9", value: "16:9" },
  { label: "4:3", value: "4:3" },
  { label: "1:1", value: "1:1" },
  { label: "3:4", value: "3:4" },
  { label: "9:16", value: "9:16" },
  { label: "21:9", value: "21:9" },
]

const SEEDANCE_FAST_RATIO_OPTIONS = [
  { label: "Adaptive", value: "adaptive" },
  { label: "16:9", value: "16:9" },
  { label: "9:16", value: "9:16" },
  { label: "1:1", value: "1:1" },
]

const VIDEO_BOOL_OPTIONS = [
  { label: "On", value: "true" },
  { label: "Off", value: "false" },
]

const SEEDANCE_FAST_DURATION_OPTIONS = [
  { label: "5s", value: "5" },
  { label: "10s", value: "10" },
]

const SEEDANCE_FAST_RESOLUTION_OPTIONS = [
  { label: "720p", value: "720p" },
  { label: "1080p", value: "1080p" },
]

const SEEDANCE_VIDEO_DURATION_OPTIONS = [
  { label: "4s", value: "4" },
  { label: "5s", value: "5" },
  { label: "6s", value: "6" },
  { label: "7s", value: "7" },
  { label: "8s", value: "8" },
  { label: "9s", value: "9" },
  { label: "10s", value: "10" },
  { label: "11s", value: "11" },
  { label: "12s", value: "12" },
  { label: "13s", value: "13" },
  { label: "14s", value: "14" },
  { label: "15s", value: "15" },
]

const SEEDANCE_VIDEO_RESOLUTION_OPTIONS = [
  { label: "480p", value: "480p" },
  { label: "720p", value: "720p" },
  { label: "1080p", value: "1080p" },
  { label: "2k", value: "2k" },
  { label: "4k", value: "4k" },
]

const models: ModelDefinition[] = [
  {
    id: "openai:text:gpt-5.4-mini",
    provider: "openai_compatible",
    capability: "text.generate",
    label: "GPT-5.4 Mini",
    async: false,
    outputKind: "text",
    parameterSchema: [
      { id: "prompt", label: "Prompt", type: "textarea", required: true },
      selectParameter("temperature", "Temperature", "1", [
        { label: "0", value: "0" },
        { label: "0.5", value: "0.5" },
        { label: "1", value: "1" },
      ]),
    ],
    providerMetadata: {
      nativeModel: "gpt-5.4-mini",
    },
  },
  {
    id: "openai:image:gpt-image-2",
    provider: "openai_official",
    capability: "image.text_to_image",
    label: "GPT Image 2",
    async: false,
    outputKind: "image",
    parameterSchema: [
      { id: "prompt", label: "Prompt", type: "textarea", required: true },
      selectParameter("size", "Size", "1024x1024", [
        { label: "1024x1024", value: "1024x1024" },
        { label: "1536x1024", value: "1536x1024" },
        { label: "1024x1536", value: "1024x1536" },
      ]),
    ],
    providerMetadata: {
      nativeModel: "gpt-image-2",
    },
  },
  {
    id: "runninghub:image:seedream-v5-text-to-image",
    provider: "runninghub",
    capability: "image.text_to_image",
    label: "RunningHub Seedream V5 Text to Image",
    async: true,
    outputKind: "image",
    parameterSchema: [
      { id: "prompt", label: "Prompt", type: "textarea", required: true },
      selectParameter("size", "Size", "1024x1024", [
        { label: "1024x1024", value: "1024x1024" },
        { label: "1536x1024", value: "1536x1024" },
      ]),
    ],
    providerMetadata: {
      nativeModel: "seedream-v5-text-to-image",
      runningHubMode: "txt2img",
    },
  },
  {
    id: "runninghub:image:seedream-v5-image-to-image",
    provider: "runninghub",
    capability: "image.image_to_image",
    label: "RunningHub Seedream V5 Image to Image",
    async: true,
    outputKind: "image",
    parameterSchema: [
      { id: "prompt", label: "Prompt", type: "textarea", required: true },
      { id: "inputImageUrl", label: "Input image URL", type: "url", required: true },
    ],
    providerMetadata: {
      nativeModel: "seedream-v5-image-to-image",
      runningHubMode: "img2img",
    },
  },
  ...MINIMAX_VIDEO_MODEL_OPTIONS.flatMap<ModelDefinition>((option) =>
    option.supportedFeatures.map((featureId) => {
      const isImageToVideo = featureId === "image-to-video"
      const capability = isImageToVideo ? "video.image_to_video" : "video.text_to_video"
      const durationDefault = option.resolutionMode === "legacy" ? "6" : "6"
      const durationOptions =
        option.resolutionMode === "legacy"
          ? [{ label: "6s", value: "6" }]
          : [
              { label: "6s", value: "6" },
              { label: "10s", value: "10" },
            ]
      const resolutionDefault = option.resolutionMode === "legacy" ? "720P" : "768P"
      const resolutionOptions =
        option.resolutionMode === "legacy"
          ? [{ label: "720P", value: "720P" }]
          : [
              { label: "768P", value: "768P" },
              { label: "1080P", value: "1080P" },
            ]

      return {
        id: `minimax:video:${featureId}:${option.value}`,
        provider: "minimax",
        capability,
        label: option.label,
        async: true,
        outputKind: "video",
        defaultTimeoutMs: 30 * 60_000,
        parameterSchema: [
          ...(isImageToVideo
            ? [{ id: "firstFrameUrl", label: "First frame URL", type: "url", required: true } satisfies ModelParameterDefinition]
            : []),
          ...(isImageToVideo
            ? [{ id: "lastFrameUrl", label: "Last frame URL", type: "url" } satisfies ModelParameterDefinition]
            : []),
          {
            id: "prompt",
            label: isImageToVideo ? "Prompt" : "Prompt",
            type: "textarea",
            required: !isImageToVideo,
          },
          selectParameter("duration", "Duration", durationDefault, durationOptions),
          selectParameter("resolution", "Resolution", resolutionDefault, resolutionOptions),
        ],
        providerMetadata: {
          nativeModel: option.value,
          featureId,
          resolutionMode: option.resolutionMode,
        },
      }
    }),
  ),
  {
    id: "runninghub:video:seedance-text-to-video",
    provider: "runninghub",
    capability: "video.text_to_video",
    label: "Seedance Fast Text to Video",
    async: true,
    outputKind: "video",
    defaultTimeoutMs: 30 * 60_000,
    parameterSchema: [
      { id: "prompt", label: "Prompt", type: "textarea", required: true },
      selectParameter("duration", "Duration", "5", SEEDANCE_FAST_DURATION_OPTIONS),
      selectParameter("resolution", "Resolution", "720p", SEEDANCE_FAST_RESOLUTION_OPTIONS),
      selectParameter("ratio", "Aspect ratio", "adaptive", SEEDANCE_FAST_RATIO_OPTIONS),
      selectParameter("generateAudio", "Generate audio", "true", VIDEO_BOOL_OPTIONS),
      {
        id: "seed",
        label: "Seed",
        type: "number",
        defaultValue: -1,
      },
    ],
    providerMetadata: {
      nativeModel: "seedance-text-to-video",
      featureId: "text-to-video",
    },
  },
  {
    id: "runninghub:video:seedance-mini-text-to-video",
    provider: "runninghub",
    capability: "video.text_to_video",
    label: "Seedance Mini Text to Video",
    async: true,
    outputKind: "video",
    defaultTimeoutMs: 30 * 60_000,
    parameterSchema: [
      { id: "prompt", label: "Prompt", type: "textarea", required: true },
      selectParameter("duration", "Duration", "5", SEEDANCE_VIDEO_DURATION_OPTIONS),
      selectParameter("resolution", "Resolution", "720p", SEEDANCE_VIDEO_RESOLUTION_OPTIONS),
      selectParameter("ratio", "Aspect ratio", "adaptive", VIDEO_RATIO_OPTIONS),
      selectParameter("generateAudio", "Generate audio", "true", VIDEO_BOOL_OPTIONS),
      {
        id: "webSearch",
        label: "Web search",
        type: "select",
        defaultValue: "false",
        options: VIDEO_BOOL_OPTIONS,
      },
      {
        id: "returnLastFrame",
        label: "Return last frame",
        type: "select",
        defaultValue: "false",
        options: VIDEO_BOOL_OPTIONS,
      },
      {
        id: "seed",
        label: "Seed",
        type: "number",
        defaultValue: -1,
        min: -1,
        max: 2147483647,
      },
    ],
    providerMetadata: {
      nativeModel: "seedance-mini-text-to-video",
      featureId: "text-to-video",
    },
  },
  {
    id: "runninghub:video:seedance-image-to-video",
    provider: "runninghub",
    capability: "video.image_to_video",
    label: "Seedance Fast Image to Video",
    async: true,
    outputKind: "video",
    defaultTimeoutMs: 30 * 60_000,
    parameterSchema: [
      { id: "firstFrameUrl", label: "First frame URL", type: "url", required: true },
      { id: "lastFrameUrl", label: "Last frame URL", type: "url" },
      { id: "prompt", label: "Prompt", type: "textarea" },
      selectParameter("duration", "Duration", "5", SEEDANCE_FAST_DURATION_OPTIONS),
      selectParameter("resolution", "Resolution", "720p", SEEDANCE_FAST_RESOLUTION_OPTIONS),
      selectParameter("ratio", "Aspect ratio", "adaptive", SEEDANCE_FAST_RATIO_OPTIONS),
      selectParameter("generateAudio", "Generate audio", "true", VIDEO_BOOL_OPTIONS),
      selectParameter("realPersonMode", "Real person mode", "true", VIDEO_BOOL_OPTIONS),
      {
        id: "seed",
        label: "Seed",
        type: "number",
        defaultValue: -1,
      },
    ],
    providerMetadata: {
      nativeModel: "seedance-image-to-video",
      featureId: "image-to-video",
    },
  },
  {
    id: "runninghub:video:seedance-mini-image-to-video",
    provider: "runninghub",
    capability: "video.image_to_video",
    label: "Seedance Mini Image to Video",
    async: true,
    outputKind: "video",
    defaultTimeoutMs: 30 * 60_000,
    parameterSchema: [
      { id: "firstFrameUrl", label: "First frame URL", type: "url", required: true },
      { id: "lastFrameUrl", label: "Last frame URL", type: "url" },
      { id: "prompt", label: "Prompt", type: "textarea" },
      selectParameter("duration", "Duration", "5", SEEDANCE_VIDEO_DURATION_OPTIONS),
      selectParameter("resolution", "Resolution", "720p", SEEDANCE_VIDEO_RESOLUTION_OPTIONS),
      selectParameter("ratio", "Aspect ratio", "adaptive", VIDEO_RATIO_OPTIONS),
      selectParameter("generateAudio", "Generate audio", "true", VIDEO_BOOL_OPTIONS),
      selectParameter("realPersonMode", "Real person mode", "true", VIDEO_BOOL_OPTIONS),
      {
        id: "returnLastFrame",
        label: "Return last frame",
        type: "select",
        defaultValue: "false",
        options: VIDEO_BOOL_OPTIONS,
      },
      {
        id: "seed",
        label: "Seed",
        type: "number",
        defaultValue: -1,
        min: -1,
        max: 2147483647,
      },
    ],
    providerMetadata: {
      nativeModel: "seedance-mini-image-to-video",
      featureId: "image-to-video",
    },
  },
  {
    id: "runninghub:video:digital-human",
    provider: "runninghub",
    capability: "video.digital_human",
    label: "RunningHub Digital Human",
    async: true,
    outputKind: "video",
    defaultTimeoutMs: 30 * 60_000,
    parameterSchema: [
      { id: "audioUrl", label: "Audio URL", type: "url" },
      { id: "avatarImageUrl", label: "Avatar image URL", type: "url", required: true },
      { id: "script", label: "Script", type: "textarea" },
      { id: "prompt", label: "Scene prompt", type: "textarea" },
      { id: "seed", label: "Seed", type: "number", defaultValue: -1 },
    ],
    providerMetadata: {
      nativeModel: "runninghub-digital-human",
      featureId: "digital-human",
    },
  },
  {
    id: "minimax:audio:music-2.6",
    provider: "minimax",
    capability: "audio.generate",
    label: "MiniMax Music 2.6",
    async: true,
    outputKind: "audio",
    defaultTimeoutMs: 30 * 60_000,
    parameterSchema: [
      { id: "stylePrompt", label: "Style prompt", type: "textarea", required: true },
      selectParameter("lyricsSource", "Lyrics source", "ai_generate", [
        { label: "Manual", value: "manual" },
        { label: "AI generate", value: "ai_generate" },
      ]),
      { id: "lyrics", label: "Lyrics", type: "textarea" },
      { id: "lyricsPrompt", label: "Lyrics prompt", type: "textarea" },
      { id: "referenceAudioUrl", label: "Reference audio URL", type: "url" },
    ],
    providerMetadata: {
      nativeModel: "music-2.6",
      featureId: "ai-music",
    },
  },
  {
    id: "minimax:audio:voice-clone",
    provider: "minimax",
    capability: "audio.voice_clone",
    label: "MiniMax Voice Clone",
    async: false,
    outputKind: "audio",
    parameterSchema: [
      { id: "voiceId", label: "Voice ID", type: "text" },
      { id: "previewText", label: "Preview text", type: "textarea", required: true },
      { id: "promptText", label: "Prompt text", type: "text" },
      selectParameter("needNoiseReduction", "Noise reduction", "false", VIDEO_BOOL_OPTIONS),
      { id: "referenceAudioFileId", label: "Reference audio file ID", type: "text", required: true },
    ],
    providerMetadata: {
      nativeModel: "voice-clone",
      featureId: "voice-clone",
    },
  },
  {
    id: "minimax:audio:speech-2.8-hd",
    provider: "minimax",
    capability: "audio.voice_synthesis",
    label: "MiniMax Speech 2.8 HD",
    async: true,
    outputKind: "audio",
    defaultTimeoutMs: 30 * 60_000,
    parameterSchema: [
      { id: "prompt", label: "Text content", type: "textarea", required: true },
      { id: "voiceId", label: "Voice ID", type: "text", required: true },
      selectParameter("languageBoost", "Language boost", "auto", [
        { label: "Auto", value: "auto" },
        { label: "Chinese", value: "Chinese" },
        { label: "English", value: "English" },
      ]),
      {
        id: "speed",
        label: "Speed",
        type: "number",
        defaultValue: 1,
        min: 0.5,
        max: 2,
        step: 0.1,
      },
      {
        id: "volume",
        label: "Volume",
        type: "number",
        defaultValue: 1,
        min: 0,
        max: 10,
        step: 0.1,
      },
      {
        id: "pitch",
        label: "Pitch",
        type: "number",
        defaultValue: 1,
        min: 0.5,
        max: 2,
        step: 0.1,
      },
    ],
    providerMetadata: {
      nativeModel: "speech-2.8-hd",
      featureId: "voice-synthesis",
    },
  },
]

const modelById = new Map(models.map((model) => [model.id, model]))
const defaultModelsByCapability = new Map<ModelCapability, string>([
  ["text.generate", "openai:text:gpt-5.4-mini"],
  ["image.text_to_image", "runninghub:image:seedream-v5-text-to-image"],
  ["image.image_to_image", "runninghub:image:seedream-v5-image-to-image"],
  ["video.text_to_video", `minimax:video:text-to-video:${DEFAULT_MINIMAX_VIDEO_MODEL}`],
  ["video.image_to_video", `minimax:video:image-to-video:${DEFAULT_MINIMAX_VIDEO_MODEL}`],
  ["video.digital_human", "runninghub:video:digital-human"],
  ["audio.generate", "minimax:audio:music-2.6"],
  ["audio.voice_clone", "minimax:audio:voice-clone"],
  ["audio.voice_synthesis", "minimax:audio:speech-2.8-hd"],
])

export function listModels(input: { capability?: ModelCapability } = {}) {
  return input.capability ? models.filter((model) => model.capability === input.capability) : [...models]
}

export function getModelDefinition(modelId: string) {
  return modelById.get(modelId) || null
}

export function getDefaultModelId(capability: ModelCapability) {
  return defaultModelsByCapability.get(capability) || null
}

export function findModelByCapabilityAndAlias(input: {
  capability: ModelCapability
  value: unknown
}) {
  const normalized = typeof input.value === "string" ? input.value.trim() : ""
  if (!normalized) return null

  return (
    listModels({ capability: input.capability }).find((model) => model.id === normalized) ||
    listModels({ capability: input.capability }).find((model) => model.providerMetadata?.nativeModel === normalized) ||
    listModels({ capability: input.capability }).find((model) => model.label === normalized) ||
    null
  )
}

export function validateAndNormalizeModelInput(model: ModelDefinition, input: Record<string, unknown>) {
  const next: Record<string, unknown> = {}

  for (const field of model.parameterSchema) {
    const rawValue = input[field.id]
    const value = rawValue ?? field.defaultValue

    if (value === undefined || value === null || value === "") {
      if (field.required) {
        throw new Error(`${field.id}_required`)
      }
      continue
    }

    if (field.type === "select" && field.options && field.options.length > 0) {
      const normalized = String(value)
      const option = field.options.find((item) => item.value === normalized)
      if (!option) {
        throw new Error(`${field.id}_invalid`)
      }
      next[field.id] = option.value
      continue
    }

    if (field.type === "number") {
      const numeric = typeof value === "number" ? value : Number(value)
      if (!Number.isFinite(numeric)) {
        throw new Error(`${field.id}_invalid`)
      }
      if (typeof field.min === "number" && numeric < field.min) {
        throw new Error(`${field.id}_invalid`)
      }
      if (typeof field.max === "number" && numeric > field.max) {
        throw new Error(`${field.id}_invalid`)
      }
      next[field.id] = numeric
      continue
    }

    next[field.id] = value
  }

  return next
}
