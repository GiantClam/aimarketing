import {
  getImageAssistantAgentMetadata,
  getImageAssistantFailureChecks,
  getImageAssistantPromptCompositionRules,
  getImageAssistantRuntimeSystemPrompt,
} from "@/lib/image-assistant/skill-documents"
import { looksLikeReferenceEditIntent } from "@/lib/image-assistant/intent"
import { generateStructuredObjectWithWriterModel, generateTextWithWriterModel } from "@/lib/writer/aiberm"
import { z } from "zod"
import {
  getImageAssistantSkillDefinition,
  IMAGE_ASSISTANT_MAX_BRIEF_TURNS,
  IMAGE_ASSISTANT_SKILL_MODEL,
  IMAGE_ASSISTANT_TEXT_MODEL,
  selectImageAssistantSkill,
} from "@/lib/image-assistant/skills"
import type {
  ImageAssistantBrief,
  ImageAssistantBriefField,
  ImageAssistantMessage,
  ImageAssistantOrientation,
  ImageAssistantOrchestrationState,
  ImageAssistantPromptOption,
  ImageAssistantPromptQuestion,
  ImageAssistantResolution,
  ImageAssistantSkillId,
  ImageAssistantSizePreset,
  ImageAssistantTaskType,
  ImageAssistantToolTrace,
  ImageAssistantUsagePresetId,
} from "@/lib/image-assistant/types"

function parseTimeoutFromEnv(rawValue: string | undefined, fallbackMs: number, minMs = 1_000, maxMs = 120_000) {
  const parsed = Number.parseInt(rawValue || "", 10)
  const effective = Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs
  return Math.max(minMs, Math.min(maxMs, effective))
}

const REQUIRED_BRIEF_FIELDS: ImageAssistantBriefField[] = [
  "usage",
  "orientation",
  "resolution",
  "ratio",
  "subject",
  "style",
  "composition",
]
const GUIDED_BRIEF_FIELDS = new Set<ImageAssistantBriefField>(["usage", "orientation", "resolution", "ratio"])
const BRIEF_PLANNER_MAX_TOKENS = 900
const BRIEF_PLANNER_GUIDED_MAX_TOKENS = 160
const BRIEF_PLANNER_TIMEOUT_MS = parseTimeoutFromEnv(process.env.IMAGE_ASSISTANT_PLANNER_TIMEOUT_MS, 10_000)
const BRIEF_PLANNER_GUIDED_TIMEOUT_MS = parseTimeoutFromEnv(process.env.IMAGE_ASSISTANT_GUIDED_PLANNER_TIMEOUT_MS, 10_000)
const BRIEF_PLANNER_PROVIDER_TIMEOUT_MS = parseTimeoutFromEnv(process.env.IMAGE_ASSISTANT_PLANNER_PROVIDER_TIMEOUT_MS, 6_000)
const BRIEF_PLANNER_GUIDED_PROVIDER_TIMEOUT_MS = parseTimeoutFromEnv(
  process.env.IMAGE_ASSISTANT_GUIDED_PLANNER_PROVIDER_TIMEOUT_MS,
  5_000,
)
const BRIEF_PLANNER_MAX_MODEL_ATTEMPTS =
  Number.parseInt(process.env.IMAGE_ASSISTANT_PLANNER_MAX_MODEL_ATTEMPTS || "", 10) || 3
const BRIEF_EXTRACT_SCHEMA_VERSION = "image_assistant_brief_extract.v1"
const BRIEF_PROMPT_VERSION = "image_assistant_prompt_compose.v1"

const USAGE_PRESET_DEFINITIONS: Record<
  ImageAssistantUsagePresetId,
  {
    sizePreset: ImageAssistantSizePreset
    orientation: ImageAssistantOrientation
    zhLabel: string
    enLabel: string
    zhDescription: string
    enDescription: string
  }
> = {
  website_banner: {
    sizePreset: "16:9",
    orientation: "landscape",
    zhLabel: "官网横幅 16:9",
    enLabel: "Website banner 16:9",
    zhDescription: "适合官网首屏、品牌横幅和页面 Hero 区域。",
    enDescription: "Best for homepage hero sections and brand banners.",
  },
  social_cover: {
    sizePreset: "4:5",
    orientation: "portrait",
    zhLabel: "社媒封面 4:5",
    enLabel: "Social cover 4:5",
    zhDescription: "适合社媒封面、信息流视觉和种草卡片。",
    enDescription: "Best for social covers, feeds, and tall campaign visuals.",
  },
  ad_poster: {
    sizePreset: "4:3",
    orientation: "landscape",
    zhLabel: "广告海报 4:3",
    enLabel: "Ad poster 4:3",
    zhDescription: "适合活动海报、广告主视觉和通用宣传图。",
    enDescription: "Best for campaign posters and general ad creatives.",
  },
  avatar: {
    sizePreset: "1:1",
    orientation: "portrait",
    zhLabel: "头像图片 1:1",
    enLabel: "Avatar image 1:1",
    zhDescription: "适合头像、品牌图标和小尺寸识别图。",
    enDescription: "Best for avatars, profile images, and square brand icons.",
  },
}

const RESOLUTION_PRESET_DEFINITIONS: Record<
  ImageAssistantResolution,
  { zhLabel: string; enLabel: string; zhDescription: string; enDescription: string }
> = {
  "512": {
    zhLabel: "标清 512",
    enLabel: "Standard 512",
    zhDescription: "快速出图，适合草图和方向确认。",
    enDescription: "Fast draft output for rough visual direction checks.",
  },
  "1K": {
    zhLabel: "高清 1K",
    enLabel: "High 1K",
    zhDescription: "平衡速度和质量，适合多数常规设计需求。",
    enDescription: "Balanced speed and quality for most design tasks.",
  },
  "2K": {
    zhLabel: "超清 2K",
    enLabel: "Ultra 2K",
    zhDescription: "更适合正式交付和细节要求更高的广告图。",
    enDescription: "Better for production-ready images with clearer detail.",
  },
  "4K": {
    zhLabel: "超高清 4K",
    enLabel: "Ultra HD 4K",
    zhDescription: "最高精度，适合大尺寸输出和精修细节。",
    enDescription: "Highest fidelity for large-format or detailed refinement.",
  },
}

const EMPTY_BRIEF: ImageAssistantBrief = {
  usage_preset: "",
  usage_label: "",
  orientation: "",
  resolution: "",
  size_preset: "",
  ratio_confirmed: false,
  goal: "",
  subject: "",
  style: "",
  composition: "",
  constraints: "",
}

const BRIEF_FIELD_VALUES = [
  "usage",
  "orientation",
  "resolution",
  "ratio",
  "goal",
  "subject",
  "style",
  "composition",
] as const satisfies readonly ImageAssistantBriefField[]

const BriefDeltaSchema = z
  .object({
    usage_preset: z.enum(["website_banner", "social_cover", "ad_poster", "avatar"]).or(z.literal("")).optional(),
    usage_label: z.string().max(120).optional(),
    orientation: z.enum(["landscape", "portrait"]).or(z.literal("")).optional(),
    resolution: z.enum(["512", "1K", "2K", "4K"]).or(z.literal("")).optional(),
    size_preset: z.enum(["1:1", "4:5", "3:4", "4:3", "16:9", "9:16"]).or(z.literal("")).optional(),
    ratio_confirmed: z.boolean().optional(),
    goal: z.string().max(220).optional(),
    subject: z.string().max(220).optional(),
    style: z.string().max(220).optional(),
    composition: z.string().max(260).optional(),
    constraints: z.string().max(260).optional(),
  })
  .strict()

const BriefExtractionOutputSchema = z
  .object({
    brief_delta: BriefDeltaSchema.default({}),
    missing_fields: z.array(z.enum(BRIEF_FIELD_VALUES)).max(BRIEF_FIELD_VALUES.length).default([]),
    conflicts: z.array(z.string().min(1).max(180)).max(8).default([]),
    confidence: z.number().min(0).max(1).default(0.5),
    next_question: z.string().max(240).default(""),
    ready_for_generation: z.boolean().default(false),
  })
  .strict()

type BriefExtractionOutput = z.infer<typeof BriefExtractionOutputSchema>

type BriefExtractionResult = {
  brief: ImageAssistantBrief
  missingFields: ImageAssistantBriefField[]
  conflicts: string[]
  confidence: number
  nextQuestion: string
  readyForGeneration: boolean
}

const FIELD_QUESTIONS_ZH: Record<ImageAssistantBriefField, string> = {
  usage: "先选这张图的用途卡片，我会按用途推荐交付比例。",
  orientation: "再确认画面方向，只需要选择横版画面或竖版画面。",
  resolution: "再确认图片清晰度，选择标清、高清、超清或超高清即可。",
  ratio: "最后确认“用途 + 比例”卡片，我会按最终比例执行。",
  goal: "这张图最终要用在哪里，核心目标是什么？",
  subject: "主体内容是什么，哪些人物、产品、场景或品牌元素必须保留？",
  style: "你想要什么风格和氛围，比如高级极简、电商质感、杂志感、电影感或节日促销？",
  composition: "构图怎么安排，焦点区域、留白、机位、标题区或角标区要放在哪里？",
}

const FIELD_QUESTIONS_EN: Record<ImageAssistantBriefField, string> = {
  usage: "Pick the intended use first so I can keep the output aligned with the right delivery ratio.",
  orientation: "Confirm the canvas direction next: landscape or portrait.",
  resolution: "Confirm the image size next: standard, high, ultra, or ultra HD.",
  ratio: "Confirm the final use + ratio card before generation.",
  goal: "What is the image for, such as a cover, poster, hero visual, product ad, or campaign KV?",
  subject: "What is the subject, and which people, products, scenes, or brand elements must stay?",
  style: "What style or mood do you want, such as minimal luxury, ecommerce polish, editorial, cinematic, or festive?",
  composition: "How should the composition work, including focal area, whitespace, camera angle, and text-safe zones?",
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function parseModelList(...values: Array<string | null | undefined>) {
  const result: string[] = []
  const seen = new Set<string>()

  for (const value of values) {
    for (const item of String(value || "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)) {
      if (seen.has(item)) continue
      seen.add(item)
      result.push(item)
    }
  }

  return result
}

function buildPlannerModelCandidates(primaryModel: string) {
  const allCandidates = parseModelList(
    primaryModel,
    IMAGE_ASSISTANT_SKILL_MODEL,
    IMAGE_ASSISTANT_TEXT_MODEL,
    process.env.IMAGE_ASSISTANT_PLANNER_FALLBACK_MODELS,
    process.env.IMAGE_ASSISTANT_PLANNER_FALLBACK_MODEL,
    process.env.OPENROUTER_TEXT_MODEL,
  )

  const maxAttempts = Math.max(1, BRIEF_PLANNER_MAX_MODEL_ATTEMPTS)
  return allCandidates.slice(0, maxAttempts)
}

function shouldRetryPlannerWithAnotherModel(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  if (!message) return false

  return (
    message.includes("user not found") ||
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("invalid api key") ||
    message.includes("insufficient_quota") ||
    message.includes("rate limit") ||
    message.includes("429") ||
    message.includes("model not found") ||
    message.includes("no available distributor") ||
    message.includes("无可用渠道") ||
    message.includes("writer_request_timeout") ||
    message.includes("request_aborted") ||
    message.includes("etimedout") ||
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("fetch failed") ||
    message.includes("socket hang up") ||
    message.includes("econnreset")
  )
}

function normalizeUsagePreset(value: unknown): ImageAssistantUsagePresetId | "" {
  return value === "website_banner" || value === "social_cover" || value === "ad_poster" || value === "avatar" ? value : ""
}

function normalizeOrientation(value: unknown): ImageAssistantOrientation | "" {
  return value === "landscape" || value === "portrait" ? value : ""
}

function normalizeResolution(value: unknown): ImageAssistantResolution | "" {
  return value === "512" || value === "1K" || value === "2K" || value === "4K" ? value : ""
}

function normalizeSizePreset(value: unknown): ImageAssistantSizePreset | "" {
  return value === "1:1" || value === "4:5" || value === "3:4" || value === "4:3" || value === "16:9" || value === "9:16" ? value : ""
}

function inferSizePresetFromPrompt(prompt: string): ImageAssistantSizePreset | "" {
  const normalized = normalizeText(prompt).toLowerCase()
  if (!normalized) return ""

  const compact = normalized.replace(/\s+/g, "")
  if (/(16[:：]9|16x9|16／9|16-9)/iu.test(compact)) return "16:9"
  if (/(9[:：]16|9x16|9／16|9-16)/iu.test(compact)) return "9:16"
  if (/(4[:：]5|4x5|4／5|4-5)/iu.test(compact)) return "4:5"
  if (/(3[:：]4|3x4|3／4|3-4)/iu.test(compact)) return "3:4"
  if (/(4[:：]3|4x3|4／3|4-3)/iu.test(compact)) return "4:3"
  if (/(1[:：]1|1x1|1／1|1-1)/iu.test(compact)) return "1:1"
  return ""
}

function getUsagePresetDefinition(usagePreset: ImageAssistantUsagePresetId | "") {
  return usagePreset ? USAGE_PRESET_DEFINITIONS[usagePreset] : null
}

function inferOrientationFromPrompt(prompt: string): ImageAssistantOrientation | "" {
  if (/(?:横版|横图|landscape|wide)/iu.test(prompt)) return "landscape"
  if (/(?:竖版|竖图|portrait|tall)/iu.test(prompt)) return "portrait"
  return ""
}

function inferResolutionFromPrompt(prompt: string): ImageAssistantResolution | "" {
  const normalized = normalizeText(prompt).toLowerCase()
  if (!normalized) return ""
  if (/(?:4k|超高清)/iu.test(normalized)) return "4K"
  if (/(?:2k|超清)/iu.test(normalized)) return "2K"
  if (/(?:1k|高清)/iu.test(normalized)) return "1K"
  if (/(?:512|标清|standard)/iu.test(normalized)) return "512"
  return ""
}

function inferOrientationFromSizePreset(sizePreset: ImageAssistantSizePreset | ""): ImageAssistantOrientation | "" {
  if (sizePreset === "16:9" || sizePreset === "4:3") return "landscape"
  if (sizePreset === "9:16" || sizePreset === "4:5" || sizePreset === "3:4") return "portrait"
  return ""
}

function inferUsagePresetFromSizePreset(sizePreset: ImageAssistantSizePreset | ""): ImageAssistantUsagePresetId | "" {
  if (sizePreset === "16:9") return "website_banner"
  if (sizePreset === "4:5") return "social_cover"
  if (sizePreset === "4:3") return "ad_poster"
  if (sizePreset === "1:1") return "avatar"
  return ""
}

function getUsagePresetLabel(usagePreset: ImageAssistantUsagePresetId | "", chinese: boolean) {
  const preset = getUsagePresetDefinition(usagePreset)
  return preset ? (chinese ? preset.zhLabel : preset.enLabel) : ""
}

function _getResolutionLabel(resolution: ImageAssistantResolution | "", chinese: boolean) {
  if (!resolution) return ""
  const preset = RESOLUTION_PRESET_DEFINITIONS[resolution]
  return chinese ? preset.zhLabel : preset.enLabel
}

function inferUsagePresetFromPrompt(prompt: string): ImageAssistantUsagePresetId | "" {
  if (/(?:官网|网站|首页横幅|hero|banner)/iu.test(prompt)) return "website_banner"
  if (/(?:社媒|小红书|封面|feed|social)/iu.test(prompt)) return "social_cover"
  if (/(?:海报|poster|广告图|ad creative|campaign)/iu.test(prompt)) return "ad_poster"
  if (/(?:头像|avatar|profile|icon)/iu.test(prompt)) return "avatar"
  return ""
}

function normalizeBrief(input?: Partial<ImageAssistantBrief> | null): ImageAssistantBrief {
  const usagePreset = normalizeUsagePreset(input?.usage_preset)
  const chinese = looksLikeChinese(
    [input?.usage_label, input?.goal, input?.subject, input?.style, input?.composition].map(normalizeText).join(" "),
  )

  return {
    usage_preset: usagePreset,
    usage_label: normalizeText(input?.usage_label) || getUsagePresetLabel(usagePreset, chinese),
    orientation: normalizeOrientation(input?.orientation),
    resolution: normalizeResolution(input?.resolution),
    size_preset: normalizeSizePreset(input?.size_preset),
    ratio_confirmed: Boolean(input?.ratio_confirmed),
    goal: normalizeText(input?.goal),
    subject: normalizeText(input?.subject),
    style: normalizeText(input?.style),
    composition: normalizeText(input?.composition),
    constraints: normalizeText(input?.constraints),
  }
}

function mergeBrief(...briefs: Array<Partial<ImageAssistantBrief> | null | undefined>) {
  return briefs.reduce<ImageAssistantBrief>((current, candidate) => {
    if (!candidate) return current
    const normalized = normalizeBrief(candidate)
    return {
      usage_preset: normalized.usage_preset || current.usage_preset,
      usage_label: normalized.usage_label || current.usage_label,
      orientation: normalized.orientation || current.orientation,
      resolution: normalized.resolution || current.resolution,
      size_preset: normalized.size_preset || current.size_preset,
      ratio_confirmed: normalized.ratio_confirmed || current.ratio_confirmed,
      goal: normalized.goal || current.goal,
      subject: normalized.subject || current.subject,
      style: normalized.style || current.style,
      composition: normalized.composition || current.composition,
      constraints: normalized.constraints || current.constraints,
    }
  }, { ...EMPTY_BRIEF })
}

function hasAnyBriefSignal(brief: Partial<ImageAssistantBrief> | null | undefined) {
  const normalized = normalizeBrief(brief)
  return Boolean(
    normalized.usage_preset ||
      normalized.orientation ||
      normalized.resolution ||
      normalized.size_preset ||
      normalized.ratio_confirmed ||
      normalized.goal ||
      normalized.subject ||
      normalized.style ||
      normalized.composition ||
      normalized.constraints,
  )
}

function _getMissingBriefFields(brief: ImageAssistantBrief) {
  return REQUIRED_BRIEF_FIELDS.filter((field) => {
    if (field === "usage") return !brief.usage_preset
    if (field === "orientation") return !brief.orientation
    if (field === "resolution") return !brief.resolution
    if (field === "ratio") return !brief.size_preset || !brief.ratio_confirmed
    return !normalizeText(brief[field])
  })
}
function getActionableBriefMissingFields(brief: ImageAssistantBrief) {
  const missingFields: ImageAssistantBriefField[] = []

  if (!brief.usage_preset) {
    missingFields.push("usage")
  }

  if (!brief.orientation) {
    missingFields.push("orientation")
  }

  if (!brief.resolution) {
    missingFields.push("resolution")
  }

  if (!brief.size_preset || !brief.ratio_confirmed) {
    missingFields.push("ratio")
  }

  if (!normalizeText(brief.subject)) {
    missingFields.push("subject")
  }

  if (!normalizeText(brief.style) && !normalizeText(brief.composition)) {
    missingFields.push("style")
  } else if (!normalizeText(brief.style)) {
    missingFields.push("style")
  } else if (!normalizeText(brief.composition)) {
    missingFields.push("composition")
  }

  return missingFields
}

function looksLikeChinese(text: string) {
  return /[\u4e00-\u9fff]/.test(text)
}

function truncate(value: string, max = 180) {
  return value.length > max ? `${value.slice(0, max - 1).trim()}...` : value
}

function isLowSignalBriefReply(value: string) {
  return /^(ok|okay|yes|no|好的|好|可以|收到|明白了|随便|都行)$/iu.test(value)
}

function splitBriefReplySegments(value: string) {
  return value
    .split(/\r?\n|[,，;；。!?！？]+/)
    .map((segment) => normalizeText(segment))
    .filter(Boolean)
}

function inferBriefFromPromptQuestionOption(input: {
  prompt: string
  previousState: ImageAssistantOrchestrationState | null
}) {
  const prompt = normalizeText(input.prompt)
  if (!prompt || !input.previousState?.prompt_questions?.length) {
    return { ...EMPTY_BRIEF }
  }

  const normalizedPrompt = prompt.toLowerCase()
  for (const question of input.previousState.prompt_questions) {
    for (const option of question.options || []) {
      const matchCandidates = [option.id, option.label, option.prompt_value]
        .map((value) => normalizeText(value))
        .filter(Boolean)
      const matched = matchCandidates.some((candidate) => candidate.toLowerCase() === normalizedPrompt)
      if (!matched) continue

      return normalizeBrief({
        ...(option.brief_patch || {}),
        ...(option.size_preset ? { size_preset: option.size_preset } : {}),
        ...(option.resolution ? { resolution: option.resolution } : {}),
      })
    }
  }

  return { ...EMPTY_BRIEF }
}

function inferBriefFromFollowUpAnswer(input: {
  prompt: string
  previousState: ImageAssistantOrchestrationState | null
}) {
  const prompt = normalizeText(input.prompt)
  if (!prompt || !input.previousState?.missing_fields.length || isLowSignalBriefReply(prompt)) {
    return { ...EMPTY_BRIEF }
  }

  const requestedFields = input.previousState.missing_fields
  const segments = splitBriefReplySegments(prompt)
  const extracted: Partial<ImageAssistantBrief> = {}

  for (const field of requestedFields) {
    if (field === "orientation") {
      extracted.orientation = extracted.orientation || inferOrientationFromPrompt(prompt)
      continue
    }
    if (field === "resolution") {
      extracted.resolution = extracted.resolution || inferResolutionFromPrompt(prompt)
      continue
    }
    if (field === "usage" || field === "ratio") {
      const explicitSizePreset = inferSizePresetFromPrompt(prompt)
      const usagePreset = inferUsagePresetFromPrompt(prompt)
      if (usagePreset) {
        const preset = USAGE_PRESET_DEFINITIONS[usagePreset]
        extracted.usage_preset = usagePreset
        extracted.usage_label = preset.zhLabel
        extracted.size_preset = preset.sizePreset
        extracted.orientation = extracted.orientation || preset.orientation
        extracted.ratio_confirmed = extracted.ratio_confirmed || field === "ratio" || Boolean(explicitSizePreset)
      }
      if (explicitSizePreset) {
        extracted.size_preset = explicitSizePreset
        extracted.ratio_confirmed = true
        extracted.orientation = extracted.orientation || inferOrientationFromSizePreset(explicitSizePreset)
        if (!extracted.usage_preset) {
          const inferredUsagePreset = inferUsagePresetFromSizePreset(explicitSizePreset)
          if (inferredUsagePreset) {
            const preset = USAGE_PRESET_DEFINITIONS[inferredUsagePreset]
            extracted.usage_preset = inferredUsagePreset
            extracted.usage_label = preset.zhLabel
          }
        }
      }
      continue
    }
  }

  const requestedTextFields = requestedFields.filter(
    (field): field is "goal" | "subject" | "style" | "composition" =>
      field === "goal" || field === "subject" || field === "style" || field === "composition",
  )
  if (requestedTextFields.length === 1) {
    extracted[requestedTextFields[0]] = truncate(prompt, 160)
  } else if (requestedTextFields.length > 1 && segments.length >= requestedTextFields.length) {
    requestedTextFields.forEach((field, index) => {
      extracted[field] = truncate(segments[index] || "", 160)
    })
  }

  return normalizeBrief(extracted)
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values) {
    const normalized = normalizeText(value)
    if (!normalized) continue

    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(normalized)
  }

  return result
}

function _usesReferenceEditShortcut(input: {
  prompt: string
  taskType: ImageAssistantTaskType
  referenceCount: number
}) {
  if ((input.taskType !== "edit" && input.taskType !== "mask_edit") || input.referenceCount <= 0) {
    return false
  }

  const prompt = normalizeText(input.prompt)
  if (!prompt) return false

  return (
    /(?:删除|删掉|去掉|去除|移除|擦掉|抹掉|消除|拿掉|修掉|换成|替换|保留|只修改|局部修改|局部编辑|去眼袋|去瑕疵|磨皮)/.test(prompt) ||
    /\b(remove|delete|erase|retouch|edit out|clean up|replace|swap|change|fix|touch up|take off|keep)\b/i.test(prompt)
  )
}

function usesReferenceEditShortcutStable(input: {
  prompt: string
  taskType: ImageAssistantTaskType
  referenceCount: number
}) {
  return looksLikeReferenceEditIntent(input) || _usesReferenceEditShortcut(input)
}

function applyReferenceEditDefaults(brief: ImageAssistantBrief, prompt: string) {
  const isZh = looksLikeChinese(prompt)
  return normalizeBrief({
    ...brief,
    style:
      brief.style ||
      (isZh
        ? "保持参考图原有的真实质感、光影、色彩关系、材质细节和整体视觉风格，除非用户明确要求改变风格。"
        : "Preserve the original reference image's visual style, lighting, material detail, color relationships, and realism unless the user explicitly requests a new style."),
    composition:
      brief.composition ||
      (isZh
        ? "默认延续参考图现有的构图、机位和主体位置，只调整用户明确要求修改的局部内容。"
        : "Keep the original reference image composition, framing, camera angle, and subject placement unless the user explicitly requests a new layout."),
  })
}

function shouldSkipTextPlanner(input: {
  prompt: string
  taskType: ImageAssistantTaskType
  referenceCount: number
}) {
  if (input.taskType === "mask_edit" && input.referenceCount > 0) {
    return true
  }

  return usesReferenceEditShortcutStable(input)
}

function extractBriefFromLabeledLines(prompt: string) {
  const extracted: Partial<ImageAssistantBrief> = {}
  const lines = prompt
    .split(/\r?\n/)
    .map((line) => normalizeText(line))
    .filter(Boolean)

  for (const line of lines) {
    const match = /^([^:：]{2,24})\s*[:：]\s*(.+)$/i.exec(line)
    if (!match) continue

    const label = match[1].trim().toLowerCase()
    const value = truncate(match[2].trim(), 180)
    if (!value) continue

    if (!extracted.usage_preset && /^(usage|use case|用途|场景)$/.test(label)) {
      const usagePreset = inferUsagePresetFromPrompt(value)
      if (usagePreset) {
        const preset = USAGE_PRESET_DEFINITIONS[usagePreset]
        extracted.usage_preset = usagePreset
        extracted.usage_label = preset.zhLabel
        extracted.size_preset = preset.sizePreset
        extracted.orientation = extracted.orientation || preset.orientation
      }
      const explicitSizePreset = inferSizePresetFromPrompt(value)
      if (explicitSizePreset) {
        extracted.size_preset = explicitSizePreset
        extracted.ratio_confirmed = true
        extracted.orientation = extracted.orientation || inferOrientationFromSizePreset(explicitSizePreset)
        if (!extracted.usage_preset) {
          const inferredUsagePreset = inferUsagePresetFromSizePreset(explicitSizePreset)
          if (inferredUsagePreset) {
            const preset = USAGE_PRESET_DEFINITIONS[inferredUsagePreset]
            extracted.usage_preset = inferredUsagePreset
            extracted.usage_label = preset.zhLabel
          }
        }
      }
      continue
    }
    if (!extracted.orientation && /^(orientation|direction|方向)$/.test(label)) {
      extracted.orientation = inferOrientationFromPrompt(value)
      continue
    }
    if (!extracted.resolution && /^(resolution|quality|size|清晰度|大小)$/.test(label)) {
      extracted.resolution = inferResolutionFromPrompt(value)
      continue
    }
    if (!extracted.size_preset && /^(ratio|aspect ratio|size preset|比例|画幅)$/.test(label)) {
      const explicitSizePreset = inferSizePresetFromPrompt(value)
      if (explicitSizePreset) {
        extracted.size_preset = explicitSizePreset
        extracted.ratio_confirmed = true
        extracted.orientation = extracted.orientation || inferOrientationFromSizePreset(explicitSizePreset)
        const inferredUsagePreset = inferUsagePresetFromSizePreset(explicitSizePreset)
        if (!extracted.usage_preset && inferredUsagePreset) {
          const preset = USAGE_PRESET_DEFINITIONS[inferredUsagePreset]
          extracted.usage_preset = inferredUsagePreset
          extracted.usage_label = preset.zhLabel
        }
      }
      continue
    }
    if (!extracted.goal && /^(goal|objective|usage|use case|鐢ㄩ€攟鐩爣)$/.test(label)) {
      extracted.goal = value
      continue
    }
    if (!extracted.subject && /^(subject|main subject|涓讳綋|鍐呭)$/.test(label)) {
      extracted.subject = value
      continue
    }
    if (!extracted.style && /^(style|mood|look|椋庢牸|姘涘洿)$/.test(label)) {
      extracted.style = value
      continue
    }
    if (!extracted.composition && /^(composition|layout|framing|鏋勫浘|鐗堝紡|闀滃ご)$/.test(label)) {
      extracted.composition = value
      continue
    }
    if (!extracted.constraints && /^(constraints|must keep|preserve|闄愬埗|绾︽潫|淇濈暀)$/.test(label)) {
      extracted.constraints = value
    }
  }

  return normalizeBrief(extracted)
}

async function resolveSelectedSkillMetadata(selectedSkill: ReturnType<typeof selectImageAssistantSkill>) {
  const fallback = getImageAssistantSkillDefinition(selectedSkill.id)
  const metadata = await getImageAssistantAgentMetadata(selectedSkill.id, {
    display_name: fallback.label,
    description: fallback.description,
    short_description: fallback.description,
    default_prompt: fallback.system_prompt,
    stage: fallback.stage,
    when_to_use: fallback.description,
  })

  return {
    id: selectedSkill.id,
    label: metadata.display_name || selectedSkill.label,
    stage: metadata.stage === "execution" ? "execution" : "briefing",
  } as const
}

function inferBriefFromPrompt(input: {
  prompt: string
  taskType: ImageAssistantTaskType
  sizePreset: ImageAssistantSizePreset
  referenceCount: number
}) {
  const prompt = normalizeText(input.prompt)
  if (!prompt) return { ...EMPTY_BRIEF }
  const useEditShortcut = usesReferenceEditShortcutStable(input)

  const inferred: Partial<ImageAssistantBrief> = extractBriefFromLabeledLines(prompt)
  const lower = prompt.toLowerCase()
  const explicitSizePreset = inferSizePresetFromPrompt(prompt)
  const hasStructuredBrief = Boolean(
    inferred.goal ||
      inferred.subject ||
      inferred.style ||
      inferred.composition ||
      inferred.constraints ||
      inferred.usage_preset ||
      inferred.orientation ||
      inferred.resolution,
  )

  const usagePreset = inferred.usage_preset || inferUsagePresetFromPrompt(prompt) || inferUsagePresetFromSizePreset(explicitSizePreset)
  if (usagePreset) {
    const preset = USAGE_PRESET_DEFINITIONS[usagePreset]
    inferred.usage_preset = usagePreset
    inferred.usage_label = inferred.usage_label || (looksLikeChinese(prompt) ? preset.zhLabel : preset.enLabel)
    inferred.size_preset = inferred.size_preset || explicitSizePreset || preset.sizePreset
    inferred.orientation = inferred.orientation || preset.orientation
  }

  if (!inferred.size_preset && explicitSizePreset) {
    inferred.size_preset = explicitSizePreset
  }

  if (!inferred.orientation) {
    inferred.orientation = inferOrientationFromPrompt(prompt) || inferOrientationFromSizePreset(inferred.size_preset || "")
  }

  if (!inferred.resolution) {
    inferred.resolution = inferResolutionFromPrompt(lower)
  }

  if (explicitSizePreset) {
    inferred.ratio_confirmed = true
  }

  if (!inferred.goal && !hasStructuredBrief && /cover|poster|ad|kv|banner/.test(lower)) {
    inferred.goal = truncate(prompt, 120)
  }
  if (!inferred.style && /minimal|editorial|cinematic|luxury|summer|campaign|ecommerce/.test(lower)) {
    inferred.style = truncate(prompt, 120)
  }
  if (!inferred.composition && /center|whitespace|title|layout|camera|focus/.test(lower)) {
    inferred.composition = truncate(prompt, 140)
  }

  if (!inferred.subject && input.referenceCount > 0 && input.taskType !== "generate") {
    inferred.subject = looksLikeChinese(prompt)
      ? "请基于已上传图片中的主体和关键元素进行设计与编辑，并保留核心识别特征。"
      : "Use the uploaded references as the main subject and preserve the core identifiable elements."
  }

  if (!inferred.subject && input.taskType === "generate" && !hasStructuredBrief) {
    inferred.subject = truncate(prompt, 140)
  }

  if (!inferred.composition) {
    inferred.composition = useEditShortcut
      ? looksLikeChinese(prompt)
        ? "默认延续参考图现有的构图、机位和主体位置，只调整用户明确要求修改的局部内容。"
        : "Keep the original reference image composition, framing, camera angle, and subject placement unless the user explicitly requests a new layout."
      : looksLikeChinese(prompt)
        ? `按 ${input.sizePreset} 画幅组织画面，保留明确视觉焦点和可放标题的安全留白。`
        : `Use a ${input.sizePreset} composition with a clear focal hierarchy and text-safe whitespace.`
  }

  if (!inferred.goal && !hasStructuredBrief) {
    inferred.goal = truncate(prompt, 120)
  }

  return useEditShortcut ? applyReferenceEditDefaults(normalizeBrief(inferred), prompt) : normalizeBrief(inferred)
}

function extractJsonObject(text: string) {
  const trimmed = text.trim()
  if (!trimmed) return null

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced?.[1] || trimmed
  const first = candidate.indexOf("{")
  const last = candidate.lastIndexOf("}")
  if (first === -1 || last === -1 || last <= first) return null

  try {
    return JSON.parse(candidate.slice(first, last + 1))
  } catch {
    return null
  }
}

const BRIEF_EXTRACTION_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["brief_delta", "missing_fields", "conflicts", "confidence", "next_question", "ready_for_generation"],
  properties: {
    brief_delta: {
      type: "object",
      additionalProperties: false,
      properties: {
        usage_preset: { type: "string", enum: ["", "website_banner", "social_cover", "ad_poster", "avatar"] },
        usage_label: { type: "string", maxLength: 120 },
        orientation: { type: "string", enum: ["", "landscape", "portrait"] },
        resolution: { type: "string", enum: ["", "512", "1K", "2K", "4K"] },
        size_preset: { type: "string", enum: ["", "1:1", "4:5", "3:4", "4:3", "16:9", "9:16"] },
        ratio_confirmed: { type: "boolean" },
        goal: { type: "string", maxLength: 220 },
        subject: { type: "string", maxLength: 220 },
        style: { type: "string", maxLength: 220 },
        composition: { type: "string", maxLength: 260 },
        constraints: { type: "string", maxLength: 260 },
      },
    },
    missing_fields: { type: "array", items: { type: "string", enum: BRIEF_FIELD_VALUES }, maxItems: BRIEF_FIELD_VALUES.length },
    conflicts: { type: "array", items: { type: "string", maxLength: 180 }, maxItems: 8 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    next_question: { type: "string", maxLength: 240 },
    ready_for_generation: { type: "boolean" },
  },
}

function getBriefExtractionSchemaSpec() {
  return JSON.stringify(BRIEF_EXTRACTION_JSON_SCHEMA, null, 0)
}

function shouldFallbackToTextFromStructuredError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  if (!message) return false

  if (
    message.includes("user not found") ||
    message.includes("unauthorized") ||
    message.includes("invalid api key") ||
    message.includes("forbidden") ||
    message.includes("insufficient_quota") ||
    message.includes("rate limit") ||
    message.includes("429")
  ) {
    return false
  }

  return (
    message.includes("tool") ||
    message.includes("function") ||
    message.includes("tool_choice") ||
    message.includes("tool call") ||
    message.includes("response_format") ||
    message.includes("json_schema") ||
    message.includes("strict") ||
    message.includes("not supported") ||
    message.includes("unsupported") ||
    message.includes("openai_compatible_tool_call_missing")
  )
}

function applyBriefSemanticValidation(input: {
  brief: ImageAssistantBrief
  fallbackSizePreset: ImageAssistantSizePreset
  userPrompt: string
}) {
  const base = normalizeBrief(input.brief)
  const patch: Partial<ImageAssistantBrief> = {}
  const conflicts: string[] = []

  if (base.usage_preset) {
    const usage = USAGE_PRESET_DEFINITIONS[base.usage_preset]
    if (!base.size_preset) {
      patch.size_preset = usage.sizePreset
    }
    if (!base.orientation) {
      patch.orientation = usage.orientation
    }
  }

  if (!base.size_preset) {
    const inferredFromPrompt = inferSizePresetFromPrompt(input.userPrompt)
    if (inferredFromPrompt) {
      patch.size_preset = inferredFromPrompt
      patch.ratio_confirmed = true
    }
  }

  const effectiveSizePreset = patch.size_preset || base.size_preset
  const inferredOrientation = inferOrientationFromSizePreset(effectiveSizePreset || "")
  if (inferredOrientation && !base.orientation) {
    patch.orientation = inferredOrientation
  } else if (inferredOrientation && base.orientation && base.orientation !== inferredOrientation) {
    conflicts.push(`orientation_conflict:${base.orientation}->${inferredOrientation}`)
    patch.orientation = inferredOrientation
  }

  const validated = mergeBrief(base, patch)
  if (!validated.size_preset && input.fallbackSizePreset) {
    return {
      brief: mergeBrief(validated, { size_preset: input.fallbackSizePreset }),
      conflicts: dedupeStrings(conflicts),
    }
  }

  return { brief: validated, conflicts: dedupeStrings(conflicts) }
}

async function extractBriefWithSchema(input: {
  prompt: string
  priorState: ImageAssistantOrchestrationState | null
  mergedBrief: ImageAssistantBrief
  missingFields: ImageAssistantBriefField[]
  taskType: ImageAssistantTaskType
  sizePreset: ImageAssistantSizePreset
  resolution: string
  referenceCount: number
  isGuidedOptionTurn: boolean
  activePromptQuestionId: string | null
  activePromptOptionIds: string[]
}): Promise<BriefExtractionResult | null> {
  const useGuidedPlannerPrompt = input.isGuidedOptionTurn
  const skill = getImageAssistantSkillDefinition("graphic-design-brief")
  const runtimeSystemPrompt = useGuidedPlannerPrompt
    ? null
    : await getImageAssistantRuntimeSystemPrompt("graphic-design-brief", skill.system_prompt)
  const promptCompositionRules = useGuidedPlannerPrompt
    ? []
    : await getImageAssistantPromptCompositionRules("graphic-design-brief")
  const systemPrompt = [
    useGuidedPlannerPrompt
      ? "You are a schema-locked brief extractor for an image design assistant."
      : runtimeSystemPrompt,
    useGuidedPlannerPrompt
      ? "The latest user message is usually a guided option click from the UI."
      : promptCompositionRules.length
        ? `Follow-up rules: ${promptCompositionRules.join(" ")}`
        : null,
    useGuidedPlannerPrompt
      ? "Update only fields implied by the guided option while preserving already confirmed fields."
      : "Extract structured brief deltas from the latest user turn without composing final image prompts.",
    useGuidedPlannerPrompt
      ? "If guided options are still available, keep reply_to_user short and point to the next guided question."
      : null,
    "Do not generate an image prompt in this stage.",
    "Return strict JSON only. No markdown.",
    `Schema version: ${BRIEF_EXTRACT_SCHEMA_VERSION}.`,
    `Output JSON schema (must be exact): ${getBriefExtractionSchemaSpec()}`,
  ]
    .filter(Boolean)
    .join(" ")

  const userPromptPayload = useGuidedPlannerPrompt
    ? {
        planner_mode: "guided_option",
        task_type: input.taskType,
        turn_count: (input.priorState?.turn_count || 0) + 1,
        reference_count: input.referenceCount,
        size_preset: input.sizePreset,
        resolution: input.resolution,
        active_prompt_question_id: input.activePromptQuestionId,
        active_prompt_option_ids: input.activePromptOptionIds,
        previous_brief: input.priorState?.brief || EMPTY_BRIEF,
        current_brief: input.mergedBrief,
        current_prompt: input.prompt,
        current_missing_fields: input.missingFields,
        schema_version: BRIEF_EXTRACT_SCHEMA_VERSION,
      }
    : {
        task_type: input.taskType,
        turn_count: (input.priorState?.turn_count || 0) + 1,
        max_turns: IMAGE_ASSISTANT_MAX_BRIEF_TURNS,
        reference_count: input.referenceCount,
        size_preset: input.sizePreset,
        resolution: input.resolution,
        previous_brief: input.priorState?.brief || EMPTY_BRIEF,
        current_brief: input.mergedBrief,
        current_prompt: input.prompt,
        current_missing_fields: input.missingFields,
        schema_version: BRIEF_EXTRACT_SCHEMA_VERSION,
      }
  const userPrompt = JSON.stringify(userPromptPayload)
  const textGenerationOptions = useGuidedPlannerPrompt
    ? { temperature: 0, maxTokens: BRIEF_PLANNER_GUIDED_MAX_TOKENS }
    : { temperature: 0.15, maxTokens: BRIEF_PLANNER_MAX_TOKENS }
  const plannerPrimaryModel = useGuidedPlannerPrompt
    ? IMAGE_ASSISTANT_SKILL_MODEL || IMAGE_ASSISTANT_TEXT_MODEL
    : IMAGE_ASSISTANT_TEXT_MODEL || IMAGE_ASSISTANT_SKILL_MODEL
  const plannerModels = buildPlannerModelCandidates(plannerPrimaryModel)
  const plannerTimeoutMs = useGuidedPlannerPrompt ? BRIEF_PLANNER_GUIDED_TIMEOUT_MS : BRIEF_PLANNER_TIMEOUT_MS
  const plannerProviderTimeoutMs = useGuidedPlannerPrompt
    ? BRIEF_PLANNER_GUIDED_PROVIDER_TIMEOUT_MS
    : BRIEF_PLANNER_PROVIDER_TIMEOUT_MS
  const plannerDeadlineAt = Date.now() + plannerTimeoutMs
  const getRemainingPlannerBudgetMs = () => Math.max(0, plannerDeadlineAt - Date.now())

  try {
    let raw = ""
    let parsed: unknown = null
    let lastPlannerError: unknown = null
    for (let attemptIndex = 0; attemptIndex < plannerModels.length; attemptIndex += 1) {
      const plannerModel = plannerModels[attemptIndex]
      parsed = null
      raw = ""

      const remainingBeforeAttemptMs = getRemainingPlannerBudgetMs()
      if (remainingBeforeAttemptMs <= 0) {
        throw new Error("image_assistant_planner_timeout")
      }
      const plannerAttemptTimeoutMs = Math.max(1_000, Math.min(plannerProviderTimeoutMs, remainingBeforeAttemptMs))

      try {
        try {
          parsed = await generateStructuredObjectWithWriterModel({
            systemPrompt,
            userPrompt,
            model: plannerModel,
            toolName: "extract_brief_state",
            toolDescription: "Extract structured brief delta, missing fields, conflicts, confidence, and readiness.",
            jsonSchema: BRIEF_EXTRACTION_JSON_SCHEMA,
            options: {
              ...textGenerationOptions,
              timeoutMs: plannerAttemptTimeoutMs,
              totalTimeoutMs: remainingBeforeAttemptMs,
              providerTimeoutMs: plannerAttemptTimeoutMs,
            },
          })
        } catch (structuredError) {
          const shouldFallback = shouldFallbackToTextFromStructuredError(structuredError)
          console.warn(
            shouldFallback
              ? "image-assistant.structured-extract.fallback"
              : "image-assistant.structured-extract.failed",
            {
              model: plannerModel,
              guided: useGuidedPlannerPrompt,
              message: structuredError instanceof Error ? structuredError.message : String(structuredError),
            },
          )
          if (!shouldFallback) {
            throw structuredError
          }

          const remainingBeforeTextFallbackMs = getRemainingPlannerBudgetMs()
          if (remainingBeforeTextFallbackMs <= 0) {
            throw new Error("image_assistant_planner_timeout")
          }
          const textFallbackTimeoutMs = Math.max(1_000, Math.min(plannerAttemptTimeoutMs, remainingBeforeTextFallbackMs))

          raw = await generateTextWithWriterModel(systemPrompt, userPrompt, plannerModel, {
            ...textGenerationOptions,
            timeoutMs: textFallbackTimeoutMs,
            totalTimeoutMs: remainingBeforeTextFallbackMs,
            providerTimeoutMs: textFallbackTimeoutMs,
          })
          parsed = extractJsonObject(raw)
        }
      } catch (error) {
        if (getRemainingPlannerBudgetMs() <= 0) {
          throw new Error("image_assistant_planner_timeout")
        }

        lastPlannerError = error
        const nextModel = plannerModels[attemptIndex + 1] || null
        const canRetryWithAnotherModel = Boolean(nextModel && shouldRetryPlannerWithAnotherModel(error))

        if (canRetryWithAnotherModel) {
          console.warn("image-assistant.text-planner.model-retry", {
            fromModel: plannerModel,
            toModel: nextModel,
            guided: useGuidedPlannerPrompt,
            message: error instanceof Error ? error.message : String(error),
          })
          continue
        }

        throw error
      }

      if (parsed && typeof parsed === "object") {
        break
      }
    }

    if ((!parsed || typeof parsed !== "object") && lastPlannerError) {
      throw lastPlannerError
    }
    if (!parsed || typeof parsed !== "object") return null
    const validation = BriefExtractionOutputSchema.safeParse(parsed)
    if (!validation.success) return null
    const output: BriefExtractionOutput = validation.data
    const brief = mergeBrief(input.mergedBrief, output.brief_delta)
    const missingFields = output.missing_fields.filter((field): field is ImageAssistantBriefField =>
      BRIEF_FIELD_VALUES.includes(field as (typeof BRIEF_FIELD_VALUES)[number]),
    )

    return {
      brief,
      missingFields,
      readyForGeneration: Boolean(output.ready_for_generation) && missingFields.length === 0,
      conflicts: dedupeStrings(output.conflicts || []),
      confidence: Math.max(0, Math.min(1, Number(output.confidence || 0))),
      nextQuestion: normalizeText(output.next_question || ""),
    }
  } catch (error) {
    console.warn("image-assistant.text-planner.failed", {
      model: plannerPrimaryModel,
      attemptedModels: plannerModels,
      guided: useGuidedPlannerPrompt,
      message: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

function isBriefFieldFilled(brief: ImageAssistantBrief, field: ImageAssistantBriefField) {
  if (field === "usage") return Boolean(brief.usage_preset)
  if (field === "orientation") return Boolean(brief.orientation)
  if (field === "resolution") return Boolean(brief.resolution)
  if (field === "ratio") return Boolean(brief.size_preset && brief.ratio_confirmed)
  return Boolean(normalizeText(brief[field]))
}

function getCollectedBriefFieldCount(brief: ImageAssistantBrief) {
  return REQUIRED_BRIEF_FIELDS.filter((field) => isBriefFieldFilled(brief, field)).length
}

function hasImageAssistantDeliverySkeleton(brief: ImageAssistantBrief) {
  return Boolean(
    brief.usage_preset &&
      brief.orientation &&
      brief.resolution &&
      brief.size_preset &&
      brief.ratio_confirmed &&
      normalizeText(brief.subject),
  )
}

function applyBriefProgressionFallbacks(input: {
  brief: ImageAssistantBrief
  userPrompt: string
  turnCount: number
  maxTurns: number
}) {
  const base = normalizeBrief(input.brief)
  const isZh = looksLikeChinese(`${input.userPrompt} ${base.goal} ${base.subject} ${base.usage_label}`)
  const hasDeliverySkeleton = hasImageAssistantDeliverySkeleton(base)
  const patch: Partial<ImageAssistantBrief> = {}

  if (!base.subject && input.turnCount >= input.maxTurns) {
    patch.subject = truncate(input.userPrompt, 140)
  }

  if (hasDeliverySkeleton && !normalizeText(base.style)) {
    patch.style = isZh
      ? "整体保持商业级视觉质感，突出主体识别，色彩与光影统一，风格简洁高级并可直接用于投放。"
      : "Use a polished commercial visual style with clear subject identity, cohesive lighting and color, and production-ready quality."
  }

  if (hasDeliverySkeleton && !normalizeText(base.composition)) {
    patch.composition = isZh
      ? `按 ${base.size_preset || "1:1"} 画幅组织画面，保留主视觉焦点，并预留可放标题与卖点文案的安全区域。`
      : `Use a ${base.size_preset || "1:1"} composition with a clear focal area and safe whitespace for headline overlays.`
  }

  return mergeBrief(base, patch)
}

function buildPromptQuestions(input: {
  brief: ImageAssistantBrief
  missingFields: ImageAssistantBriefField[]
  userPrompt: string
}): ImageAssistantPromptQuestion[] {
  const isZh = looksLikeChinese(`${input.userPrompt} ${input.brief.goal} ${input.brief.subject} ${input.brief.style}`)
  const nextGuidedField = input.missingFields.find((field) => GUIDED_BRIEF_FIELDS.has(field))
  if (!nextGuidedField) return []

  const usageOptions: ImageAssistantPromptOption[] = (Object.entries(USAGE_PRESET_DEFINITIONS) as Array<
    [ImageAssistantUsagePresetId, (typeof USAGE_PRESET_DEFINITIONS)[ImageAssistantUsagePresetId]]
  >).map(([presetId, preset]) => ({
    id: presetId,
    label: isZh ? preset.zhLabel : preset.enLabel,
    description: isZh ? preset.zhDescription : preset.enDescription,
    emphasis: "card",
    prompt_value: isZh ? preset.zhLabel : preset.enLabel,
    brief_patch: {
      usage_preset: presetId,
      usage_label: isZh ? preset.zhLabel : preset.enLabel,
      size_preset: preset.sizePreset,
      orientation: preset.orientation,
      ratio_confirmed: true,
    },
    size_preset: preset.sizePreset,
  }))

  if (nextGuidedField === "usage") {
    return [
      {
        id: "usage",
        title: isZh ? "Q1 先选用途" : "Q1 Pick the use case",
        description: isZh ? "直接选择“用途 + 推荐比例”卡片。" : "Pick a use-case card with its recommended ratio.",
        display: "cards",
        options: usageOptions,
      },
    ]
  }

  if (nextGuidedField === "orientation") {
    return [
      {
        id: "orientation",
        title: isZh ? "Q2 再确认方向" : "Q2 Confirm the direction",
        description: isZh ? "只需要选择横版画面或竖版画面。" : "Choose landscape or portrait only.",
        display: "buttons",
        options: [
          {
            id: "landscape",
            label: isZh ? "横版画面" : "Landscape",
            emphasis: "button",
            prompt_value: isZh ? "横版画面" : "Landscape",
            brief_patch: { orientation: "landscape" },
          },
          {
            id: "portrait",
            label: isZh ? "竖版画面" : "Portrait",
            emphasis: "button",
            prompt_value: isZh ? "竖版画面" : "Portrait",
            brief_patch: { orientation: "portrait" },
          },
        ],
      },
    ]
  }

  if (nextGuidedField === "resolution") {
    return [
      {
        id: "resolution",
        title: isZh ? "Q3 再确认图片大小" : "Q3 Confirm the image size",
        description: isZh ? "按清晰度选择即可，不需要输入数字。" : "Choose the delivery quality directly.",
        display: "buttons",
        options: (Object.entries(RESOLUTION_PRESET_DEFINITIONS) as Array<
          [ImageAssistantResolution, (typeof RESOLUTION_PRESET_DEFINITIONS)[ImageAssistantResolution]]
        >).map(([resolution, preset]) => ({
          id: resolution,
          label: isZh ? preset.zhLabel : preset.enLabel,
          description: isZh ? preset.zhDescription : preset.enDescription,
          emphasis: "button",
          prompt_value: isZh ? preset.zhLabel : preset.enLabel,
          brief_patch: { resolution },
          resolution,
        })),
      },
    ]
  }

  const ratioOptions = usageOptions
    .filter((option) => {
      if (!input.brief.orientation) return true
      const preset = option.brief_patch?.usage_preset ? USAGE_PRESET_DEFINITIONS[option.brief_patch.usage_preset] : null
      if (!preset) return true
      if (input.brief.orientation === "landscape") return preset.orientation === "landscape"
      return preset.orientation === "portrait" || preset.sizePreset === "1:1"
    })
    .map((option) => ({
      ...option,
      brief_patch: {
        ...option.brief_patch,
        ratio_confirmed: true,
      },
    }))

  return [
    {
      id: "ratio",
      title: isZh ? "Q4 最后确认用途与比例" : "Q4 Confirm the final use + ratio",
      description: isZh ? "只显示“用途 + 比例”卡片，不显示裸数字比例。" : "Choose the final use + ratio card instead of a bare numeric ratio.",
      display: "cards",
      options: ratioOptions,
    },
  ]
}

function buildClarificationReply(input: {
  brief: ImageAssistantBrief
  missingFields: ImageAssistantBriefField[]
  turnCount: number
  maxTurns: number
  recommendedMode: "generate" | "edit"
  referenceCount: number
  userPrompt: string
  promptQuestions: ImageAssistantPromptQuestion[]
}) {
  const isZh = looksLikeChinese(`${input.userPrompt} ${input.brief.goal} ${input.brief.subject} ${input.brief.style}`)
  const questions = isZh ? FIELD_QUESTIONS_ZH : FIELD_QUESTIONS_EN
  const filled = getCollectedBriefFieldCount(input.brief)
  const nextPromptQuestion = input.promptQuestions[0] || null

  const intro = isZh
    ? `当前已收集 ${filled}/${REQUIRED_BRIEF_FIELDS.length} 个关键设计信息。`
    : `I have the current design brief progress: ${filled}/${REQUIRED_BRIEF_FIELDS.length} key items collected.`
  const referenceLine =
    input.referenceCount > 0
      ? isZh
        ? `当前已关联 ${input.referenceCount} 张参考图，我会按${input.recommendedMode === "edit" ? "带图编辑" : "参考图辅助生成"}来处理。`
        : `${input.referenceCount} reference image(s) are attached, so I will treat this as an image-guided ${input.recommendedMode}.`
      : isZh
        ? "当前没有参考图，我会按文生图来理解需求。"
        : "There are no reference images attached, so I will treat this as a text-to-image request."
  const askLine = isZh
    ? nextPromptQuestion
      ? `下一步请先完成 ${nextPromptQuestion.title}。`
      : `为了继续，请补充：${input.missingFields.map((field) => questions[field]).join(" ")}`
    : nextPromptQuestion
      ? `Please complete ${nextPromptQuestion.title} next.`
      : `To continue, please clarify: ${input.missingFields.map((field) => questions[field]).join(" ")}`

  return [intro, referenceLine, askLine].join(" ")
}

async function composePromptFromApprovedBrief(input: {
  brief: ImageAssistantBrief
  taskType: ImageAssistantTaskType
  sizePreset: ImageAssistantSizePreset
  resolution: string
  referenceCount: number
  executionSkillId?: ImageAssistantSkillId | null
  extraInstructions?: string | null
}) {
  const requestedExecutionSkillId =
    input.executionSkillId && getImageAssistantSkillDefinition(input.executionSkillId).stage === "execution"
      ? input.executionSkillId
      : "canvas-design-execution"
  const executionSkill = getImageAssistantSkillDefinition(requestedExecutionSkillId)
  const runtimeSystemPrompt = await getImageAssistantRuntimeSystemPrompt(
    requestedExecutionSkillId,
    executionSkill.system_prompt,
  )
  const compositionRules = await getImageAssistantPromptCompositionRules(requestedExecutionSkillId)
  const failureChecks = dedupeStrings([
    ...(await getImageAssistantFailureChecks("graphic-design-brief")),
    ...(await getImageAssistantFailureChecks(requestedExecutionSkillId)),
  ])
  const effectiveSizePreset = input.brief.size_preset || input.sizePreset
  const effectiveResolution = input.brief.resolution || input.resolution
  const usageLabel = input.brief.usage_label || input.brief.goal || "image delivery"
  const orientationLabel =
    input.brief.orientation === "landscape" ? "landscape" : input.brief.orientation === "portrait" ? "portrait" : null
  const lines = [
    `Execution mindset: ${runtimeSystemPrompt}`,
    input.taskType === "generate"
      ? "Create a production-ready image based on this approved design brief."
      : "Edit the provided reference image(s) according to this approved design brief.",
    `Design objective: ${input.brief.goal || usageLabel || "Produce a strong result that matches the user's request."}`,
    `Delivery context: ${usageLabel}.`,
    orientationLabel ? `Canvas direction: ${orientationLabel}.` : null,
    `Subject and must-have elements: ${input.brief.subject || "Use the user's prompt as the primary subject description."}`,
    `Style and mood: ${input.brief.style || "Use a polished, production-ready visual direction inferred from the request."}`,
    `Composition and layout: ${input.brief.composition || `Use a ${effectiveSizePreset} layout with clear focal hierarchy and safe whitespace.`}`,
    input.brief.constraints ? `Constraints and must-keep details: ${input.brief.constraints}` : null,
    input.referenceCount > 0
      ? `Reference handling: ${input.taskType === "generate" ? "use the uploaded images as guidance while preserving key identity cues." : "preserve the recognizable identity and only change what the brief requires."}`
      : "Reference handling: there are no image references; rely only on the written brief.",
    compositionRules.length ? `Execution rules: ${compositionRules.join(" ")}` : null,
    failureChecks.length ? `Failure checks: ${failureChecks.join(" ")}` : null,
    input.taskType === "mask_edit"
      ? "Output requirement: return the fully edited image at the original dimensions while preserving framing and subject placement as closely as possible."
      : `Output requirement: ${effectiveSizePreset} composition, ${effectiveResolution} resolution target, clean focal hierarchy, production-safe framing.`,
    input.extraInstructions ? input.extraInstructions : null,
  ]

  if (input.taskType === "mask_edit") {
    lines.push("Editing requirement: keep untouched areas as stable as possible, focus the changes on the requested region, and do not return a cropped patch.")
  }

  return lines.filter(Boolean).join("\n")
}

function buildToolTraces(input: {
  brief: ImageAssistantBrief
  missingFields: ImageAssistantBriefField[]
  selectedSkill: ReturnType<typeof selectImageAssistantSkill>
  referenceCount: number
  generatedPrompt: string | null
  turnCount: number
}) {
  const collectedCount = getCollectedBriefFieldCount(input.brief)
  const traces: ImageAssistantToolTrace[] = [
    {
      name: "collect_brief",
      status: "completed",
      summary: `Collected ${collectedCount}/${REQUIRED_BRIEF_FIELDS.length} required brief fields by turn ${input.turnCount}/${IMAGE_ASSISTANT_MAX_BRIEF_TURNS}.`,
    },
    {
      name: "analyze_references",
      status: "completed",
      summary: `${input.referenceCount} user-owned reference image(s) attached to this session turn.`,
    },
    {
      name: "select_skill",
      status: "completed",
      summary: `Selected ${input.selectedSkill.label} for ${input.selectedSkill.stage}.`,
    },
    {
      name: "compose_generation_prompt",
      status: input.generatedPrompt ? "completed" : "skipped",
        summary: input.generatedPrompt
          ? "Built the final image-model prompt from the approved brief."
          : `Waiting for remaining brief fields: ${input.missingFields.join(", ") || "none"}.`,
    },
  ]

  return traces
}

export function extractLatestImageAssistantOrchestration(messages: ImageAssistantMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    const payloads = [message.response_payload, message.request_payload]
    for (const payload of payloads) {
      const orchestration = payload && typeof payload === "object" ? (payload as any).orchestration : null
      if (!orchestration || typeof orchestration !== "object") continue

      return {
        brief: normalizeBrief(orchestration.brief as Partial<ImageAssistantBrief> | null | undefined),
        missing_fields: Array.isArray(orchestration.missing_fields)
          ? orchestration.missing_fields.filter((field: unknown): field is ImageAssistantBriefField =>
              REQUIRED_BRIEF_FIELDS.includes(field as ImageAssistantBriefField),
            )
          : [],
        turn_count: Number(orchestration.turn_count || 0),
        max_turns: Number(orchestration.max_turns || IMAGE_ASSISTANT_MAX_BRIEF_TURNS),
        ready_for_generation: Boolean(orchestration.ready_for_generation),
        planner_strategy:
          orchestration.planner_strategy === "rule_shortcut" ||
          orchestration.planner_strategy === "text_model" ||
          orchestration.planner_strategy === "heuristic"
            ? orchestration.planner_strategy
            : undefined,
        schema_version: normalizeText(orchestration.schema_version),
        prompt_version: normalizeText(orchestration.prompt_version),
        extraction_confidence:
          typeof orchestration.extraction_confidence === "number"
            ? Math.max(0, Math.min(1, orchestration.extraction_confidence))
            : undefined,
        extraction_conflicts: Array.isArray(orchestration.extraction_conflicts)
          ? orchestration.extraction_conflicts
              .map((value: unknown) => normalizeText(value))
              .filter(Boolean)
          : [],
        selected_skill: orchestration.selected_skill,
        tool_traces: Array.isArray(orchestration.tool_traces) ? orchestration.tool_traces : [],
        reference_count: Number(orchestration.reference_count || 0),
        recommended_mode: orchestration.recommended_mode === "edit" ? "edit" : "generate",
        follow_up_question: normalizeText(orchestration.follow_up_question),
        prompt_questions: Array.isArray(orchestration.prompt_questions)
          ? orchestration.prompt_questions.filter(
              (question: unknown): question is ImageAssistantPromptQuestion =>
                Boolean(question && typeof question === "object" && typeof (question as any).id === "string"),
            )
          : [],
        generated_prompt: normalizeText(orchestration.generated_prompt),
      } satisfies ImageAssistantOrchestrationState
    }
  }

  return null
}

export function buildImageAssistantTurnContent(input: {
  prompt: string
  brief: Partial<ImageAssistantBrief> | null | undefined
  taskType: ImageAssistantTaskType
}) {
  const prompt = normalizeText(input.prompt)
  const brief = normalizeBrief(input.brief)
  const sections = [
    prompt ? `User request: ${prompt}` : null,
    brief.usage_label ? `Usage: ${brief.usage_label}` : null,
    brief.orientation ? `Orientation: ${brief.orientation === "landscape" ? "Landscape" : "Portrait"}` : null,
    brief.resolution ? `Quality: ${brief.resolution}` : null,
    brief.size_preset ? `Ratio: ${brief.size_preset}${brief.ratio_confirmed ? " (confirmed)" : ""}` : null,
    brief.goal ? `Objective: ${brief.goal}` : null,
    brief.subject ? `Subject: ${brief.subject}` : null,
    brief.style ? `Style: ${brief.style}` : null,
    brief.composition ? `Composition: ${brief.composition}` : null,
    brief.constraints ? `Constraints: ${brief.constraints}` : null,
    `Requested mode: ${input.taskType === "generate" ? "generate" : "edit"}`,
  ]

  return sections.filter(Boolean).join("\n")
}

export async function planImageAssistantTurn(input: {
  prompt: string
  currentBrief?: Partial<ImageAssistantBrief> | null
  previousState: ImageAssistantOrchestrationState | null
  taskType: ImageAssistantTaskType
  sizePreset: ImageAssistantSizePreset
  resolution: string
  referenceCount: number
  extraInstructions?: string | null
}) {
  const useEditShortcut = shouldSkipTextPlanner({
    prompt: input.prompt,
    taskType: input.taskType,
    referenceCount: input.referenceCount,
  })
  const activePromptQuestion = input.previousState?.prompt_questions?.[0] || null
  const promptOptionBrief = inferBriefFromPromptQuestionOption({
    prompt: input.prompt,
    previousState: input.previousState,
  })
  const isGuidedOptionTurn = hasAnyBriefSignal(promptOptionBrief) && Boolean(activePromptQuestion)
  const inferred = isGuidedOptionTurn
    ? { ...EMPTY_BRIEF }
    : inferBriefFromPrompt({
        prompt: input.prompt,
        taskType: input.taskType,
        sizePreset: input.sizePreset,
        referenceCount: input.referenceCount,
      })
  const contextual = isGuidedOptionTurn
    ? { ...EMPTY_BRIEF }
    : inferBriefFromFollowUpAnswer({
        prompt: input.prompt,
        previousState: input.previousState,
      })
  const activePromptOptionIds = activePromptQuestion
    ? (activePromptQuestion.options || [])
        .map((option) => normalizeText(option.id))
        .filter(Boolean)
    : []
  const mergedBrief = mergeBrief(input.previousState?.brief, input.currentBrief, promptOptionBrief, inferred, contextual)
  const initialMissingFields = getActionableBriefMissingFields(mergedBrief)
  const turnCount = Math.min((input.previousState?.turn_count || 0) + 1, IMAGE_ASSISTANT_MAX_BRIEF_TURNS)
  const extraction = useEditShortcut
    ? null
    : await extractBriefWithSchema({
        prompt: input.prompt,
        priorState: input.previousState,
        mergedBrief,
        missingFields: initialMissingFields,
        taskType: input.taskType,
        sizePreset: input.sizePreset,
        resolution: input.resolution,
        referenceCount: input.referenceCount,
        isGuidedOptionTurn,
        activePromptQuestionId: activePromptQuestion?.id || null,
        activePromptOptionIds,
      })

  const rawBrief = useEditShortcut
    ? applyReferenceEditDefaults(extraction?.brief || mergedBrief, input.prompt)
    : extraction?.brief || mergedBrief
  const briefWithFallbacks = applyBriefProgressionFallbacks({
    brief: rawBrief,
    userPrompt: input.prompt,
    turnCount,
    maxTurns: IMAGE_ASSISTANT_MAX_BRIEF_TURNS,
  })
  const semanticValidation = applyBriefSemanticValidation({
    brief: briefWithFallbacks,
    fallbackSizePreset: input.sizePreset,
    userPrompt: input.prompt,
  })
  const brief = semanticValidation.brief
  const missingFields = getActionableBriefMissingFields(brief)
  const promptQuestions = buildPromptQuestions({
    brief,
    missingFields,
    userPrompt: input.prompt,
  })
  const deterministicSkill = selectImageAssistantSkill({
    taskType: input.taskType,
    readyForGeneration: missingFields.length === 0,
    prompt: input.prompt,
    usagePreset: brief.usage_preset,
    goal: brief.goal,
  })
  const selectedSkill = await resolveSelectedSkillMetadata(deterministicSkill)
  const generatedPrompt =
    missingFields.length === 0
      ? await composePromptFromApprovedBrief({
          brief,
          taskType: input.taskType,
          sizePreset: input.sizePreset,
          resolution: input.resolution,
          referenceCount: input.referenceCount,
          executionSkillId: selectedSkill.id,
          extraInstructions: input.extraInstructions,
        })
      : null
  const replyToUser =
    missingFields.length > 0
      ? buildClarificationReply({
      brief,
      missingFields,
      turnCount,
      maxTurns: IMAGE_ASSISTANT_MAX_BRIEF_TURNS,
      recommendedMode: input.taskType === "generate" ? "generate" : "edit",
      referenceCount: input.referenceCount,
      userPrompt: input.prompt,
      promptQuestions,
    })
      : null
  const plannerStrategy = useEditShortcut ? "rule_shortcut" : extraction ? "text_model" : "heuristic"
  const extractionConflicts = dedupeStrings([...(extraction?.conflicts || []), ...semanticValidation.conflicts])

  const orchestration: ImageAssistantOrchestrationState = {
    brief,
    missing_fields: missingFields,
    turn_count: turnCount,
    max_turns: IMAGE_ASSISTANT_MAX_BRIEF_TURNS,
    ready_for_generation: Boolean(generatedPrompt) && missingFields.length === 0,
    planner_strategy: plannerStrategy,
    schema_version: BRIEF_EXTRACT_SCHEMA_VERSION,
    prompt_version: BRIEF_PROMPT_VERSION,
    extraction_confidence: extraction?.confidence ?? 0,
    extraction_conflicts: extractionConflicts,
    selected_skill: selectedSkill,
    tool_traces: buildToolTraces({
      brief,
      missingFields,
      selectedSkill,
      referenceCount: input.referenceCount,
      generatedPrompt,
      turnCount,
    }),
    reference_count: input.referenceCount,
    recommended_mode: input.taskType === "generate" ? "generate" : "edit",
    follow_up_question: replyToUser,
    prompt_questions: promptQuestions,
    generated_prompt: generatedPrompt,
  }

  return {
    orchestration,
    assistantReply: replyToUser,
  }
}

