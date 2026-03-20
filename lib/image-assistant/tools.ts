import {
  getImageAssistantAgentMetadata,
  getImageAssistantFailureChecks,
  getImageAssistantPromptCompositionRules,
  getImageAssistantRuntimeSystemPrompt,
} from "@/lib/image-assistant/skill-documents"
import { looksLikeReferenceEditIntent } from "@/lib/image-assistant/intent"
import { generateTextWithWriterModel, hasWriterTextProvider } from "@/lib/writer/aiberm"
import { getImageAssistantSkillDefinition, IMAGE_ASSISTANT_MAX_BRIEF_TURNS, IMAGE_ASSISTANT_TEXT_MODEL, selectImageAssistantSkill } from "@/lib/image-assistant/skills"
import type {
  ImageAssistantBrief,
  ImageAssistantBriefField,
  ImageAssistantMessage,
  ImageAssistantOrientation,
  ImageAssistantOrchestrationState,
  ImageAssistantPromptOption,
  ImageAssistantPromptQuestion,
  ImageAssistantResolution,
  ImageAssistantSizePreset,
  ImageAssistantTaskType,
  ImageAssistantToolTrace,
  ImageAssistantUsagePresetId,
} from "@/lib/image-assistant/types"

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

function getUsagePresetDefinition(usagePreset: ImageAssistantUsagePresetId | "") {
  return usagePreset ? USAGE_PRESET_DEFINITIONS[usagePreset] : null
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

function getMissingBriefFields(brief: ImageAssistantBrief) {
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
  return /^(ok|okay|yes|no|濂界殑|濂絴琛寍鍙互|鏀跺埌|鏄庣櫧浜唡鍡瘄鎭﹟闅忎究|閮借)$/iu.test(value)
}

function splitBriefReplySegments(value: string) {
  return value
    .split(/\r?\n|[锛?]+/)
    .map((segment) => normalizeText(segment))
    .filter(Boolean)
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

  if (requestedFields.length === 1) {
    const field = requestedFields[0]
    if (field === "orientation") {
      extracted.orientation = /(?:横|landscape|wide)/iu.test(prompt) ? "landscape" : /(?:竖|portrait|tall)/iu.test(prompt) ? "portrait" : ""
    } else if (field === "resolution") {
      extracted.resolution =
        /(?:4k|超高清)/iu.test(prompt) ? "4K" : /(?:2k|超清)/iu.test(prompt) ? "2K" : /(?:1k|高清)/iu.test(prompt) ? "1K" : /(?:512|标清|standard)/iu.test(prompt) ? "512" : ""
    } else if (field === "usage" || field === "ratio") {
      const usagePreset = inferUsagePresetFromPrompt(prompt)
      if (usagePreset) {
        const preset = USAGE_PRESET_DEFINITIONS[usagePreset]
        extracted.usage_preset = usagePreset
        extracted.usage_label = preset.zhLabel
        extracted.size_preset = preset.sizePreset
        extracted.ratio_confirmed = field === "ratio"
      }
    } else {
      extracted[field] = truncate(prompt, 160)
    }
    return normalizeBrief(extracted)
  }

  if (requestedFields.length <= 2 && segments.length >= requestedFields.length) {
    requestedFields.forEach((field, index) => {
      if (field === "goal" || field === "subject" || field === "style" || field === "composition") {
        extracted[field] = truncate(segments[index] || "", 160)
      }
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
    const match = /^([^:锛?]{2,24})\s*[:锛?]\s*(.+)$/i.exec(line)
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
      }
      continue
    }
    if (!extracted.orientation && /^(orientation|direction|方向)$/.test(label)) {
      extracted.orientation = /(?:横|landscape|wide)/iu.test(value) ? "landscape" : /(?:竖|portrait|tall)/iu.test(value) ? "portrait" : ""
      continue
    }
    if (!extracted.resolution && /^(resolution|quality|size|清晰度|大小)$/.test(label)) {
      extracted.resolution =
        /(?:4k|超高清)/iu.test(value) ? "4K" : /(?:2k|超清)/iu.test(value) ? "2K" : /(?:1k|高清)/iu.test(value) ? "1K" : /(?:512|标清|standard)/iu.test(value) ? "512" : ""
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

  const usagePreset = inferred.usage_preset || inferUsagePresetFromPrompt(prompt)
  if (usagePreset) {
    const preset = USAGE_PRESET_DEFINITIONS[usagePreset]
    inferred.usage_preset = usagePreset
    inferred.usage_label = inferred.usage_label || (looksLikeChinese(prompt) ? preset.zhLabel : preset.enLabel)
    inferred.size_preset = inferred.size_preset || preset.sizePreset
  }

  if (!inferred.orientation) {
    inferred.orientation = /(?:横版|横图|landscape|wide)/iu.test(prompt)
      ? "landscape"
      : /(?:竖版|竖图|portrait|tall)/iu.test(prompt)
        ? "portrait"
        : ""
  }

  if (!inferred.resolution) {
    inferred.resolution = /(?:4k|超高清)/iu.test(lower)
      ? "4K"
      : /(?:2k|超清)/iu.test(lower)
        ? "2K"
        : /(?:1k|高清)/iu.test(lower)
          ? "1K"
          : /(?:512|标清|standard)/iu.test(lower)
            ? "512"
            : ""
  }

  if (!inferred.goal && inferred.usage_label) {
    inferred.goal = inferred.usage_label
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

async function maybePlanWithTextModel(input: {
  prompt: string
  priorState: ImageAssistantOrchestrationState | null
  mergedBrief: ImageAssistantBrief
  missingFields: ImageAssistantBriefField[]
  taskType: ImageAssistantTaskType
  sizePreset: ImageAssistantSizePreset
  resolution: string
  referenceCount: number
}) {
  if (!hasWriterTextProvider()) return null

  const skill = getImageAssistantSkillDefinition("graphic-design-brief")
  const runtimeSystemPrompt = await getImageAssistantRuntimeSystemPrompt("graphic-design-brief", skill.system_prompt)
  const promptCompositionRules = await getImageAssistantPromptCompositionRules("graphic-design-brief")
  const systemPrompt = [
    runtimeSystemPrompt,
    promptCompositionRules.length ? `Follow-up rules: ${promptCompositionRules.join(" ")}` : null,
    "Return strict JSON only.",
    'Schema: {"brief":{"goal":"","subject":"","style":"","composition":"","constraints":""},"reply_to_user":"","generated_prompt":"","missing_fields":["goal","subject"],"ready_for_generation":false}.',
    "If the brief is not complete, generated_prompt must be an empty string.",
    "Keep reply_to_user concise and practical.",
  ]
    .filter(Boolean)
    .join(" ")

  const userPrompt = JSON.stringify({
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
  })

  try {
    const raw = await generateTextWithWriterModel(systemPrompt, userPrompt, IMAGE_ASSISTANT_TEXT_MODEL)
    const parsed = extractJsonObject(raw)
    if (!parsed || typeof parsed !== "object") return null

    const brief = mergeBrief(input.mergedBrief, parsed.brief as Partial<ImageAssistantBrief> | null | undefined)
    const missingFields = Array.isArray((parsed as any).missing_fields)
      ? (parsed as any).missing_fields.filter((field: unknown): field is ImageAssistantBriefField =>
          REQUIRED_BRIEF_FIELDS.includes(field as ImageAssistantBriefField),
        )
      : getMissingBriefFields(brief)

    return {
      brief,
      missingFields,
      readyForGeneration: Boolean((parsed as any).ready_for_generation) && missingFields.length === 0,
      replyToUser: normalizeText((parsed as any).reply_to_user),
      generatedPrompt: normalizeText((parsed as any).generated_prompt),
    }
  } catch (error) {
    console.warn("image-assistant.text-planner.failed", error)
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
      goal: isZh ? preset.zhLabel : preset.enLabel,
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

async function buildGenerationPrompt(input: {
  brief: ImageAssistantBrief
  taskType: ImageAssistantTaskType
  sizePreset: ImageAssistantSizePreset
  resolution: string
  referenceCount: number
  extraInstructions?: string | null
}) {
  const executionSkill = getImageAssistantSkillDefinition("canvas-design-execution")
  const runtimeSystemPrompt = await getImageAssistantRuntimeSystemPrompt(
    "canvas-design-execution",
    executionSkill.system_prompt,
  )
  const compositionRules = await getImageAssistantPromptCompositionRules("canvas-design-execution")
  const failureChecks = dedupeStrings([
    ...(await getImageAssistantFailureChecks("graphic-design-brief")),
    ...(await getImageAssistantFailureChecks("canvas-design-execution")),
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
  const inferred = inferBriefFromPrompt({
    prompt: input.prompt,
    taskType: input.taskType,
    sizePreset: input.sizePreset,
    referenceCount: input.referenceCount,
  })
  const contextual = inferBriefFromFollowUpAnswer({
    prompt: input.prompt,
    previousState: input.previousState,
  })
  const mergedBrief = mergeBrief(input.previousState?.brief, input.currentBrief, inferred, contextual)
  const initialMissingFields = getActionableBriefMissingFields(mergedBrief)
  const turnCount = Math.min((input.previousState?.turn_count || 0) + 1, IMAGE_ASSISTANT_MAX_BRIEF_TURNS)
  const hasGuidedGap = initialMissingFields.some((field) => GUIDED_BRIEF_FIELDS.has(field))
  const modelPlan = useEditShortcut || hasGuidedGap
    ? null
    : await maybePlanWithTextModel({
        prompt: input.prompt,
        priorState: input.previousState,
        mergedBrief,
        missingFields: initialMissingFields,
        taskType: input.taskType,
        sizePreset: input.sizePreset,
        resolution: input.resolution,
        referenceCount: input.referenceCount,
      })

  const brief = useEditShortcut
    ? applyReferenceEditDefaults(modelPlan?.brief || mergedBrief, input.prompt)
    : modelPlan?.brief || mergedBrief
  const missingFields = getActionableBriefMissingFields(brief)
  const promptQuestions = buildPromptQuestions({
    brief,
    missingFields,
    userPrompt: input.prompt,
  })
  const selectedSkill = await resolveSelectedSkillMetadata(
    selectImageAssistantSkill({ taskType: input.taskType, readyForGeneration: missingFields.length === 0 }),
  )
  const generatedPrompt =
    missingFields.length === 0
      ? (modelPlan?.generatedPrompt ||
          (await buildGenerationPrompt({
             brief,
             taskType: input.taskType,
             sizePreset: input.sizePreset,
            resolution: input.resolution,
             referenceCount: input.referenceCount,
             extraInstructions: input.extraInstructions,
           })))
      : null
  const replyToUser =
    modelPlan?.replyToUser ||
    buildClarificationReply({
      brief,
      missingFields,
      turnCount,
      maxTurns: IMAGE_ASSISTANT_MAX_BRIEF_TURNS,
      recommendedMode: input.taskType === "generate" ? "generate" : "edit",
      referenceCount: input.referenceCount,
      userPrompt: input.prompt,
      promptQuestions,
    })
  const plannerStrategy = useEditShortcut ? "rule_shortcut" : modelPlan ? "text_model" : "heuristic"

  const orchestration: ImageAssistantOrchestrationState = {
    brief,
    missing_fields: missingFields,
    turn_count: turnCount,
    max_turns: IMAGE_ASSISTANT_MAX_BRIEF_TURNS,
    ready_for_generation: Boolean(generatedPrompt) && missingFields.length === 0,
    planner_strategy: plannerStrategy,
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
    follow_up_question: missingFields.length ? replyToUser : null,
    prompt_questions: promptQuestions,
    generated_prompt: generatedPrompt,
  }

  return {
    orchestration,
    assistantReply: missingFields.length ? replyToUser : null,
  }
}

