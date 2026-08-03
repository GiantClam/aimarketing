import type { AppLocale } from "@/lib/i18n/config"

import type { ModelDefinition } from "@/lib/ai-runtime/types"

export type RuntimeFormFieldView = {
  id: string
  type: "text" | "url" | "textarea" | "number" | "select"
  label: string
  placeholder?: string
  defaultValue?: string
  options?: Array<{ value: string; label: string }>
}

const RUNTIME_FIELD_LABELS: Record<string, { zh: string; en: string }> = {
  prompt: { zh: "提示词", en: "Prompt" },
  firstFrameUrl: { zh: "首帧图片地址", en: "First frame URL" },
  lastFrameUrl: { zh: "尾帧图片地址", en: "Last frame URL" },
  referenceImageUrls: { zh: "参考图片地址", en: "Reference image URLs" },
  imageUrls: { zh: "参考图片地址", en: "Reference image URLs" },
  videoUrls: { zh: "参考视频地址", en: "Reference video URLs" },
  audioUrls: { zh: "参考音频地址", en: "Reference audio URLs" },
  sourceVideoUrl: { zh: "源视频地址", en: "Source video URL" },
  resolution: { zh: "分辨率", en: "Resolution" },
  ratio: { zh: "画面比例", en: "Aspect ratio" },
  duration: { zh: "时长", en: "Duration" },
  watermark: { zh: "水印", en: "Watermark" },
  seed: { zh: "随机种子", en: "Seed" },
  audioSetting: { zh: "音频设置", en: "Audio" },
  generateAudio: { zh: "生成音频", en: "Generate audio" },
  webSearch: { zh: "联网搜索", en: "Web search" },
  returnLastFrame: { zh: "返回尾帧", en: "Return last frame" },
  realPersonMode: { zh: "真人模式", en: "Real person mode" },
}

const RUNTIME_OPTION_LABELS: Record<string, { zh: string; en: string }> = {
  true: { zh: "开启", en: "On" },
  false: { zh: "关闭", en: "Off" },
  auto: { zh: "自动", en: "Auto" },
  adaptive: { zh: "自适应", en: "Adaptive" },
  origin: { zh: "原始音频", en: "Original" },
}

function localizeRuntimeLabel(locale: AppLocale, id: string, fallback: string) {
  return RUNTIME_FIELD_LABELS[id]?.[locale] || fallback
}

function localizeRuntimeOption(locale: AppLocale, option: { value: string; label: string }) {
  const localized = RUNTIME_OPTION_LABELS[option.value]?.[locale]
  if (localized) return localized
  if (locale === "zh" && /^\d+s$/i.test(option.label)) {
    return `${option.label.slice(0, -1)}秒`
  }
  return option.label
}

export function buildModelSelectOptions(models: ModelDefinition[]) {
  return models.map((model) => ({
    value: model.id,
    label: model.label,
  }))
}

export function buildRuntimeFieldsForModel(model: ModelDefinition, locale: AppLocale): RuntimeFormFieldView[] {
  return model.parameterSchema
    .flatMap((field) => {
      if (field.type !== "text" && field.type !== "url" && field.type !== "textarea" && field.type !== "number" && field.type !== "select") {
        return []
      }

      return [{
        id: field.id,
        type: field.type,
        label: localizeRuntimeLabel(locale, field.id, field.label),
        placeholder: field.placeholder,
        defaultValue: field.defaultValue == null ? undefined : String(field.defaultValue),
        options: field.options?.map((option) => ({
          value: option.value,
          label: localizeRuntimeOption(locale, option),
        })),
      } satisfies RuntimeFormFieldView]
    })
}
