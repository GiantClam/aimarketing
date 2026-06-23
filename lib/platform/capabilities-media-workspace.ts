import type { AppLocale } from "@/lib/i18n/config"
import { buildModelSelectOptions, buildRuntimeFieldsForModel } from "@/lib/ai-runtime/ui"
import {
  getDefaultModelId,
  getModelDefinition,
  listModels,
} from "@/lib/ai-runtime/model-registry"
import type { ModelCapability } from "@/lib/ai-runtime/capabilities"

export type CapabilityMediaWorkspaceFeatureId =
  | "ai-music"
  | "voice-clone"
  | "voice-synthesis"
  | "text-to-video"
  | "image-to-video"
  | "digital-human"
  | "video-enhance"

export type CapabilityMediaWorkspaceGroupId = "audio-processing" | "video-processing"

type LocalizedText = {
  zh: string
  en: string
}

type LocalizedOption = {
  value: string
  label: LocalizedText
}

type FeatureFieldBase = {
  id: string
  label: LocalizedText
  placeholder?: LocalizedText
  defaultValue?: string
}

type CapabilityMediaWorkspaceField =
  | (FeatureFieldBase & { type: "text" | "url" | "textarea" | "number" })
  | (FeatureFieldBase & { type: "select"; options: LocalizedOption[] })

type CapabilityMediaWorkspaceFeatureDefinition = {
  id: CapabilityMediaWorkspaceFeatureId
  groupId: CapabilityMediaWorkspaceGroupId
  capabilitySlug: "ai-music" | "ai-video"
  previewKind: "audio" | "video"
  title: LocalizedText
  summary: LocalizedText
  submitLabel: LocalizedText
  action: "generate" | "voice-clone" | "voice-synthesis"
  fields: CapabilityMediaWorkspaceField[]
}

type CapabilityMediaWorkspaceGroupDefinition = {
  id: CapabilityMediaWorkspaceGroupId
  title: LocalizedText
  description: LocalizedText
}

export type CapabilityMediaWorkspaceGroup = {
  id: CapabilityMediaWorkspaceGroupId
  title: string
  description: string
}

export type CapabilityMediaWorkspaceFieldView =
  | (Omit<FeatureFieldBase, "label" | "placeholder"> & {
      type: "text" | "url" | "textarea" | "number"
      label: string
      placeholder?: string
    })
  | (Omit<FeatureFieldBase, "label" | "placeholder"> & {
      type: "select"
      label: string
      placeholder?: string
      options: Array<{ value: string; label: string }>
    })

export type CapabilityMediaWorkspaceFeature = {
  id: CapabilityMediaWorkspaceFeatureId
  groupId: CapabilityMediaWorkspaceGroupId
  capabilitySlug: "ai-music" | "ai-video"
  previewKind: "audio" | "video"
  title: string
  summary: string
  submitLabel: string
  action: "generate" | "voice-clone" | "voice-synthesis"
  fields: CapabilityMediaWorkspaceFieldView[]
}

export type CapabilityMediaWorkspaceConfig = {
  groups: CapabilityMediaWorkspaceGroup[]
  features: CapabilityMediaWorkspaceFeature[]
}

function localizeText(locale: AppLocale, value: LocalizedText) {
  return locale === "zh" ? value.zh : value.en
}

const GROUPS: CapabilityMediaWorkspaceGroupDefinition[] = [
  {
    id: "audio-processing",
    title: { zh: "音频处理", en: "Audio Processing" },
    description: {
      zh: "支持语音克隆、声音合成与高保真音乐生成，统一通过音频工作区管理。",
      en: "Handle music generation, voice cloning, and speech synthesis in one audio workspace.",
    },
  },
  {
    id: "video-processing",
    title: { zh: "视频处理", en: "Video Processing" },
    description: {
      zh: "支持文生视频、图生视频、口播数字人和视频高清化，统一在一个视频工作台完成。",
      en: "Handle text-to-video, image-to-video, digital human, and video enhancement tasks in one video workspace.",
    },
  },
]

function resolveVideoCapability(featureId: "text-to-video" | "image-to-video"): ModelCapability {
  return featureId === "image-to-video" ? "video.image_to_video" : "video.text_to_video"
}

function buildVideoModelOptions(featureId: "text-to-video" | "image-to-video"): LocalizedOption[] {
  return buildModelSelectOptions(listModels({ capability: resolveVideoCapability(featureId) })).map((option) => ({
    value: option.value,
    label: {
      zh: option.label,
      en: option.label,
    },
  }))
}

const FEATURES: CapabilityMediaWorkspaceFeatureDefinition[] = [
  {
    id: "ai-music",
    groupId: "audio-processing",
    capabilitySlug: "ai-music",
    previewKind: "audio",
    title: { zh: "AI音乐", en: "AI Music" },
    summary: {
      zh: "生成高保真歌曲与配乐，支持手填歌词或 AI 自动写词。",
      en: "Generate songs and soundtracks with manual lyrics or AI-written lyrics.",
    },
    submitLabel: { zh: "生成音频", en: "Generate audio" },
    action: "generate",
    fields: [
      {
        id: "stylePrompt",
        type: "textarea",
        label: { zh: "风格 / 情绪 / 场景", en: "Style / mood / scene" },
        placeholder: {
          zh: "例如：独立电子流行，克制但有冲劲，适合 AI 产品发布片头。",
          en: "Example: restrained electronic pop with momentum for an AI product launch opener.",
        },
      },
      {
        id: "lyricsSource",
        type: "select",
        label: { zh: "歌词来源", en: "Lyrics source" },
        defaultValue: "manual",
        options: [
          { value: "manual", label: { zh: "手动填写", en: "Manual lyrics" } },
          { value: "ai_generate", label: { zh: "AI 自动生成", en: "AI generate" } },
        ],
      },
      {
        id: "lyrics",
        type: "textarea",
        label: { zh: "歌词", en: "Lyrics" },
        placeholder: {
          zh: "手动填写歌词；如果选择 AI 自动生成，这里会在结果区回显最终歌词。",
          en: "Enter manual lyrics here. When AI generation is selected, the final lyrics will be shown in the result panel.",
        },
      },
      {
        id: "lyricsPrompt",
        type: "textarea",
        label: { zh: "AI 写词提示", en: "AI lyrics prompt" },
        placeholder: {
          zh: "例如：写一首关于新品牌发布夜的中文流行歌，含主歌与副歌。",
          en: "Example: write a Mandarin pop song about a late-night brand launch with verses and chorus.",
        },
      },
    ],
  },
  {
    id: "voice-clone",
    groupId: "audio-processing",
    capabilitySlug: "ai-music",
    previewKind: "audio",
    title: { zh: "声音克隆", en: "Voice Clone" },
    summary: {
      zh: "上传或录制参考音频，快速复刻音色，并生成试听结果供后续合成复用。",
      en: "Upload or record reference audio, clone the voice, and generate a preview for later synthesis.",
    },
    submitLabel: { zh: "复刻音色", en: "Clone voice" },
    action: "voice-clone",
    fields: [
      {
        id: "voiceId",
        type: "text",
        label: { zh: "新音色 ID", en: "New voice ID" },
        placeholder: { zh: "留空则自动生成，例如 voice_brand_host", en: "Leave blank to auto-generate, for example voice_brand_host" },
      },
      {
        id: "previewText",
        type: "textarea",
        label: { zh: "试听文本", en: "Preview script" },
        placeholder: { zh: "例如：欢迎来到 AI Marketing 新品发布会。", en: "Example: Welcome to the AI Marketing launch event." },
      },
      {
        id: "promptText",
        type: "text",
        label: { zh: "示例音频文本", en: "Prompt audio transcript" },
        placeholder: { zh: "仅在上传示例音频时填写，用于增强相似度。", en: "Required only when a prompt audio clip is uploaded to stabilize similarity." },
      },
      {
        id: "needNoiseReduction",
        type: "select",
        label: { zh: "降噪", en: "Noise reduction" },
        defaultValue: "false",
        options: [
          { value: "false", label: { zh: "关闭", en: "Off" } },
          { value: "true", label: { zh: "开启", en: "On" } },
        ],
      },
    ],
  },
  {
    id: "voice-synthesis",
    groupId: "audio-processing",
    capabilitySlug: "ai-music",
    previewKind: "audio",
    title: { zh: "声音合成", en: "Voice Synthesis" },
    summary: {
      zh: "把长文本提交为异步语音任务，查询状态后下载最终音频。",
      en: "Submit long-form text as an async speech task, poll status, and download the final audio.",
    },
    submitLabel: { zh: "合成语音", en: "Synthesize voice" },
    action: "voice-synthesis",
    fields: [
      {
        id: "prompt",
        type: "textarea",
        label: { zh: "文本内容", en: "Text content" },
        placeholder: { zh: "输入需要合成的完整文本", en: "Enter the full script to synthesize" },
      },
      {
        id: "voiceId",
        type: "text",
        label: { zh: "音色", en: "Voice" },
        placeholder: { zh: "从可用音色库选择", en: "Choose from the available voice library" },
      },
      {
        id: "model",
        type: "select",
        label: { zh: "模型", en: "Model" },
        defaultValue: "speech-2.8-hd",
        options: [
          { value: "speech-2.8-hd", label: { zh: "Speech 2.8 HD", en: "Speech 2.8 HD" } },
          { value: "speech-2.8-turbo", label: { zh: "Speech 2.8 Turbo", en: "Speech 2.8 Turbo" } },
        ],
      },
      {
        id: "languageBoost",
        type: "select",
        label: { zh: "语言增强", en: "Language boost" },
        defaultValue: "auto",
        options: [
          { value: "auto", label: { zh: "自动", en: "Auto" } },
          { value: "Chinese", label: { zh: "中文", en: "Chinese" } },
          { value: "English", label: { zh: "英文", en: "English" } },
        ],
      },
      {
        id: "speed",
        type: "number",
        label: { zh: "语速", en: "Speed" },
        defaultValue: "1",
      },
      {
        id: "volume",
        type: "number",
        label: { zh: "音量", en: "Volume" },
        defaultValue: "1",
      },
      {
        id: "pitch",
        type: "number",
        label: { zh: "音高", en: "Pitch" },
        defaultValue: "1",
      },
    ],
  },
  {
    id: "text-to-video",
    groupId: "video-processing",
    capabilitySlug: "ai-video",
    previewKind: "video",
    title: { zh: "文生视频", en: "Text to Video" },
    summary: {
      zh: "直接输入提示词生成视频，默认走 MiniMax 海螺官方文生视频链路。",
      en: "Generate video from prompt text through the official MiniMax Hailuo text-to-video flow by default.",
    },
    submitLabel: { zh: "生成视频", en: "Generate video" },
    action: "generate",
    fields: [
      {
        id: "model",
        type: "select",
        label: { zh: "模型", en: "Model" },
        defaultValue: getDefaultModelId("video.text_to_video") || "",
        options: buildVideoModelOptions("text-to-video"),
      },
    ],
  },
  {
    id: "image-to-video",
    groupId: "video-processing",
    capabilitySlug: "ai-video",
    previewKind: "video",
    title: { zh: "图生视频", en: "Image to Video" },
    summary: {
      zh: "上传或选择首帧图片，默认走 MiniMax 海螺官方图生视频链路。",
      en: "Upload or select a first frame image and generate video through the official MiniMax Hailuo image-to-video flow by default.",
    },
    submitLabel: { zh: "生成视频", en: "Generate video" },
    action: "generate",
    fields: [
      {
        id: "model",
        type: "select",
        label: { zh: "模型", en: "Model" },
        defaultValue: getDefaultModelId("video.image_to_video") || "",
        options: buildVideoModelOptions("image-to-video"),
      },
    ],
  },
  {
    id: "digital-human",
    groupId: "video-processing",
    capabilitySlug: "ai-video",
    previewKind: "video",
    title: { zh: "口播数字人", en: "Digital Human Presenter" },
    summary: {
      zh: "支持上传或选择音频、上传或选择人物图，也支持只填文案走 TTS 驱动。",
      en: "Upload or select audio and avatar image, or submit script-only input to drive the TTS path.",
    },
    submitLabel: { zh: "生成口播视频", en: "Generate presenter video" },
    action: "generate",
    fields: [
      {
        id: "audioUrl",
        type: "url",
        label: { zh: "音频 URL", en: "Audio URL" },
        placeholder: { zh: "上传音频后会自动填入，也可以粘贴素材库音频地址", en: "Uploading audio fills this automatically, or paste an existing asset URL." },
      },
      {
        id: "avatarImageUrl",
        type: "url",
        label: { zh: "人物图片 URL", en: "Avatar image URL" },
        placeholder: { zh: "上传图片后会自动填入，也可以粘贴素材库图片地址", en: "Uploading an image fills this automatically, or paste an existing asset URL." },
      },
      {
        id: "script",
        type: "textarea",
        label: { zh: "口播文案", en: "Script" },
        placeholder: { zh: "未上传音频时，这段文案会走 TTS 合成。", en: "When no audio is uploaded, this script is used for TTS synthesis." },
      },
      {
        id: "prompt",
        type: "textarea",
        label: { zh: "场景提示", en: "Scene prompt" },
        placeholder: { zh: "例如：模特正在做产品展示，进行电商直播带货", en: "Example: A presenter is demonstrating a product in a live commerce setting." },
      },
      {
        id: "seed",
        type: "number",
        label: { zh: "Seed", en: "Seed" },
        defaultValue: "-1",
      },
    ],
  },
  {
    id: "video-enhance",
    groupId: "video-processing",
    capabilitySlug: "ai-video",
    previewKind: "video",
    title: { zh: "视频高清化", en: "Video Enhancement" },
    summary: {
      zh: "上传或选择源视频，走 RunningHub workflow 视频修复链路。",
      en: "Upload or select a source video and run it through the RunningHub workflow enhancement flow.",
    },
    submitLabel: { zh: "开始高清化", en: "Enhance video" },
    action: "generate",
    fields: [
      {
        id: "sourceVideoUrl",
        type: "url",
        label: { zh: "源视频 URL", en: "Source video URL" },
        placeholder: { zh: "上传视频后会自动填入，也可以粘贴素材库视频地址", en: "Uploading a video fills this automatically, or paste an existing asset URL." },
      },
      {
        id: "prompt",
        type: "textarea",
        label: { zh: "增强目标", en: "Enhancement goal" },
        placeholder: { zh: "例如：提升细节、修复压缩模糊、强化人物边缘", en: "Example: recover detail, reduce compression blur, sharpen subject edges." },
      },
      {
        id: "durationLimit",
        type: "number",
        label: { zh: "处理时长上限（秒）", en: "Duration limit (sec)" },
        defaultValue: "10",
      },
      {
        id: "seed",
        type: "number",
        label: { zh: "Seed", en: "Seed" },
        defaultValue: "-1",
      },
    ],
  },
]

export function getCapabilityMediaWorkspaceFeatures(locale: AppLocale): CapabilityMediaWorkspaceConfig {
  return {
    groups: GROUPS.map((group) => ({
      id: group.id,
      title: localizeText(locale, group.title),
      description: localizeText(locale, group.description),
    })),
    features: FEATURES.map((feature) => ({
      id: feature.id,
      groupId: feature.groupId,
      capabilitySlug: feature.capabilitySlug,
      previewKind: feature.previewKind,
      title: localizeText(locale, feature.title),
      summary: localizeText(locale, feature.summary),
      submitLabel: localizeText(locale, feature.submitLabel),
      action: feature.action,
      fields: feature.fields.map((field) => {
        if (field.type === "select") {
          return {
            id: field.id,
            type: field.type,
            label: localizeText(locale, field.label),
            placeholder: field.placeholder ? localizeText(locale, field.placeholder) : undefined,
            defaultValue: field.defaultValue,
            options: field.options.map((option) => ({
              value: option.value,
              label: localizeText(locale, option.label),
            })),
          } satisfies CapabilityMediaWorkspaceFieldView
        }
        return {
          id: field.id,
          type: field.type,
          label: localizeText(locale, field.label),
          placeholder: field.placeholder ? localizeText(locale, field.placeholder) : undefined,
          defaultValue: field.defaultValue,
        } satisfies CapabilityMediaWorkspaceFieldView
      }),
    })),
  }
}

export function resolveCapabilityMediaWorkspaceVideoFields(
  locale: AppLocale,
  featureId: "text-to-video" | "image-to-video",
  selectedModelId?: string | null,
): CapabilityMediaWorkspaceFieldView[] {
  const capability = resolveVideoCapability(featureId)
  const modelOptions = buildModelSelectOptions(listModels({ capability }))
  const modelId = selectedModelId || getDefaultModelId(capability) || modelOptions[0]?.value || ""
  const model = getModelDefinition(modelId) || getModelDefinition(getDefaultModelId(capability) || "")

  const modelField: CapabilityMediaWorkspaceFieldView = {
    id: "model",
    type: "select",
    label: locale === "zh" ? "模型" : "Model",
    defaultValue: modelId,
    options: modelOptions,
  }

  if (!model) {
    return [modelField]
  }

  return [
    modelField,
    ...buildRuntimeFieldsForModel(model, locale)
      .filter((field) => field.id !== "model")
      .map((field) => {
        if (field.type === "select") {
          return {
            id: field.id,
            type: "select",
            label: field.label,
            placeholder: field.placeholder,
            defaultValue: field.defaultValue,
            options: field.options || [],
          } satisfies CapabilityMediaWorkspaceFieldView
        }

        return {
          id: field.id,
          type: field.type,
          label: field.label,
          placeholder: field.placeholder,
          defaultValue: field.defaultValue,
        } satisfies CapabilityMediaWorkspaceFieldView
      }),
  ]
}
