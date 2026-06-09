import type { AppLocale } from "@/lib/i18n/config"

export type CapabilityMediaWorkspaceFeatureId =
  | "ai-music"
  | "voice-clone"
  | "voice-synthesis"
  | "ai-video"
  | "face-fusion"
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
  action: "generate" | "voice-clone" | "voice-synthesis" | "workflow-plan"
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
  action: "generate" | "voice-clone" | "voice-synthesis" | "workflow-plan"
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
      zh: "支持从文字或素材生成视频，统一承接换脸、数字人和高清化场景。",
      en: "Handle text/material-to-video, face fusion, digital humans, and enhancement in one video workspace.",
    },
  },
]

const DURATION_OPTIONS: LocalizedOption[] = [
  { value: "15", label: { zh: "15 秒", en: "15 sec" } },
  { value: "30", label: { zh: "30 秒", en: "30 sec" } },
  { value: "60", label: { zh: "60 秒", en: "60 sec" } },
]

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
    id: "ai-video",
    groupId: "video-processing",
    capabilitySlug: "ai-video",
    previewKind: "video",
    title: { zh: "AI视频", en: "AI Video" },
    summary: {
      zh: "输入文字描述即可快速生成包含画面、场景和情节的动态视频。",
      en: "Generate dynamic video scenes directly from a structured text brief.",
    },
    submitLabel: { zh: "生成视频", en: "Generate video" },
    action: "workflow-plan",
    fields: [
      {
        id: "prompt",
        type: "textarea",
        label: { zh: "视频描述", en: "Video brief" },
        placeholder: { zh: "例如：一支 15 秒 AI 产品预热视频，强调增长与未来感。", en: "Example: A 15-second AI product teaser focused on growth and futurism." },
      },
      {
        id: "duration",
        type: "select",
        label: { zh: "时长", en: "Duration" },
        defaultValue: "15",
        options: DURATION_OPTIONS,
      },
      {
        id: "aspectRatio",
        type: "select",
        label: { zh: "画幅比例", en: "Aspect ratio" },
        defaultValue: "16:9",
        options: [
          { value: "16:9", label: { zh: "横版 16:9", en: "Landscape 16:9" } },
          { value: "9:16", label: { zh: "竖版 9:16", en: "Portrait 9:16" } },
          { value: "1:1", label: { zh: "方形 1:1", en: "Square 1:1" } },
        ],
      },
      {
        id: "style",
        type: "text",
        label: { zh: "画面风格", en: "Visual style" },
        placeholder: { zh: "例如：高端科技、电影感、冷色调", en: "Example: premium tech, cinematic, cool palette" },
      },
      {
        id: "deliveryGoal",
        type: "select",
        label: { zh: "投放目标", en: "Delivery goal" },
        defaultValue: "launch",
        options: [
          { value: "launch", label: { zh: "新品发布", en: "Product launch" } },
          { value: "ads", label: { zh: "广告投放", en: "Paid ads" } },
          { value: "social", label: { zh: "社媒传播", en: "Social media" } },
        ],
      },
    ],
  },
  {
    id: "face-fusion",
    groupId: "video-processing",
    capabilitySlug: "ai-video",
    previewKind: "video",
    title: { zh: "人脸融合", en: "Face Fusion" },
    summary: {
      zh: "将目标人脸特征融合进素材视频，生成新的合成视频。",
      en: "Fuse a target face into source video material to create a new composite output.",
    },
    submitLabel: { zh: "开始融合", en: "Start fusion" },
    action: "workflow-plan",
    fields: [
      {
        id: "sourceVideoUrl",
        type: "url",
        label: { zh: "源视频 URL", en: "Source video URL" },
        placeholder: { zh: "粘贴待处理视频地址", en: "Paste the source video URL" },
      },
      {
        id: "faceImageUrl",
        type: "url",
        label: { zh: "目标人脸图片 URL", en: "Target face image URL" },
        placeholder: { zh: "粘贴目标人脸图片地址", en: "Paste the target face image URL" },
      },
      {
        id: "prompt",
        type: "textarea",
        label: { zh: "融合说明", en: "Fusion brief" },
        placeholder: { zh: "说明需要保留的风格、镜头或表情特征", en: "Describe the style, shots, or expressions to preserve" },
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
      zh: "输入文本即可驱动数字人流畅口播，适配品牌宣讲和多场景解说。",
      en: "Drive a digital human presenter from text for branded narration and scripted delivery.",
    },
    submitLabel: { zh: "生成口播视频", en: "Generate presenter video" },
    action: "workflow-plan",
    fields: [
      {
        id: "avatarSourceUrl",
        type: "url",
        label: { zh: "数字人素材 URL", en: "Avatar source URL" },
        placeholder: { zh: "粘贴人物素材或形象资源地址", en: "Paste the avatar or source asset URL" },
      },
      {
        id: "prompt",
        type: "textarea",
        label: { zh: "口播文本", en: "Presenter script" },
        placeholder: { zh: "输入数字人需要口播的完整文本", en: "Enter the complete presenter script" },
      },
      {
        id: "voiceStyle",
        type: "text",
        label: { zh: "声音风格", en: "Voice style" },
        placeholder: { zh: "例如：可信、专业、节奏明快", en: "Example: credible, professional, energetic pace" },
      },
      {
        id: "language",
        type: "select",
        label: { zh: "语言", en: "Language" },
        defaultValue: "zh-CN",
        options: [
          { value: "zh-CN", label: { zh: "中文", en: "Chinese" } },
          { value: "en-US", label: { zh: "英文", en: "English" } },
        ],
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
      zh: "修复模糊、噪点和细节损失，提升画质与观感。",
      en: "Enhance sharpness, repair detail loss, and improve perceived video quality.",
    },
    submitLabel: { zh: "开始高清化", en: "Enhance video" },
    action: "workflow-plan",
    fields: [
      {
        id: "sourceVideoUrl",
        type: "url",
        label: { zh: "源视频 URL", en: "Source video URL" },
        placeholder: { zh: "粘贴待高清化的视频地址", en: "Paste the source video URL to enhance" },
      },
      {
        id: "prompt",
        type: "textarea",
        label: { zh: "增强目标", en: "Enhancement goal" },
        placeholder: { zh: "例如：提升细节、修复压缩模糊、强化人物边缘", en: "Example: recover detail, reduce compression blur, sharpen subject edges" },
      },
      {
        id: "resolutionTarget",
        type: "select",
        label: { zh: "目标清晰度", en: "Target resolution" },
        defaultValue: "1080p",
        options: [
          { value: "1080p", label: { zh: "1080p", en: "1080p" } },
          { value: "2k", label: { zh: "2K", en: "2K" } },
          { value: "4k", label: { zh: "4K", en: "4K" } },
        ],
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
