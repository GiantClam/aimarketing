"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { AudioLines, ExternalLink, FileUp, ImageIcon, Trash2, Video } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { buildModelSelectOptions, buildRuntimeFieldsForModel } from "@/lib/ai-runtime/ui"
import {
  findModelByCapabilityAndAlias,
  getDefaultModelId,
  getModelDefinition,
  listModels,
} from "@/lib/ai-runtime/model-registry"
import {
  getWorkflowImageDefaultSize,
  getWorkflowImageSizeOptions,
  normalizeGptImage2Size,
  normalizeRunningHubSeedreamSize,
  resolveWorkflowImageModelKind,
} from "@/lib/image-assistant/model-options"
import type { WorkflowDefinitionNode } from "@/lib/workflows/schema"

type WorkflowAssetCandidate = {
  id: number
  title: string
  kind: string
  mimeType: string | null
  previewKind: "image" | "video" | "audio" | "file"
  sourceUrl: string | null
  previewUrl: string
  downloadUrl: string
}

type UploadedWorkflowFile = {
  fileName: string
  mimeType: string
  storageKey?: string
  url?: string | null
}

type WorkflowLlmModelOption = {
  modelId: string
  label: string
  optionId?: string | null
}

type WorkflowLlmProviderOption = {
  providerId: string
  label: string
  models: WorkflowLlmModelOption[]
}

type WorkflowModelSelectOption = {
  value: string
  providerId: string
  modelId: string
  label: string
}

type WorkflowVoiceOption = {
  voiceId: string
  voiceName: string
  category: "system" | "voice_cloning" | "voice_generation"
  description: string[]
}

type WriterPlatformOption = {
  value: string
  label: string
}

type WorkflowNodeEditorFieldsProps = {
  locale: "zh" | "en"
  node: WorkflowDefinitionNode
  assets: WorkflowAssetCandidate[]
  llmModelCatalog: {
    defaultProviderId: string | null
    defaultModelId: string | null
    providers: WorkflowLlmProviderOption[]
  }
  workflowImageProviderOptions: Array<{
    providerId: string
    label: string
    models: WorkflowLlmModelOption[]
  }>
  voiceOptions: WorkflowVoiceOption[]
  textPromptSuggestions?: Array<{
    sourceNodeKey: string
    sourceTitle: string
    alias: string
    token: string
    targetNodeKey: string
    targetNodeTitle: string
  }>
  uploadPending: boolean
  showPersistedPreview?: boolean
  onUpdateNode: (nodeKey: string, patch: Partial<WorkflowDefinitionNode>) => void
  onUploadFiles: (nodeKey: string, files: FileList | null) => Promise<void>
}

type OptionItem = {
  value: string
  label: string
}

function asString(value: unknown) {
  return typeof value === "string" ? value : ""
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function resolveWorkflowVideoCapability(featureId: "text-to-video" | "image-to-video") {
  return featureId === "image-to-video" ? "video.image_to_video" : "video.text_to_video"
}

function buildWorkflowModelSelectionValue(input: {
  providerId: string
  modelId: string
}) {
  return `${input.providerId}::${encodeURIComponent(input.modelId)}`
}

function parseWorkflowModelSelectionValue(value: string) {
  const separatorIndex = value.indexOf("::")
  if (separatorIndex <= 0) return null
  const providerId = value.slice(0, separatorIndex).trim()
  const encodedModelId = value.slice(separatorIndex + 2)
  const modelId = decodeURIComponent(encodedModelId).trim()
  if (!providerId || !modelId) return null
  return { providerId, modelId }
}

function buildWorkflowModelSelectOption(input: {
  providerId: string
  providerLabel: string
  modelId: string
  modelLabel?: string | null
  optionId?: string | null
}) {
  return {
    value:
      input.optionId ||
      buildWorkflowModelSelectionValue({
        providerId: input.providerId,
        modelId: input.modelId,
      }),
    providerId: input.providerId,
    modelId: input.modelId,
    label: `${input.providerLabel} / ${(input.modelLabel || input.modelId).trim() || input.modelId}`,
  } satisfies WorkflowModelSelectOption
}

function SectionLabel({ children }: { children: string }) {
  return <div className="text-[11px] font-semibold text-muted-foreground">{children}</div>
}

function getVoiceCategoryLabel(locale: "zh" | "en", category: WorkflowVoiceOption["category"]) {
  if (locale === "zh") {
    if (category === "system") return "系统音色"
    if (category === "voice_cloning") return "复刻音色"
    return "生成音色"
  }

  if (category === "system") return "System"
  if (category === "voice_cloning") return "Cloned"
  return "Generated"
}

function getTextPromptAutocompleteState(text: string, selectionStart: number | null) {
  if (selectionStart === null || selectionStart < 2) return null
  const beforeCursor = text.slice(0, selectionStart)
  const tokenStart = beforeCursor.lastIndexOf("{{")
  if (tokenStart === -1) return null
  const latestTokenEnd = beforeCursor.lastIndexOf("}}")
  if (latestTokenEnd > tokenStart) return null

  const rawQuery = beforeCursor.slice(tokenStart + 2)
  if (rawQuery.includes("\n") || rawQuery.includes("}")) return null

  return {
    tokenStart,
    selectionStart,
    query: rawQuery.trim().toLowerCase(),
  }
}

function OptionChips({
  options,
  value,
  onChange,
}: {
  options: OptionItem[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={[
              "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
              active
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border/70 bg-background/80 text-foreground hover:border-primary/40 hover:bg-background",
            ].join(" ")}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function MediaPreview({
  kind,
  url,
  title,
  locale,
}: {
  kind: "image" | "video" | "audio"
  url: string
  title: string
  locale: "zh" | "en"
}) {
  const copy =
    locale === "zh"
      ? {
          latestPreview: "最近预览",
        }
      : {
          latestPreview: "Latest preview",
        }

  return (
    <div className="overflow-hidden rounded-[12px] border border-border/70 bg-background/70">
      <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
        {kind === "image" ? <ImageIcon className="size-3.5 text-muted-foreground" /> : null}
        {kind === "video" ? <Video className="size-3.5 text-muted-foreground" /> : null}
        {kind === "audio" ? <AudioLines className="size-3.5 text-muted-foreground" /> : null}
        <div className="truncate text-[11px] font-semibold text-muted-foreground">{copy.latestPreview}</div>
      </div>
      <div className="p-2">
        {kind === "image" ? (
          <img src={url} alt={title} className="aspect-video w-full rounded-[10px] object-cover" />
        ) : null}
        {kind === "video" ? (
          <video src={url} controls className="aspect-video w-full rounded-[10px] bg-black/80" />
        ) : null}
        {kind === "audio" ? (
          <div className="rounded-[10px] bg-card/80 p-3">
            <audio src={url} controls className="w-full" />
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function WorkflowNodeEditorFields({
  locale,
  node,
  assets,
  llmModelCatalog,
  workflowImageProviderOptions,
  voiceOptions,
  textPromptSuggestions = [],
  uploadPending,
  showPersistedPreview = true,
  onUpdateNode,
  onUploadFiles,
}: WorkflowNodeEditorFieldsProps) {
  const textInputRef = useRef<HTMLTextAreaElement | null>(null)
  const [textSelectionStart, setTextSelectionStart] = useState<number | null>(null)
  const [textInputFocused, setTextInputFocused] = useState(false)
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0)
  const copy =
    locale === "zh"
      ? {
          uploadNew: "上传新素材",
          uploadedFiles: "已上传",
          libraryRefs: "素材库",
          textValue: "文本",
          assetLibrary: "打开素材库",
          uploadPending: "上传中...",
          removeUpload: "移除",
          noUploads: "还没有文件。",
          noAssetCandidates: "素材库暂时没有可选素材。",
          suggestionTarget: "用于",
          provider: "Provider",
          model: "模型",
          systemPrompt: "系统提示词",
          prompt: "提示词",
          promptPlaceholder: "输入图片生成提示词。",
          writerPlatform: "平台",
          writerMode: "体裁",
          writerLanguage: "输出语言",
          size: "尺寸",
          resolution: "分辨率",
          count: "数量",
          quality: "质量",
          background: "背景",
          format: "格式",
          compression: "压缩率",
          moderation: "审核",
          customSize: "自定义尺寸",
          customSizePlaceholder: "例如 1536x864",
          autoSize: "自动",
          unsupportedModelParams: "当前模型暂未配置参数面板。",
          mode: "模式",
          duration: "时长",
          ratio: "画幅",
          sound: "音频",
          realPerson: "真人模式",
          avatarImageUrl: "人物图片 URL",
          audioUrl: "音频 URL",
          script: "口播文案",
          scenePrompt: "场景提示词",
          estimatedVideoSeconds: "视频秒数",
          audioTrimStart: "音频起点",
          audioTrimEnd: "音频终点",
          genre: "类型",
          mood: "情绪",
          vocals: "演唱",
          lyrics: "歌词",
          voice: "音色",
          chooseVoice: "选择音色",
          noVoiceOptions: "暂时没有可选音色。",
          languageBoost: "语言增强",
          speed: "语速",
          volume: "音量",
          pitch: "音高",
          pageCount: "页数",
          scenario: "场景",
          language: "语言",
          fileName: "文件名称",
          fileNamePlaceholder: "留空时自动生成不重复名称",
          fileNameHint: "如果素材库中存在同名文件，将使用新结果覆盖旧文件。",
          latestPreview: "最近预览",
          auto: "自动",
          modelAuto: "自动路由",
          on: "开启",
          off: "关闭",
        }
      : {
          uploadNew: "Upload files",
          uploadedFiles: "Uploads",
          libraryRefs: "Asset library",
          textValue: "Text",
          assetLibrary: "Open asset library",
          uploadPending: "Uploading...",
          removeUpload: "Remove",
          noUploads: "No files yet.",
          noAssetCandidates: "No matching assets yet.",
          suggestionTarget: "For",
          provider: "Provider",
          model: "Model",
          systemPrompt: "System prompt",
          prompt: "Prompt",
          promptPlaceholder: "Write the image prompt.",
          writerPlatform: "Platform",
          writerMode: "Format",
          writerLanguage: "Output language",
          size: "Size",
          resolution: "Resolution",
          count: "Count",
          quality: "Quality",
          background: "Background",
          format: "Format",
          compression: "Compression",
          moderation: "Moderation",
          customSize: "Custom size",
          customSizePlaceholder: "For example 1536x864",
          autoSize: "Auto",
          unsupportedModelParams: "This model does not have a configured parameter panel yet.",
          mode: "Mode",
          duration: "Duration",
          ratio: "Ratio",
          sound: "Sound",
          realPerson: "Real-person",
          avatarImageUrl: "Avatar image URL",
          audioUrl: "Audio URL",
          script: "Script",
          scenePrompt: "Scene prompt",
          estimatedVideoSeconds: "Video seconds",
          audioTrimStart: "Audio start",
          audioTrimEnd: "Audio end",
          genre: "Genre",
          mood: "Mood",
          vocals: "Vocals",
          lyrics: "Lyrics",
          voice: "Voice",
          chooseVoice: "Choose a voice",
          noVoiceOptions: "No voices available right now.",
          languageBoost: "Language boost",
          speed: "Speed",
          volume: "Volume",
          pitch: "Pitch",
          pageCount: "Pages",
          scenario: "Scenario",
          language: "Language",
          fileName: "File name",
          fileNamePlaceholder: "Leave empty to auto-generate a unique name",
          fileNameHint: "If the asset library already contains the same file name, the new result replaces it.",
          latestPreview: "Latest preview",
          auto: "Auto",
          modelAuto: "Auto routing",
          on: "On",
          off: "Off",
        }

  const updateConfig = (patch: Record<string, unknown>) => {
    onUpdateNode(node.nodeKey, {
      config: {
        ...node.config,
        ...patch,
      },
    })
  }

  const uploadedFiles = Array.isArray(node.config.uploadedFiles)
    ? node.config.uploadedFiles.filter((item): item is UploadedWorkflowFile => Boolean(item && typeof item === "object"))
    : []
  const referencedArtifactIds = Array.isArray(node.config.referencedArtifactIds)
    ? node.config.referencedArtifactIds.filter((value): value is number => Number.isInteger(value) && value > 0)
    : []

  const previewImageUrl = asString(node.config.previewImageUrl)
  const previewImageTitle = asString(node.config.previewImageTitle) || node.title
  const previewVideoUrl = asString(node.config.previewVideoUrl)
  const previewVideoTitle = asString(node.config.previewVideoTitle) || node.title
  const previewAudioUrl = asString(node.config.previewAudioUrl)
  const previewAudioTitle = asString(node.config.previewAudioTitle) || node.title
  const languageOptions: OptionItem[] = [
    { value: "zh-CN", label: locale === "zh" ? "中文" : "Chinese" },
    { value: "en-US", label: locale === "zh" ? "英文" : "English" },
    { value: "bilingual", label: locale === "zh" ? "双语" : "Bilingual" },
  ]
  const writerPlatformOptions: WriterPlatformOption[] =
    locale === "zh"
      ? [
          { value: "wechat", label: "公众号" },
          { value: "xiaohongshu", label: "小红书" },
          { value: "weibo", label: "微博" },
          { value: "douyin", label: "抖音" },
          { value: "x", label: "X" },
          { value: "linkedin", label: "LinkedIn" },
          { value: "instagram", label: "Instagram" },
          { value: "tiktok", label: "TikTok" },
          { value: "facebook", label: "Facebook" },
          { value: "generic", label: "通用文稿" },
        ]
      : [
          { value: "wechat", label: "WeChat" },
          { value: "xiaohongshu", label: "Xiaohongshu" },
          { value: "weibo", label: "Weibo" },
          { value: "douyin", label: "Douyin" },
          { value: "x", label: "X" },
          { value: "linkedin", label: "LinkedIn" },
          { value: "instagram", label: "Instagram" },
          { value: "tiktok", label: "TikTok" },
          { value: "facebook", label: "Facebook" },
          { value: "generic", label: "Generic" },
        ]
  const writerModeOptions: OptionItem[] =
    locale === "zh"
      ? [
          { value: "article", label: "文章" },
          { value: "thread", label: "串文" },
        ]
      : [
          { value: "article", label: "Article" },
          { value: "thread", label: "Thread" },
        ]
  const writerLanguageOptions: OptionItem[] =
    locale === "zh"
      ? [
          { value: "auto", label: "自动" },
          { value: "zh", label: "中文" },
          { value: "en", label: "English" },
          { value: "ja", label: "日本語" },
          { value: "ko", label: "한국어" },
          { value: "fr", label: "Français" },
          { value: "de", label: "Deutsch" },
          { value: "es", label: "Español" },
        ]
      : [
          { value: "auto", label: "Auto" },
          { value: "zh", label: "Chinese" },
          { value: "en", label: "English" },
          { value: "ja", label: "Japanese" },
          { value: "ko", label: "Korean" },
          { value: "fr", label: "French" },
          { value: "de", label: "German" },
          { value: "es", label: "Spanish" },
        ]
  const workflowImageProviders = workflowImageProviderOptions
  const imageQualityOptions: OptionItem[] = ["auto", "low", "medium", "high"].map((value) => ({ value, label: value }))
  const imageBackgroundOptions: OptionItem[] = ["auto", "opaque", "transparent"].map((value) => ({ value, label: value }))
  const imageFormatOptions: OptionItem[] = ["png", "jpeg", "webp"].map((value) => ({ value, label: value }))
  const imageModerationOptions: OptionItem[] = ["auto", "low"].map((value) => ({ value, label: value }))
  const videoModeOptions: OptionItem[] =
    locale === "zh"
      ? [
          { value: "text-to-video", label: "文生视频" },
          { value: "image-to-video", label: "图生视频" },
        ]
      : [
          { value: "text-to-video", label: "Text to video" },
          { value: "image-to-video", label: "Image to video" },
        ]
  const videoFeatureId = asString(node.config.featureId) === "image-to-video" ? "image-to-video" : "text-to-video"
  const videoCapability = resolveWorkflowVideoCapability(videoFeatureId)
  const resolvedVideoModel =
    findModelByCapabilityAndAlias({
      capability: videoCapability,
      value: asString(node.config.model),
    }) ||
    getModelDefinition(getDefaultModelId(videoCapability) || "") ||
    listModels({ capability: videoCapability })[0] ||
    null
  const currentVideoModelId = resolvedVideoModel?.id || getDefaultModelId(videoCapability) || ""
  const videoModelOptions: OptionItem[] = buildModelSelectOptions(listModels({ capability: videoCapability })).map((option) => ({
    value: option.value,
    label: option.label,
  }))
  const videoParameterFields =
    resolvedVideoModel
      ? buildRuntimeFieldsForModel(resolvedVideoModel, locale).filter((field) => field.id !== "model")
      : []
  const digitalHumanModelOptions: OptionItem[] = buildModelSelectOptions(listModels({ capability: "video.digital_human" })).map((option) => ({
    value: option.value,
    label: option.label,
  }))
  const currentDigitalHumanModelId =
    findModelByCapabilityAndAlias({
      capability: "video.digital_human",
      value: asString(node.config.model),
    })?.id ||
    getDefaultModelId("video.digital_human") ||
    digitalHumanModelOptions[0]?.value ||
    ""
  const audioGenreOptions: OptionItem[] =
    locale === "zh"
      ? [
          { value: "electronic-pop", label: "电子流行" },
          { value: "cinematic", label: "电影配乐" },
          { value: "ambient", label: "氛围电子" },
          { value: "corporate", label: "品牌宣传" },
        ]
      : [
          { value: "electronic-pop", label: "Electronic pop" },
          { value: "cinematic", label: "Cinematic" },
          { value: "ambient", label: "Ambient" },
          { value: "corporate", label: "Corporate" },
        ]
  const audioMoodOptions: OptionItem[] =
    locale === "zh"
      ? [
          { value: "uplifting", label: "向上" },
          { value: "calm", label: "冷静" },
          { value: "dramatic", label: "戏剧" },
          { value: "energetic", label: "高能" },
        ]
      : [
          { value: "uplifting", label: "Uplifting" },
          { value: "calm", label: "Calm" },
          { value: "dramatic", label: "Dramatic" },
          { value: "energetic", label: "Energetic" },
        ]
  const audioVocalsOptions: OptionItem[] =
    locale === "zh"
      ? [
          { value: "instrumental", label: "纯音乐" },
          { value: "female", label: "女声" },
          { value: "male", label: "男声" },
          { value: "choir", label: "合唱" },
        ]
      : [
          { value: "instrumental", label: "Instrumental" },
          { value: "female", label: "Female vocal" },
          { value: "male", label: "Male vocal" },
          { value: "choir", label: "Choir" },
        ]
  const lyricsOptions: OptionItem[] =
    locale === "zh"
      ? [
          { value: "ai_generate", label: "AI 写词" },
          { value: "manual", label: "固定歌词" },
        ]
      : [
          { value: "ai_generate", label: "AI lyrics" },
          { value: "manual", label: "Fixed lyrics" },
        ]
  const speechModelOptions: OptionItem[] = [
    { value: "speech-2.8-hd", label: "Speech 2.8 HD" },
    { value: "speech-2.8-turbo", label: "Speech 2.8 Turbo" },
  ]
  const languageBoostOptions: OptionItem[] =
    locale === "zh"
      ? [
          { value: "auto", label: "自动" },
          { value: "Chinese", label: "中文" },
          { value: "English", label: "English" },
        ]
      : [
          { value: "auto", label: "Auto" },
          { value: "Chinese", label: "Chinese" },
          { value: "English", label: "English" },
        ]
  const speechSpeedOptions: OptionItem[] = ["0.8", "1", "1.2"].map((value) => ({ value, label: `${value}x` }))
  const speechVolumeOptions: OptionItem[] = ["0.8", "1", "1.2"].map((value) => ({ value, label: `${value}x` }))
  const speechPitchOptions: OptionItem[] = ["0.8", "1", "1.2"].map((value) => ({ value, label: `${value}x` }))
  const pageCountOptions: OptionItem[] = ["6", "8", "10", "12"].map((value) => ({ value, label: value }))
  const scenarioOptions: OptionItem[] =
    locale === "zh"
      ? [
          { value: "marketing-campaign", label: "营销方案" },
          { value: "product-launch", label: "产品发布" },
          { value: "sales-proposal", label: "销售提案" },
        ]
      : [
          { value: "marketing-campaign", label: "Campaign" },
          { value: "product-launch", label: "Launch" },
          { value: "sales-proposal", label: "Proposal" },
        ]
  const currentSelectedProviderId =
    asString(node.config.selectedProviderId) || llmModelCatalog.defaultProviderId || llmModelCatalog.providers[0]?.providerId || ""
  const activeProvider =
    llmModelCatalog.providers.find((provider) => provider.providerId === currentSelectedProviderId) ||
    llmModelCatalog.providers[0] ||
    null
  const currentSelectedModelId =
    asString(node.config.selectedModelId) || activeProvider?.models[0]?.modelId || llmModelCatalog.defaultModelId || ""
  const llmModelSelectOptions: WorkflowModelSelectOption[] = llmModelCatalog.providers.flatMap((provider) =>
    provider.models.map((model) =>
      buildWorkflowModelSelectOption({
        providerId: provider.providerId,
        providerLabel: provider.label,
        modelId: model.modelId,
        modelLabel: model.label,
        optionId: model.optionId,
      }),
    ),
  )
  const currentLlmModelSelectionValue =
    llmModelSelectOptions.find(
      (option) =>
        option.providerId === currentSelectedProviderId &&
        option.modelId === currentSelectedModelId,
    )?.value ||
    (currentSelectedProviderId && currentSelectedModelId
      ? buildWorkflowModelSelectionValue({
          providerId: currentSelectedProviderId,
          modelId: currentSelectedModelId,
        })
      : "")
  if (
    currentSelectedProviderId &&
    currentSelectedModelId &&
    currentLlmModelSelectionValue &&
    !llmModelSelectOptions.some((option) => option.value === currentLlmModelSelectionValue)
  ) {
    llmModelSelectOptions.push(
      buildWorkflowModelSelectOption({
        providerId: currentSelectedProviderId,
        providerLabel: activeProvider?.label || currentSelectedProviderId,
        modelId: currentSelectedModelId,
      }),
    )
  }
  const currentImageProviderId =
    asString(node.config.selectedProviderId) || workflowImageProviders[0]?.providerId || "pptoken"
  const activeImageProvider =
    workflowImageProviders.find((provider) => provider.providerId === currentImageProviderId) ||
    workflowImageProviders[0] ||
    null
  const currentImageModelId =
    asString(node.config.selectedModelId) || activeImageProvider?.models[0]?.modelId || "gpt-image-2"
  const currentImageModelOptionId = asString(node.config.selectedModelOptionId)
  const imageModelSelectOptions: WorkflowModelSelectOption[] = workflowImageProviders.flatMap((provider) =>
    provider.models.map((model) =>
      buildWorkflowModelSelectOption({
        providerId: provider.providerId,
        providerLabel: provider.label,
        modelId: model.modelId,
        modelLabel: model.label,
        optionId: model.optionId,
      }),
    ),
  )
  const currentImageModelSelectionValue =
    imageModelSelectOptions.find((option) => option.value === currentImageModelOptionId)?.value ||
    imageModelSelectOptions.find(
      (option) =>
        option.providerId === currentImageProviderId &&
        option.modelId === currentImageModelId,
    )?.value ||
    (currentImageProviderId && currentImageModelId
      ? buildWorkflowModelSelectionValue({
          providerId: currentImageProviderId,
          modelId: currentImageModelId,
        })
      : "")
  if (
    currentImageProviderId &&
    currentImageModelId &&
    currentImageModelSelectionValue &&
    !imageModelSelectOptions.some((option) => option.value === currentImageModelSelectionValue)
  ) {
    imageModelSelectOptions.push(
      buildWorkflowModelSelectOption({
        providerId: currentImageProviderId,
        providerLabel: activeImageProvider?.label || currentImageProviderId,
        modelId: currentImageModelId,
      }),
    )
  }
  const currentImageModelKind = resolveWorkflowImageModelKind(currentImageModelId)
  const imageModelSizeOptions: OptionItem[] = getWorkflowImageSizeOptions(currentImageModelKind).map((option) => ({
    value: option.value,
    label:
      option.value === "auto"
        ? copy.autoSize
        : option.value === "custom"
          ? copy.customSize
          : option.label,
  }))
  const currentImageSize = asString(node.config.imageSize)
  const imageSizeSelection = imageModelSizeOptions.some((option) => option.value === currentImageSize)
    ? currentImageSize
    : currentImageSize
      ? "custom"
      : getWorkflowImageDefaultSize(currentImageModelKind)

  const textPromptAutocompleteState = useMemo(
    () => getTextPromptAutocompleteState(asString(node.config.text), textSelectionStart),
    [node.config.text, textSelectionStart],
  )
  const filteredTextPromptSuggestions = useMemo(() => {
    if (!textInputFocused || !textPromptAutocompleteState) return []
    const query = textPromptAutocompleteState.query
    return textPromptSuggestions.filter((suggestion) => {
      if (!query) return true
      return (
        suggestion.alias.toLowerCase().includes(query) ||
        suggestion.sourceNodeKey.toLowerCase().includes(query) ||
        suggestion.sourceTitle.toLowerCase().includes(query) ||
        suggestion.targetNodeTitle.toLowerCase().includes(query)
      )
    })
  }, [textInputFocused, textPromptAutocompleteState, textPromptSuggestions])

  useEffect(() => {
    setActiveSuggestionIndex(0)
  }, [filteredTextPromptSuggestions.length, textPromptAutocompleteState?.query])

  const applyTextPromptSuggestion = (token: string) => {
    if (!token) return
    const currentText = asString(node.config.text)
    const selectionStart = textInputRef.current?.selectionStart ?? textSelectionStart
    const autocompleteState = getTextPromptAutocompleteState(currentText, selectionStart)
    if (!autocompleteState) return

    const nextText =
      currentText.slice(0, autocompleteState.tokenStart) +
      token +
      currentText.slice(autocompleteState.selectionStart)
    const nextCursor = autocompleteState.tokenStart + token.length

    updateConfig({ text: nextText })
    setTextSelectionStart(nextCursor)

    window.requestAnimationFrame(() => {
      textInputRef.current?.focus()
      textInputRef.current?.setSelectionRange(nextCursor, nextCursor)
    })
  }

  return (
    <div className="space-y-3">
      {showPersistedPreview && previewImageUrl ? (
        <MediaPreview kind="image" url={previewImageUrl} title={previewImageTitle} locale={locale} />
      ) : null}
      {showPersistedPreview && previewVideoUrl ? (
        <MediaPreview kind="video" url={previewVideoUrl} title={previewVideoTitle} locale={locale} />
      ) : null}
      {showPersistedPreview && previewAudioUrl ? (
        <MediaPreview kind="audio" url={previewAudioUrl} title={previewAudioTitle} locale={locale} />
      ) : null}

      {node.type === "upload" ? (
        <div className="space-y-3">
          <div className="rounded-[12px] border border-border/70 bg-background/55 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SectionLabel>{copy.uploadedFiles}</SectionLabel>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-[10px] bg-primary px-3 py-2 text-xs font-medium text-primary-foreground">
                <FileUp className="size-3.5" />
                {uploadPending ? copy.uploadPending : copy.uploadNew}
                <input
                  type="file"
                  multiple
                  className="hidden"
                  disabled={uploadPending}
                  onChange={(event) => {
                    void onUploadFiles(node.nodeKey, event.target.files)
                    event.currentTarget.value = ""
                  }}
                />
              </label>
            </div>

            <div className="mt-3 space-y-2">
              {uploadedFiles.length === 0 ? <div className="text-xs text-muted-foreground">{copy.noUploads}</div> : null}
              {uploadedFiles.map((file, index) => (
                <div
                  key={`${file.storageKey || file.fileName}-${index}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-border/70 bg-card/80 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">{file.fileName}</div>
                    <div className="text-xs text-muted-foreground">{file.mimeType}</div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 rounded-[8px] px-2 text-[10px]"
                    onClick={() =>
                      updateConfig({
                        uploadedFiles: uploadedFiles.filter((_, uploadedIndex) => uploadedIndex !== index),
                      })
                    }
                  >
                    <Trash2 className="size-3" />
                    {copy.removeUpload}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[12px] border border-border/70 bg-background/55 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SectionLabel>{copy.libraryRefs}</SectionLabel>
              <Link
                href="/dashboard/assets"
                target="_blank"
                className="inline-flex items-center gap-2 rounded-[8px] border border-border bg-card px-3 py-2 text-xs font-medium text-foreground"
              >
                <ExternalLink className="size-3.5" />
                {copy.assetLibrary}
              </Link>
            </div>

            <div className="mt-3 grid max-h-48 gap-2 overflow-auto pr-1">
              {assets.length === 0 ? <div className="text-xs text-muted-foreground">{copy.noAssetCandidates}</div> : null}
              {assets.map((asset) => {
                const checked = referencedArtifactIds.includes(asset.id)
                return (
                  <label key={asset.id} className="flex gap-2 rounded-[10px] border border-border/70 bg-card/80 p-2.5">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        updateConfig({
                          referencedArtifactIds: event.target.checked
                            ? [...referencedArtifactIds, asset.id]
                            : referencedArtifactIds.filter((artifactId) => artifactId !== asset.id),
                        })
                      }}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">{asset.title}</div>
                      <div className="text-xs text-muted-foreground">
                        #{asset.id} · {asset.kind}
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>
          </div>
        </div>
      ) : null}

      {node.type === "text_input" ? (
        <div className="space-y-2">
          <SectionLabel>{copy.textValue}</SectionLabel>
          <div className="relative">
            <Textarea
              ref={textInputRef}
              value={asString(node.config.text)}
              onChange={(event) => {
                updateConfig({ text: event.target.value })
                setTextSelectionStart(event.target.selectionStart)
              }}
              onSelect={(event) => setTextSelectionStart(event.currentTarget.selectionStart)}
              onClick={(event) => setTextSelectionStart(event.currentTarget.selectionStart)}
              onFocus={(event) => {
                setTextInputFocused(true)
                setTextSelectionStart(event.currentTarget.selectionStart)
              }}
              onBlur={() => {
                window.setTimeout(() => setTextInputFocused(false), 120)
              }}
              onKeyDown={(event) => {
                if (filteredTextPromptSuggestions.length === 0) return
                if (event.key === "ArrowDown") {
                  event.preventDefault()
                  setActiveSuggestionIndex((current) => (current + 1) % filteredTextPromptSuggestions.length)
                  return
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault()
                  setActiveSuggestionIndex((current) =>
                    current === 0 ? filteredTextPromptSuggestions.length - 1 : current - 1,
                  )
                  return
                }
                if (event.key === "Enter" || event.key === "Tab") {
                  event.preventDefault()
                  applyTextPromptSuggestion(filteredTextPromptSuggestions[activeSuggestionIndex]?.token || "")
                }
              }}
              className="min-h-28 rounded-[10px] border-border/80 bg-background/80 text-sm"
            />

            {filteredTextPromptSuggestions.length > 0 ? (
              <div className="absolute inset-x-0 top-full z-20 mt-2 rounded-[12px] border border-border/80 bg-card/95 p-2 shadow-[0_18px_40px_rgba(15,23,42,0.16)] backdrop-blur-sm">
                <div className="max-h-48 space-y-1 overflow-auto">
                  {filteredTextPromptSuggestions.map((suggestion, index) => (
                    <button
                      key={`${suggestion.targetNodeKey}-${suggestion.sourceNodeKey}-${suggestion.alias}`}
                      type="button"
                      className={[
                        "flex w-full items-start justify-between gap-3 rounded-[10px] px-2.5 py-2 text-left transition",
                        index === activeSuggestionIndex ? "bg-primary/10" : "hover:bg-accent/60",
                      ].join(" ")}
                      onMouseDown={(event) => {
                        event.preventDefault()
                        applyTextPromptSuggestion(suggestion.token)
                      }}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-foreground">{suggestion.token}</div>
                        <div className="truncate text-[11px] text-muted-foreground">
                          {suggestion.sourceNodeKey} · {suggestion.alias} · {suggestion.sourceTitle}
                        </div>
                      </div>
                      <div className="truncate text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                        {copy.suggestionTarget} {suggestion.targetNodeTitle}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {node.type === "writer" ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <SectionLabel>{copy.writerPlatform}</SectionLabel>
            <select
              value={asString(node.config.platform) || (locale === "zh" ? "wechat" : "generic")}
              onChange={(event) => updateConfig({ platform: event.target.value })}
              className="h-10 w-full rounded-[10px] border border-border/80 bg-background/80 px-3 text-sm text-foreground outline-none transition focus:border-primary/50"
            >
              {writerPlatformOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <SectionLabel>{copy.writerMode}</SectionLabel>
            <OptionChips
              options={writerModeOptions}
              value={asString(node.config.mode) || "article"}
              onChange={(value) => updateConfig({ mode: value })}
            />
          </div>
          <div className="space-y-2">
            <SectionLabel>{copy.writerLanguage}</SectionLabel>
            <OptionChips
              options={writerLanguageOptions}
              value={asString(node.config.language) || "auto"}
              onChange={(value) => updateConfig({ language: value })}
            />
          </div>
        </div>
      ) : null}

      {node.type === "llm_generate" ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <SectionLabel>{copy.model}</SectionLabel>
            <select
              value={currentLlmModelSelectionValue}
              onChange={(event) => {
                const selectedOption =
                  llmModelSelectOptions.find((option) => option.value === event.target.value) || null
                const parsed = selectedOption || parseWorkflowModelSelectionValue(event.target.value)
                if (!parsed) return
                updateConfig({
                  selectedProviderId: parsed.providerId || null,
                  selectedModelId: parsed.modelId || null,
                  selectedModelOptionId: event.target.value || null,
                })
              }}
              disabled={llmModelSelectOptions.length === 0}
              className="h-10 w-full rounded-[10px] border border-border/80 bg-background/80 px-3 text-sm text-foreground outline-none transition focus:border-primary/50"
            >
              {llmModelSelectOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <SectionLabel>{copy.systemPrompt}</SectionLabel>
            <Textarea
              value={asString(node.config.systemPrompt)}
              onChange={(event) => updateConfig({ systemPrompt: event.target.value })}
              className="min-h-24 rounded-[10px] border-border/80 bg-background/80 text-sm"
            />
          </div>
        </div>
      ) : null}

      {node.type === "image_generate" ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <SectionLabel>{copy.model}</SectionLabel>
            <select
              value={currentImageModelSelectionValue}
              onChange={(event) => {
                const selectedOption =
                  imageModelSelectOptions.find((option) => option.value === event.target.value) || null
                const parsed = selectedOption || parseWorkflowModelSelectionValue(event.target.value)
                if (!parsed) return
                const nextModelKind = resolveWorkflowImageModelKind(parsed.modelId)
                const nextDefaultImageSize = getWorkflowImageDefaultSize(nextModelKind)
                const currentSizeValue = asString(node.config.imageSize)
                const nextImageSize =
                  nextModelKind === "runninghub-seedream"
                    ? normalizeRunningHubSeedreamSize(currentSizeValue || nextDefaultImageSize)
                    : nextModelKind === "gpt-image-2"
                      ? normalizeGptImage2Size(currentSizeValue || nextDefaultImageSize)
                      : currentSizeValue || nextDefaultImageSize
                updateConfig({
                  selectedProviderId: parsed.providerId || null,
                  selectedModelId: parsed.modelId || null,
                  selectedModelOptionId: event.target.value || null,
                  imageSize: nextImageSize,
                })
              }}
              disabled={imageModelSelectOptions.length === 0}
              className="h-10 w-full rounded-[10px] border border-border/80 bg-background/80 px-3 text-sm text-foreground outline-none transition focus:border-primary/50"
            >
              {imageModelSelectOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {currentImageModelKind === "gpt-image-2" || currentImageModelKind === "runninghub-seedream" ? (
            <>
              <div className="space-y-2">
                <SectionLabel>{copy.size}</SectionLabel>
                <OptionChips
                  options={imageModelSizeOptions}
                  value={imageSizeSelection}
                  onChange={(value) =>
                    updateConfig({
                      imageSize:
                        value === "custom"
                          ? asString(node.config.imageSize) || getWorkflowImageDefaultSize(currentImageModelKind)
                          : value,
                    })
                  }
                />
              </div>
              {imageSizeSelection === "custom" ? (
                <div className="space-y-2">
                  <SectionLabel>{copy.customSize}</SectionLabel>
                  <input
                    value={asString(node.config.imageSize)}
                    onChange={(event) => updateConfig({ imageSize: event.target.value })}
                    placeholder={copy.customSizePlaceholder}
                    className="h-10 w-full rounded-[10px] border border-border/80 bg-background/80 px-3 text-sm text-foreground outline-none transition focus:border-primary/50"
                  />
                </div>
              ) : null}
            </>
          ) : null}
          {currentImageModelKind === "gpt-image-2" ? (
            <>
              <div className="space-y-2">
                <SectionLabel>{copy.quality}</SectionLabel>
                <OptionChips
                  options={imageQualityOptions}
                  value={asString(node.config.imageQuality) || "auto"}
                  onChange={(value) => updateConfig({ imageQuality: value })}
                />
              </div>
              <div className="space-y-2">
                <SectionLabel>{copy.background}</SectionLabel>
                <OptionChips
                  options={imageBackgroundOptions}
                  value={asString(node.config.imageBackground) || "auto"}
                  onChange={(value) => updateConfig({ imageBackground: value })}
                />
              </div>
              <div className="space-y-2">
                <SectionLabel>{copy.format}</SectionLabel>
                <OptionChips
                  options={imageFormatOptions}
                  value={asString(node.config.imageOutputFormat) || "png"}
                  onChange={(value) => updateConfig({ imageOutputFormat: value })}
                />
              </div>
              {["jpeg", "webp"].includes(asString(node.config.imageOutputFormat) || "png") ? (
                <div className="space-y-2">
                  <SectionLabel>{copy.compression}</SectionLabel>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={
                      typeof node.config.imageOutputCompression === "number"
                        ? String(node.config.imageOutputCompression)
                        : asString(node.config.imageOutputCompression)
                    }
                    onChange={(event) =>
                      updateConfig({
                        imageOutputCompression: event.target.value === "" ? null : Number(event.target.value),
                      })
                    }
                    className="h-10 w-full rounded-[10px] border border-border/80 bg-background/80 px-3 text-sm text-foreground outline-none transition focus:border-primary/50"
                  />
                </div>
              ) : null}
              <div className="space-y-2">
                <SectionLabel>{copy.moderation}</SectionLabel>
                <OptionChips
                  options={imageModerationOptions}
                  value={asString(node.config.imageModeration) || "auto"}
                  onChange={(value) => updateConfig({ imageModeration: value })}
                />
              </div>
            </>
          ) : (
            <div className="rounded-[12px] border border-border/70 bg-background/55 px-3 py-2 text-xs text-muted-foreground">
              {copy.unsupportedModelParams}
            </div>
          )}
        </div>
      ) : null}

      {node.type === "video_generate" ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <SectionLabel>{copy.mode}</SectionLabel>
            <OptionChips
              options={videoModeOptions}
              value={asString(node.config.featureId) || "text-to-video"}
              onChange={(value) => {
                const nextFeatureId = value === "image-to-video" ? "image-to-video" : "text-to-video"
                const currentModel = asString(node.config.model)
                const modelStillSupported = Boolean(
                  findModelByCapabilityAndAlias({
                    capability: resolveWorkflowVideoCapability(nextFeatureId),
                    value: currentModel,
                  }),
                )
                updateConfig({
                  featureId: value,
                  ...(modelStillSupported ? {} : { model: getDefaultModelId(resolveWorkflowVideoCapability(nextFeatureId)) || "" }),
                })
              }}
            />
          </div>
          <div className="space-y-2">
            <SectionLabel>{copy.model}</SectionLabel>
            <select
              value={currentVideoModelId}
              onChange={(event) => updateConfig({ model: event.target.value })}
              className="h-10 w-full rounded-[10px] border border-border/80 bg-background/80 px-3 text-sm text-foreground outline-none transition focus:border-primary/50"
            >
              {videoModelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {videoParameterFields.map((field) => (
            <div key={field.id} className="space-y-2">
              <SectionLabel>{field.label}</SectionLabel>
              {field.type === "textarea" ? (
                <Textarea
                  value={asString(node.config[field.id]) || field.defaultValue || ""}
                  onChange={(event) => updateConfig({ [field.id]: event.target.value })}
                  className="min-h-24 rounded-[10px] border-border/80 bg-background/80 text-sm"
                />
              ) : field.type === "select" ? (
                <select
                  value={asString(node.config[field.id]) || field.defaultValue || ""}
                  onChange={(event) => updateConfig({ [field.id]: event.target.value })}
                  className="h-10 w-full rounded-[10px] border border-border/80 bg-background/80 px-3 text-sm text-foreground outline-none transition focus:border-primary/50"
                >
                  {(field.options || []).map((option) => (
                    <option key={`${field.id}-${option.value}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  type={field.type === "number" ? "number" : "text"}
                  value={asString(node.config[field.id]) || field.defaultValue || ""}
                  onChange={(event) => updateConfig({ [field.id]: event.target.value })}
                  placeholder={field.placeholder}
                  className="h-10 rounded-[10px] border-border/80 bg-background/80 text-sm"
                />
              )}
            </div>
          ))}
        </div>
      ) : null}

      {node.type === "digital_human" ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <SectionLabel>{copy.model}</SectionLabel>
            <select
              value={currentDigitalHumanModelId}
              onChange={(event) => updateConfig({ model: event.target.value })}
              className="h-10 w-full rounded-[10px] border border-border/80 bg-background/80 px-3 text-sm text-foreground outline-none transition focus:border-primary/50"
            >
              {digitalHumanModelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <SectionLabel>{copy.avatarImageUrl}</SectionLabel>
            <Input
              value={asString(node.config.avatarImageUrl)}
              onChange={(event) => updateConfig({ avatarImageUrl: event.target.value })}
              className="h-10 rounded-[10px] border-border/80 bg-background/80 text-sm"
            />
          </div>
          <div className="space-y-2">
            <SectionLabel>{copy.audioUrl}</SectionLabel>
            <Input
              value={asString(node.config.audioUrl)}
              onChange={(event) => updateConfig({ audioUrl: event.target.value })}
              className="h-10 rounded-[10px] border-border/80 bg-background/80 text-sm"
            />
          </div>
          <div className="space-y-2">
            <SectionLabel>{copy.script}</SectionLabel>
            <Textarea
              value={asString(node.config.script)}
              onChange={(event) => updateConfig({ script: event.target.value })}
              className="min-h-24 rounded-[10px] border-border/80 bg-background/80 text-sm"
            />
          </div>
          <div className="space-y-2">
            <SectionLabel>{copy.scenePrompt}</SectionLabel>
            <Textarea
              value={asString(node.config.scenePrompt)}
              onChange={(event) => updateConfig({ scenePrompt: event.target.value })}
              className="min-h-20 rounded-[10px] border-border/80 bg-background/80 text-sm"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-2">
              <SectionLabel>{copy.estimatedVideoSeconds}</SectionLabel>
              <Input
                type="number"
                min={1}
                value={asString(node.config.durationSeconds) || "10"}
                onChange={(event) => updateConfig({ durationSeconds: event.target.value })}
                className="h-10 rounded-[10px] border-border/80 bg-background/80 text-sm"
              />
            </div>
            <div className="space-y-2">
              <SectionLabel>{copy.audioTrimStart}</SectionLabel>
              <Input
                type="number"
                min={0}
                value={asString(node.config.audioTrimStart)}
                onChange={(event) => updateConfig({ audioTrimStart: event.target.value })}
                className="h-10 rounded-[10px] border-border/80 bg-background/80 text-sm"
              />
            </div>
            <div className="space-y-2">
              <SectionLabel>{copy.audioTrimEnd}</SectionLabel>
              <Input
                type="number"
                min={0}
                value={asString(node.config.audioTrimEnd)}
                onChange={(event) => updateConfig({ audioTrimEnd: event.target.value })}
                className="h-10 rounded-[10px] border-border/80 bg-background/80 text-sm"
              />
            </div>
          </div>
          <div className="space-y-2">
            <SectionLabel>Seed</SectionLabel>
            <Input
              type="number"
              value={asString(node.config.seed) || "-1"}
              onChange={(event) => updateConfig({ seed: event.target.value })}
              className="h-10 rounded-[10px] border-border/80 bg-background/80 text-sm"
            />
          </div>
        </div>
      ) : null}

      {node.type === "music_generate" || node.type === "audio_generate" ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <SectionLabel>{copy.genre}</SectionLabel>
            <OptionChips
              options={audioGenreOptions}
              value={asString(node.config.genre) || "electronic-pop"}
              onChange={(value) => updateConfig({ genre: value })}
            />
          </div>
          <div className="space-y-2">
            <SectionLabel>{copy.mood}</SectionLabel>
            <OptionChips
              options={audioMoodOptions}
              value={asString(node.config.mood) || "uplifting"}
              onChange={(value) => updateConfig({ mood: value })}
            />
          </div>
          <div className="space-y-2">
            <SectionLabel>{copy.vocals}</SectionLabel>
            <OptionChips
              options={audioVocalsOptions}
              value={asString(node.config.vocals) || "instrumental"}
              onChange={(value) => updateConfig({ vocals: value })}
            />
          </div>
          <div className="space-y-2">
            <SectionLabel>{copy.lyrics}</SectionLabel>
            <OptionChips
              options={lyricsOptions}
              value={asString(node.config.lyricsSource) || "ai_generate"}
              onChange={(value) => updateConfig({ lyricsSource: value })}
            />
          </div>
        </div>
      ) : null}

      {node.type === "voice_synthesis" ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <SectionLabel>{copy.voice}</SectionLabel>
            <select
              value={asString(node.config.voiceId)}
              onChange={(event) => updateConfig({ voiceId: event.target.value })}
              className="h-10 w-full rounded-[10px] border border-border/80 bg-background/80 px-3 text-sm text-foreground outline-none transition focus:border-primary/50"
            >
              <option value="">{voiceOptions.length > 0 ? copy.chooseVoice : copy.noVoiceOptions}</option>
              {voiceOptions.map((voice) => (
                <option key={`${voice.category}-${voice.voiceId}`} value={voice.voiceId}>
                  {voice.voiceName} · {getVoiceCategoryLabel(locale, voice.category)}
                </option>
              ))}
            </select>
            {asString(node.config.voiceId) ? (
              <div className="text-xs text-muted-foreground">
                {voiceOptions.find((voice) => voice.voiceId === asString(node.config.voiceId))?.description?.[0] ||
                  asString(node.config.voiceId)}
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <SectionLabel>{copy.model}</SectionLabel>
            <select
              value={asString(node.config.model) || "speech-2.8-hd"}
              onChange={(event) => updateConfig({ model: event.target.value })}
              className="h-10 w-full rounded-[10px] border border-border/80 bg-background/80 px-3 text-sm text-foreground outline-none transition focus:border-primary/50"
            >
              {speechModelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <SectionLabel>{copy.languageBoost}</SectionLabel>
            <OptionChips
              options={languageBoostOptions}
              value={asString(node.config.languageBoost) || "auto"}
              onChange={(value) => updateConfig({ languageBoost: value })}
            />
          </div>

          <div className="space-y-2">
            <SectionLabel>{copy.speed}</SectionLabel>
            <OptionChips
              options={speechSpeedOptions}
              value={asString(node.config.speed) || "1"}
              onChange={(value) => updateConfig({ speed: value })}
            />
          </div>

          <div className="space-y-2">
            <SectionLabel>{copy.volume}</SectionLabel>
            <OptionChips
              options={speechVolumeOptions}
              value={asString(node.config.volume) || "1"}
              onChange={(value) => updateConfig({ volume: value })}
            />
          </div>

          <div className="space-y-2">
            <SectionLabel>{copy.pitch}</SectionLabel>
            <OptionChips
              options={speechPitchOptions}
              value={asString(node.config.pitch) || "1"}
              onChange={(value) => updateConfig({ pitch: value })}
            />
          </div>
        </div>
      ) : null}

      {node.type === "ppt_generate" ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <SectionLabel>{copy.pageCount}</SectionLabel>
            <OptionChips
              options={pageCountOptions}
              value={String(asNumber(node.config.pageCount, 8))}
              onChange={(value) =>
                updateConfig({
                  pageCount: Number(value),
                  slideCount: Number(value),
                })
              }
            />
          </div>
          <div className="space-y-2">
            <SectionLabel>{copy.language}</SectionLabel>
            <OptionChips
              options={languageOptions.filter((option) => option.value !== "bilingual")}
              value={asString(node.config.language) || (locale === "zh" ? "zh-CN" : "en-US")}
              onChange={(value) => updateConfig({ language: value })}
            />
          </div>
          <div className="space-y-2">
            <SectionLabel>{copy.scenario}</SectionLabel>
            <OptionChips
              options={scenarioOptions}
              value={asString(node.config.scenario) || "marketing-campaign"}
              onChange={(value) => updateConfig({ scenario: value })}
            />
          </div>
        </div>
      ) : null}

      {node.type === "product_store" ? (
        <div className="space-y-3">
          <div className="space-y-2">
            <SectionLabel>{copy.fileName}</SectionLabel>
            <Input
              value={asString(node.config.storedFileName)}
              onChange={(event) => updateConfig({ storedFileName: event.target.value })}
              placeholder={copy.fileNamePlaceholder}
              className="h-10 rounded-[10px] border-border/80 bg-background/80 text-sm"
            />
            <div className="text-xs leading-5 text-muted-foreground">{copy.fileNameHint}</div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
