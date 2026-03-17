import {
  getImageAssistantAgentMetadata,
  getImageAssistantFailureChecks,
  getImageAssistantPromptCompositionRules,
  getImageAssistantRuntimeSystemPrompt,
} from "@/lib/image-assistant/skill-documents"
import { generateTextWithAiberm, hasAibermApiKey } from "@/lib/writer/aiberm"
import { getImageAssistantSkillDefinition, IMAGE_ASSISTANT_MAX_BRIEF_TURNS, IMAGE_ASSISTANT_TEXT_MODEL, selectImageAssistantSkill } from "@/lib/image-assistant/skills"
import type {
  ImageAssistantBrief,
  ImageAssistantBriefField,
  ImageAssistantMessage,
  ImageAssistantOrchestrationState,
  ImageAssistantSizePreset,
  ImageAssistantTaskType,
  ImageAssistantToolTrace,
} from "@/lib/image-assistant/types"

const REQUIRED_BRIEF_FIELDS: ImageAssistantBriefField[] = ["goal", "subject", "style", "composition"]

const EMPTY_BRIEF: ImageAssistantBrief = {
  goal: "",
  subject: "",
  style: "",
  composition: "",
  constraints: "",
}

const FIELD_QUESTIONS_ZH: Record<ImageAssistantBriefField, string> = {
  goal: "这张图最终要用在哪里，目标是什么，比如封面、海报、广告主图还是活动 KV？",
  subject: "主体内容是什么，哪些人物、产品、场景或品牌元素必须保留？",
  style: "你想要什么风格和氛围，比如高级极简、电商质感、杂志感、电影感、节日促销？",
  composition: "构图怎么安排，焦点区域、留白、机位、标题区或角标区要放在哪里？",
}

const FIELD_QUESTIONS_EN: Record<ImageAssistantBriefField, string> = {
  goal: "What is the image for, such as a cover, poster, hero visual, product ad, or campaign KV?",
  subject: "What is the subject, and which people, products, scenes, or brand elements must stay?",
  style: "What style or mood do you want, such as minimal luxury, ecommerce polish, editorial, cinematic, or festive?",
  composition: "How should the composition work, including focal area, whitespace, camera angle, and text-safe zones?",
}

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeBrief(input?: Partial<ImageAssistantBrief> | null): ImageAssistantBrief {
  return {
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
      goal: normalized.goal || current.goal,
      subject: normalized.subject || current.subject,
      style: normalized.style || current.style,
      composition: normalized.composition || current.composition,
      constraints: normalized.constraints || current.constraints,
    }
  }, { ...EMPTY_BRIEF })
}

function getMissingBriefFields(brief: ImageAssistantBrief) {
  return REQUIRED_BRIEF_FIELDS.filter((field) => !normalizeText(brief[field]))
}

function looksLikeChinese(text: string) {
  return /[\u4e00-\u9fff]/.test(text)
}

function truncate(value: string, max = 180) {
  return value.length > max ? `${value.slice(0, max - 1).trim()}…` : value
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
    /(?:删除|删掉|去掉|去除|移除|擦掉|抹掉|消除|拿掉|修掉|修除|改成|换成|替换|保留|只修改|局部修改|局部编辑|去眼镜|摘掉|去瑕疵|磨皮|p掉)/.test(prompt) ||
    /\b(remove|delete|erase|retouch|edit out|clean up|replace|swap|change|fix|touch up|take off|keep)\b/i.test(prompt)
  )
}

function usesReferenceEditShortcutStable(input: {
  prompt: string
  taskType: ImageAssistantTaskType
  referenceCount: number
}) {
  if ((input.taskType !== "edit" && input.taskType !== "mask_edit") || input.referenceCount <= 0) {
    return false
  }

  const prompt = normalizeText(input.prompt)
  if (!prompt) return false

  const zhEditActionPattern =
    /(?:\u5220\u9664|\u5220\u6389|\u53bb\u6389|\u53bb\u9664|\u79fb\u9664|\u64e6\u6389|\u62b9\u6389|\u6d88\u9664|\u62ff\u6389|\u4fee\u6389|\u4fee\u9664|\u6539\u6210|\u6539\u4e3a|\u53d8\u6210|\u53d8\u4e3a|\u6362\u6210|\u6362\u4e3a|\u66ff\u6362|\u4fdd\u7559|\u53ea\u4fee\u6539|\u5c40\u90e8\u4fee\u6539|\u5c40\u90e8\u7f16\u8f91|\u53bb\u773c\u955c|\u6458\u6389|\u53bb\u6c34\u5370|\u53bb\u7455\u75b5|\u78e8\u76ae|\u4fee\u56fe|\u7cbe\u4fee|\u6362\u989c\u8272|\u6539\u989c\u8272|\u6539\u8272|\u53d8\u7ea2|\u53d8\u84dd|\u53d8\u7eff|\u8c03\u6210|\u8c03\u4e3a)/u
  const zhEditSentencePattern =
    /(?:\u628a|\u5c06).{0,24}(?:\u6539\u6210|\u6539\u4e3a|\u6362\u6210|\u6362\u4e3a|\u53d8\u6210|\u53d8\u4e3a|\u66ff\u6362\u4e3a|\u5220\u9664|\u53bb\u6389|\u53bb\u9664|\u79fb\u9664|\u4fdd\u7559).{0,40}/u
  const enEditActionPattern =
    /\b(remove|delete|erase|retouch|edit out|clean up|replace|swap|change|fix|touch up|take off|keep|turn|make)\b/i

  return (
    zhEditActionPattern.test(prompt) ||
    zhEditSentencePattern.test(prompt) ||
    enEditActionPattern.test(prompt)
  )
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
  return usesReferenceEditShortcutStable(input)
}

function extractBriefFromLabeledLines(prompt: string) {
  const extracted: Partial<ImageAssistantBrief> = {}
  const lines = prompt
    .split(/\r?\n/)
    .map((line) => normalizeText(line))
    .filter(Boolean)

  for (const line of lines) {
    const match = /^([^:：-]{2,24})\s*[:：-]\s*(.+)$/i.exec(line)
    if (!match) continue

    const label = match[1].trim().toLowerCase()
    const value = truncate(match[2].trim(), 180)
    if (!value) continue

    if (!extracted.goal && /^(goal|objective|usage|use case|用途|目标)$/.test(label)) {
      extracted.goal = value
      continue
    }
    if (!extracted.subject && /^(subject|main subject|主体|内容)$/.test(label)) {
      extracted.subject = value
      continue
    }
    if (!extracted.style && /^(style|mood|look|风格|氛围)$/.test(label)) {
      extracted.style = value
      continue
    }
    if (!extracted.composition && /^(composition|layout|framing|构图|版式|镜头)$/.test(label)) {
      extracted.composition = value
      continue
    }
    if (!extracted.constraints && /^(constraints|must keep|preserve|限制|约束|保留)$/.test(label)) {
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
    inferred.goal || inferred.subject || inferred.style || inferred.composition || inferred.constraints,
  )

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
  if (!hasAibermApiKey()) return null

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
    const raw = await generateTextWithAiberm(systemPrompt, userPrompt, IMAGE_ASSISTANT_TEXT_MODEL)
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

function buildClarificationReply(input: {
  brief: ImageAssistantBrief
  missingFields: ImageAssistantBriefField[]
  turnCount: number
  maxTurns: number
  recommendedMode: "generate" | "edit"
  referenceCount: number
  userPrompt: string
}) {
  const isZh = looksLikeChinese(`${input.userPrompt} ${input.brief.goal} ${input.brief.subject} ${input.brief.style}`)
  const questions = isZh ? FIELD_QUESTIONS_ZH : FIELD_QUESTIONS_EN
  const filled = REQUIRED_BRIEF_FIELDS.filter((field) => normalizeText(input.brief[field])).length

  if (input.turnCount >= input.maxTurns) {
    return isZh
      ? `我已经完成第 ${input.turnCount}/${input.maxTurns} 轮需求收集，但还缺少这些关键信息：${input.missingFields.map((field) => FIELD_QUESTIONS_ZH[field]).join("；")}。补齐后我再开始${input.recommendedMode === "generate" ? "生图" : "改图"}。`
      : `This is turn ${input.turnCount}/${input.maxTurns}. I still need these details before I can ${input.recommendedMode === "generate" ? "generate" : "edit"} the image: ${input.missingFields.map((field) => FIELD_QUESTIONS_EN[field]).join("; ")}.`
  }

  const intro = isZh
    ? `已收到当前设计信息，必填项已收集 ${filled}/${REQUIRED_BRIEF_FIELDS.length}。`
    : `I have the current design brief progress: ${filled}/${REQUIRED_BRIEF_FIELDS.length} required items collected.`
  const referenceLine =
    input.referenceCount > 0
      ? isZh
        ? `当前已关联 ${input.referenceCount} 张参考图，我会按带图${input.recommendedMode === "edit" ? "编辑" : "生成"}来理解。`
        : `${input.referenceCount} reference image(s) are attached, so I will treat this as an image-guided ${input.recommendedMode}.`
      : isZh
        ? "当前没有参考图，我会按文生图来理解。"
        : "There are no reference images attached, so I will treat this as a text-to-image request."
  const askLine = isZh
    ? `为了继续，请补充：${input.missingFields.map((field) => questions[field]).join(" ")}`
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
  const lines = [
    `Execution mindset: ${runtimeSystemPrompt}`,
    input.taskType === "generate"
      ? "Create a production-ready image based on this approved design brief."
      : "Edit the provided reference image(s) according to this approved design brief.",
    `Design objective: ${input.brief.goal}`,
    `Subject and must-have elements: ${input.brief.subject}`,
    `Style and mood: ${input.brief.style}`,
    `Composition and layout: ${input.brief.composition}`,
    input.brief.constraints ? `Constraints and must-keep details: ${input.brief.constraints}` : null,
    input.referenceCount > 0
      ? `Reference handling: ${input.taskType === "generate" ? "use the uploaded images as guidance while preserving key identity cues." : "preserve the recognizable identity and only change what the brief requires."}`
      : "Reference handling: there are no image references; rely only on the written brief.",
    compositionRules.length ? `Execution rules: ${compositionRules.join(" ")}` : null,
    failureChecks.length ? `Failure checks: ${failureChecks.join(" ")}` : null,
    `Output requirement: ${input.sizePreset} composition, ${input.resolution} resolution target, clean focal hierarchy, production-safe framing.`,
    input.extraInstructions ? input.extraInstructions : null,
  ]

  if (input.taskType === "mask_edit") {
    lines.push("Editing requirement: keep untouched areas as stable as possible and focus the changes on the requested region.")
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
  const collectedCount = REQUIRED_BRIEF_FIELDS.filter((field) => normalizeText(input.brief[field])).length
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
  const mergedBrief = mergeBrief(input.previousState?.brief, input.currentBrief, inferred)
  const initialMissingFields = getMissingBriefFields(mergedBrief)
  const turnCount = Math.min((input.previousState?.turn_count || 0) + 1, IMAGE_ASSISTANT_MAX_BRIEF_TURNS)
  const modelPlan = useEditShortcut
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
  const missingFields = getMissingBriefFields(brief)
  const readyForGeneration =
    missingFields.length === 0 && (useEditShortcut ? true : modelPlan ? modelPlan.readyForGeneration : true)
  const selectedSkill = await resolveSelectedSkillMetadata(
    selectImageAssistantSkill({ taskType: input.taskType, readyForGeneration }),
  )
  const generatedPrompt =
    readyForGeneration
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
    generated_prompt: generatedPrompt,
  }

  return {
    orchestration,
    assistantReply: missingFields.length ? replyToUser : null,
  }
}
