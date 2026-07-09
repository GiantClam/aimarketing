import fs from "node:fs"
import path from "node:path"

import {
  pptFrontendTemplateOptions,
  type PptPreviewRequest,
  type PptPreviewStyleKey,
  type PptRecommendedTemplateSummary,
} from "@/lib/lead-tools/ppt-preview-data-fixed"

type PptMasterLayoutsIndex = {
  categories?: Record<string, { label?: string; layouts?: string[] }>
  quickLookup?: Record<string, string[]>
  layouts?: Record<
    string,
    {
      label?: string
      summary?: string
      tone?: string
      themeMode?: string
      keywords?: string[]
    }
  >
}

type PptMasterLayoutMetadata = {
  id: string
  label: string
  summary: string
  tone: string
  themeMode: string
  keywords: string[]
  categories: string[]
  quickLookup: string[]
}

const pptFrontendTemplateIdSet = new Set<string>(pptFrontendTemplateOptions.map((option) => option.id))
const PPT_MASTER_LAYOUTS_INDEX_RELATIVE_PATH = path.join(
  "skills",
  "ppt-master",
  "templates",
  "layouts",
  "layouts_index.json",
)

let cachedPptMasterLayoutsIndex: PptMasterLayoutsIndex | null = null

function getPptMasterRepoCandidates() {
  const projectCacheCandidate = path.resolve(process.cwd(), ".cache", "ppt-master-upstream")
  const siblingVendorCandidate = path.resolve(process.cwd(), "..", "autoviralvid", "vendor", "minimax-skills")

  return [process.env.PPT_MASTER_REPO_DIR, projectCacheCandidate, siblingVendorCandidate].filter(
    (value): value is string => Boolean(value?.trim()),
  )
}

function loadPptMasterLayoutsIndex() {
  if (cachedPptMasterLayoutsIndex) {
    return cachedPptMasterLayoutsIndex
  }

  let bestMatch: PptMasterLayoutsIndex | null = null
  let bestScore = -1

  for (const candidate of getPptMasterRepoCandidates()) {
    const layoutsIndexPath = path.join(candidate, PPT_MASTER_LAYOUTS_INDEX_RELATIVE_PATH)
    try {
      const raw = fs.readFileSync(layoutsIndexPath, "utf8")
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const normalized =
        parsed.layouts && typeof parsed.layouts === "object"
          ? (parsed as PptMasterLayoutsIndex)
          : {
              categories: {},
              quickLookup: {},
              layouts: parsed as NonNullable<PptMasterLayoutsIndex["layouts"]>,
            }
      const layoutsCount = Object.keys(normalized.layouts ?? {}).length
      const richnessScore =
        layoutsCount +
        (Object.keys(normalized.categories ?? {}).length > 0 ? 100 : 0) +
        (Object.keys(normalized.quickLookup ?? {}).length > 0 ? 100 : 0)

      if (richnessScore > bestScore) {
        bestMatch = normalized
        bestScore = richnessScore
      }
    } catch {
      continue
    }
  }

  if (bestMatch) {
    cachedPptMasterLayoutsIndex = bestMatch
    return cachedPptMasterLayoutsIndex
  }

  cachedPptMasterLayoutsIndex = {
    categories: {},
    quickLookup: {},
    layouts: {},
  }
  return cachedPptMasterLayoutsIndex
}

function buildPptMasterLayoutMetadataList() {
  const index = loadPptMasterLayoutsIndex()
  const layouts = index.layouts ?? {}
  const categoryMap = new Map<string, string[]>()
  const quickLookupMap = new Map<string, string[]>()

  for (const [categoryId, category] of Object.entries(index.categories ?? {})) {
    for (const templateId of category.layouts ?? []) {
      categoryMap.set(templateId, [...(categoryMap.get(templateId) ?? []), categoryId])
    }
  }

  for (const [bucketId, templateIds] of Object.entries(index.quickLookup ?? {})) {
    for (const templateId of templateIds ?? []) {
      quickLookupMap.set(templateId, [...(quickLookupMap.get(templateId) ?? []), bucketId])
    }
  }

  return Object.entries(layouts).map(([id, layout]) => ({
    id,
    label: layout.label?.trim() || id,
    summary: layout.summary?.trim() || "",
    tone: layout.tone?.trim() || "",
    themeMode: layout.themeMode?.trim() || "",
    keywords: Array.isArray(layout.keywords) ? layout.keywords.map((item) => item.trim()).filter(Boolean) : [],
    categories: categoryMap.get(id) ?? [],
    quickLookup: quickLookupMap.get(id) ?? [],
  }))
}

function normalizeText(value: string) {
  return value.trim().toLowerCase()
}

function buildGenericSemanticExpansions(text: string) {
  const expansions = new Set<string>()
  const addIfMatched = (pattern: RegExp, values: string[]) => {
    if (pattern.test(text)) {
      for (const value of values) {
        expansions.add(value)
      }
    }
  }

  addIfMatched(/科技公司|科技企业|tech company|tech enterprise/iu, ["tech company", "tech enterprise", "technology"])
  addIfMatched(/企业介绍|公司介绍|company profile|company introduction/iu, ["company profile", "company introduction", "corporate profile"])
  addIfMatched(/业务介绍|business overview|business introduction/iu, ["business overview", "business introduction"])
  addIfMatched(/解决方案|方案|solution|proposal/iu, ["solution", "solution proposal", "business solution"])
  addIfMatched(/产品能力|能力展示|product capability/iu, ["product capability", "capability showcase"])
  addIfMatched(/工作台|平台|workspace|platform/iu, ["workspace", "platform", "product platform"])
  addIfMatched(/企业\\s*ai|enterprise ai|ai business/iu, ["enterprise ai", "ai platform", "technology"])
  addIfMatched(/专业|professional|商务/iu, ["professional", "business"])
  addIfMatched(/活力|有活力|vibrant|energetic/iu, ["vibrant", "energetic"])
  addIfMatched(/董事会|board/iu, ["board", "executive presentation"])
  addIfMatched(/管理层|高层|executive/iu, ["executive presentation", "strategic report"])
  addIfMatched(/经营复盘|复盘|review/iu, ["review", "strategic report"])
  addIfMatched(/预算|finance/iu, ["finance", "budget"])
  addIfMatched(/风险|risk/iu, ["risk"])
  addIfMatched(/关键决策|决策|decision/iu, ["decision", "conclusion-first"])

  return [...expansions]
}

function collectPptTemplateMatchText(request: PptPreviewRequest) {
  const segments = [request.prompt]

  if (typeof request.researchBrief === "string") {
    segments.push(request.researchBrief)
  } else if (request.researchBrief && typeof request.researchBrief === "object") {
    const research = request.researchBrief
    segments.push(research.topic)
    segments.push(...(research.keyFacts || []))
    segments.push(...(research.numericEvidence || []))
    segments.push(...(research.risks || []))
    segments.push(...(research.implications || []))
    segments.push(...(research.sourceNotes || []))
    if (research.rawSummary) {
      segments.push(research.rawSummary)
    }
  }

  const rawText = segments.filter(Boolean).join("\n")
  const expansions = buildGenericSemanticExpansions(rawText)
  return normalizeText([rawText, ...expansions].join("\n"))
}

function buildGenericPromptHints(text: string) {
  const hints = new Set<string>()

  const addIfMatched = (patterns: RegExp[], values: string[]) => {
    if (patterns.some((pattern) => pattern.test(text))) {
      for (const value of values) {
        hints.add(value)
      }
    }
  }

  addIfMatched([/董事会|管理层|高层|经营|复盘|决策|board|executive|leadership|review/iu], ["board", "strategy"])
  addIfMatched([/科技|技术|ai|agent|平台|工作台|智能体|developer|technology|tech|llm|system/iu], ["technology"])
  addIfMatched([/公司介绍|企业介绍|业务介绍|方案|解决方案|提案|business|company profile|solution|proposal|corporate/iu], ["general_business"])
  addIfMatched([/咨询|投资|融资|估值|分析|strategy|consulting|investment|finance|capital/iu], ["strategy", "finance"])
  addIfMatched([/学术|答辩|论文|研究|academic|defense|research|thesis/iu], ["academic"])
  addIfMatched([/医疗|医院|医学院|medical|hospital|clinical/iu], ["medical"])
  addIfMatched([/心理|咨询|疗愈|psychology|counseling|healing/iu], ["psychology"])
  addIfMatched([/政府|政务|党建|government|smart city|digitalization/iu], ["government"])
  addIfMatched([/创意|像素|复古|gaming|pixel|retro|cyberpunk/iu], ["creative"])
  addIfMatched([/电建|能源|工程|powerchina|energy|engineering/iu], ["energy"])
  addIfMatched([/中汽研|认证|测试|catarc|certification|testing/iu], ["certification"])

  return [...hints]
}

function buildScenarioQuickLookupHints(request: PptPreviewRequest) {
  if (request.scenario === "product-launch") {
    return ["technology", "general_business", "strategy"]
  }

  if (request.scenario === "sales-deck") {
    return ["general_business", "board", "strategy", "technology"]
  }

  if (request.scenario === "training") {
    return ["academic", "technology", "general_business"]
  }

  return ["creative", "general_business", "technology"]
}

function countTextMatches(text: string, candidates: readonly string[]) {
  let matches = 0
  for (const candidate of candidates) {
    const normalized = normalizeText(candidate)
    if (normalized && text.includes(normalized)) {
      matches += 1
    }
  }
  return matches
}

function resolveStyleKeyForPptMasterTemplate(templateId: string, quickLookup: string[]): PptPreviewStyleKey {
  if (templateId === "smart_red") return "ppt169_general_dark_tech_claude_code_auto_mode"
  if (templateId === "anthropic") return "ppt169_building_effective_agents"
  if (templateId === "academic_defense") return "ppt169_attention_is_all_you_need"
  if (templateId === "重庆大学") return "ppt169_attention_is_all_you_need"
  if (templateId === "medical_university") return "ppt169_swiss_grid_systems"
  if (templateId === "psychology_attachment") return "ppt169_sugar_rush_memphis"
  if (templateId === "pixel_retro") return "ppt169_sugar_rush_memphis"
  if (templateId === "government_red") return "ppt169_pritzker_2026"
  if (templateId === "government_blue") return "ppt169_brutalist_ai_newspaper_2026"
  if (templateId === "ai_ops") return "ppt169_building_effective_agents"
  if (quickLookup.includes("academic")) return "ppt169_attention_is_all_you_need"
  if (quickLookup.includes("technology")) return "ppt169_building_effective_agents"
  if (quickLookup.includes("board") || quickLookup.includes("finance")) return "ppt169_global_ai_capital_2026"
  if (quickLookup.includes("creative") || quickLookup.includes("psychology")) return "ppt169_sugar_rush_memphis"
  return "ppt169_swiss_grid_systems"
}

function scorePptMasterLayout(
  request: PptPreviewRequest,
  template: PptMasterLayoutMetadata,
  text: string,
  quickLookupRanks: Map<string, number>,
) {
  const metadataSegments = [
    template.id,
    template.label,
    template.summary,
    template.tone,
    template.themeMode,
    ...template.keywords,
  ]
  const metadataMatches = countTextMatches(text, metadataSegments)
  const explicitQuickLookupMatches = template.quickLookup.filter((bucket) => quickLookupRanks.has(bucket))
  const quickLookupBoost = explicitQuickLookupMatches.reduce((sum, bucket) => {
    const rank = quickLookupRanks.get(bucket) ?? 99
    return sum + Math.max(0, 14 - rank * 3)
  }, 0)
  const categoryBoost = template.categories.reduce((sum, category) => {
    if (request.scenario === "sales-deck" && (category === "general" || category === "brand")) return sum + 4
    if (request.scenario === "product-launch" && (category === "general" || category === "brand")) return sum + 4
    if (request.scenario === "training" && category === "scenario") return sum + 4
    if (request.scenario === "marketing-campaign" && category === "special") return sum + 3
    return sum
  }, 0)

  return metadataMatches * 8 + quickLookupBoost + categoryBoost
}

export function getPptWorkerSupportedTemplateIds() {
  const pptMasterTemplateIds = buildPptMasterLayoutMetadataList().map((item) => item.id)
  return Array.from(new Set([...pptFrontendTemplateIdSet, ...pptMasterTemplateIds]))
}

export function isPptWorkerTemplateSupported(templateId: unknown) {
  return typeof templateId === "string" && getPptWorkerSupportedTemplateIds().includes(templateId.trim())
}

export function getPptMasterLibraryTemplateIds() {
  return buildPptMasterLayoutMetadataList().map((item) => item.id)
}

export function isPptMasterLibraryTemplateSupported(templateId: unknown) {
  return typeof templateId === "string" && getPptMasterLibraryTemplateIds().includes(templateId.trim())
}

export function buildPptMasterRecommendedTemplateSummaries(
  request: PptPreviewRequest,
  options?: {
    allowedTemplateIds?: readonly string[]
  },
): PptRecommendedTemplateSummary[] {
  const text = collectPptTemplateMatchText(request)
  const allowedTemplateIds = options?.allowedTemplateIds?.length ? new Set(options.allowedTemplateIds) : null
  const quickLookupHints = [...buildGenericPromptHints(text), ...buildScenarioQuickLookupHints(request)]
  const quickLookupRanks = new Map<string, number>()

  for (const bucket of quickLookupHints) {
    if (!quickLookupRanks.has(bucket)) {
      quickLookupRanks.set(bucket, quickLookupRanks.size)
    }
  }

  const ranked = buildPptMasterLayoutMetadataList()
    .filter((item) => !allowedTemplateIds || allowedTemplateIds.has(item.id))
    .map((item, index) => ({
      item,
      index,
      score: scorePptMasterLayout(request, item, text, quickLookupRanks),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      return left.index - right.index
    })

  return ranked.slice(0, 4).map(({ item }, index) => ({
    rank: index + 1,
    templateId: item.id,
    templateLabel: item.label,
    styleKey: resolveStyleKeyForPptMasterTemplate(item.id, item.quickLookup),
    styleName: item.label,
    summary: [item.summary, item.tone ? `Tone: ${item.tone}` : ""].filter(Boolean).join(" "),
  }))
}
