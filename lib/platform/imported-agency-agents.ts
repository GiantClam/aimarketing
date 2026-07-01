import "server-only"

import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import type {
  BusinessAgentArtifactKind,
  LocalizedBusinessAgentConfig,
} from "@/lib/platform/business-agents"
import type { AppLocale } from "@/lib/i18n/config"
import { buildDashboardBusinessHref } from "@/lib/platform/workspace-business"

type LocalizedText = {
  zh: string
  en: string
}

type ImportedAgencyAgentDefinition = {
  agentId: string
  businessSlug: string
  sourceCategory: string
  sourcePath: string
  name: LocalizedText
  description: string
  vibe: string
  emoji: string
  color: string
}

type CategoryBlueprint = {
  artifactKinds: BusinessAgentArtifactKind[]
  workflowSlugs: string[]
  systemPromptSummary: LocalizedText
}

export type ImportedAgencyAgentPlatformCard = LocalizedBusinessAgentConfig & {
  source: "agency-agents"
  sourceCategory: string
  sourceCategoryLabel: string
  sourcePath: string
  sourceRepository: string
  nativeHref: string
  proofPoints: string[]
  emoji: string
  color: string
  vibe: string
}

const AGENCY_AGENT_SOURCE_REPOSITORY = "https://github.com/msitarzewski/agency-agents"
const IMPORTED_AGENT_BASE_DIR = path.join(process.cwd(), "content", "skills", "agency-agents")

const SOURCE_CATEGORY_LABELS: Record<string, LocalizedText> = {
  academic: { zh: "学术研究", en: "Academic" },
  design: { zh: "设计", en: "Design" },
  engineering: { zh: "工程开发", en: "Engineering" },
  finance: { zh: "财务", en: "Finance" },
  "game-development": { zh: "游戏开发", en: "Game Development" },
  gis: { zh: "地理空间", en: "GIS" },
  marketing: { zh: "营销", en: "Marketing" },
  "paid-media": { zh: "付费投放", en: "Paid Media" },
  product: { zh: "产品", en: "Product" },
  "project-management": { zh: "项目管理", en: "Project Management" },
  sales: { zh: "销售", en: "Sales" },
  security: { zh: "安全", en: "Security" },
  "spatial-computing": { zh: "空间计算", en: "Spatial Computing" },
  specialized: { zh: "专项顾问", en: "Specialized" },
  support: { zh: "支持运营", en: "Support" },
  testing: { zh: "测试与 QA", en: "Testing" },
}

const CATEGORY_BLUEPRINTS: Record<string, CategoryBlueprint> = {
  academic: {
    workflowSlugs: ["content-repurpose"],
    artifactKinds: ["brief", "report", "knowledge_note"],
    systemPromptSummary: {
      zh: "优先把复杂主题整理成研究问题、证据框架、论点结构和可复用结论。",
      en: "Prioritize research questions, evidence framing, argument structure, and reusable conclusions.",
    },
  },
  design: {
    workflowSlugs: ["visual-ad-pipeline", "campaign-launch"],
    artifactKinds: ["brief", "asset", "copy", "report"],
    systemPromptSummary: {
      zh: "优先输出视觉方向、结构建议、设计约束和可执行的创意动作。",
      en: "Prioritize visual direction, structure, design constraints, and executable creative moves.",
    },
  },
  engineering: {
    workflowSlugs: ["content-repurpose"],
    artifactKinds: ["plan", "report", "knowledge_note"],
    systemPromptSummary: {
      zh: "优先给出架构、实现边界、排查路径和技术决策建议。",
      en: "Prioritize architecture, implementation boundaries, debugging paths, and technical decisions.",
    },
  },
  finance: {
    workflowSlugs: ["content-repurpose"],
    artifactKinds: ["plan", "report", "brief"],
    systemPromptSummary: {
      zh: "优先输出财务判断、预算取舍、风险点和经营动作建议。",
      en: "Prioritize financial judgment, budget tradeoffs, risk points, and operating recommendations.",
    },
  },
  "game-development": {
    workflowSlugs: ["visual-ad-pipeline"],
    artifactKinds: ["brief", "asset", "plan"],
    systemPromptSummary: {
      zh: "优先把概念、玩法、内容和制作动作收敛成可执行方案。",
      en: "Prioritize turning concepts, systems, and production ideas into executable plans.",
    },
  },
  gis: {
    workflowSlugs: ["content-repurpose"],
    artifactKinds: ["brief", "report", "knowledge_note"],
    systemPromptSummary: {
      zh: "优先输出空间分析思路、数据结构、地图表达和执行步骤。",
      en: "Prioritize spatial analysis framing, data structure, map communication, and execution steps.",
    },
  },
  marketing: {
    workflowSlugs: ["content-repurpose", "campaign-launch"],
    artifactKinds: ["brief", "copy", "report", "workflow_result"],
    systemPromptSummary: {
      zh: "优先输出内容策略、分发动作、增长实验和转化建议。",
      en: "Prioritize content strategy, distribution moves, growth experiments, and conversion advice.",
    },
  },
  "paid-media": {
    workflowSlugs: ["campaign-launch"],
    artifactKinds: ["brief", "plan", "copy", "report"],
    systemPromptSummary: {
      zh: "优先输出账户结构、创意测试、投放优化和归因建议。",
      en: "Prioritize account structure, creative testing, optimization, and attribution guidance.",
    },
  },
  product: {
    workflowSlugs: ["content-repurpose"],
    artifactKinds: ["brief", "plan", "report", "knowledge_note"],
    systemPromptSummary: {
      zh: "优先输出产品判断、优先级、用户问题和推进路径。",
      en: "Prioritize product judgment, priorities, user problems, and delivery paths.",
    },
  },
  "project-management": {
    workflowSlugs: ["content-repurpose"],
    artifactKinds: ["plan", "report", "brief"],
    systemPromptSummary: {
      zh: "优先组织里程碑、责任分工、协作依赖和执行节奏。",
      en: "Prioritize milestones, ownership, dependencies, and execution cadence.",
    },
  },
  sales: {
    workflowSlugs: ["content-repurpose"],
    artifactKinds: ["brief", "copy", "plan", "report"],
    systemPromptSummary: {
      zh: "优先输出机会判断、推进动作、赢单策略和跟进建议。",
      en: "Prioritize opportunity diagnosis, advancement actions, win strategy, and follow-up guidance.",
    },
  },
  security: {
    workflowSlugs: ["campaign-launch"],
    artifactKinds: ["report", "plan", "knowledge_note"],
    systemPromptSummary: {
      zh: "优先识别漏洞、控制缺口、审计证据和升级动作。",
      en: "Prioritize vulnerabilities, control gaps, audit evidence, and escalation steps.",
    },
  },
  "spatial-computing": {
    workflowSlugs: ["visual-ad-pipeline"],
    artifactKinds: ["brief", "plan", "asset"],
    systemPromptSummary: {
      zh: "优先输出空间交互、实现约束、原型方向和技术路线。",
      en: "Prioritize spatial interaction, implementation constraints, prototype direction, and technical approach.",
    },
  },
  specialized: {
    workflowSlugs: ["content-repurpose"],
    artifactKinds: ["brief", "plan", "report", "knowledge_note"],
    systemPromptSummary: {
      zh: "优先把专业问题收敛成事实、判断、边界和下一步动作。",
      en: "Prioritize facts, judgment, constraints, and next actions for specialized domains.",
    },
  },
  support: {
    workflowSlugs: ["content-repurpose"],
    artifactKinds: ["report", "brief", "knowledge_note"],
    systemPromptSummary: {
      zh: "优先输出摘要、运营洞察、支持动作和信息分发建议。",
      en: "Prioritize summaries, operating insight, support moves, and distribution guidance.",
    },
  },
  testing: {
    workflowSlugs: ["content-repurpose"],
    artifactKinds: ["report", "plan", "knowledge_note"],
    systemPromptSummary: {
      zh: "优先给出验证路径、风险判断、证据记录和修复建议。",
      en: "Prioritize validation paths, risk judgment, evidence capture, and remediation guidance.",
    },
  },
}

const EXCLUDED_SOURCE_CATEGORIES = new Set(["game-development"])

const COMPATIBLE_SOURCE_CATEGORIES = Object.keys(CATEGORY_BLUEPRINTS)
  .filter((category) => !EXCLUDED_SOURCE_CATEGORIES.has(category))
  .sort()

function localizeText(locale: AppLocale, text: LocalizedText) {
  return locale === "zh" ? text.zh : text.en
}

function getSourceCategoryLabel(locale: AppLocale, sourceCategory: string) {
  return localizeText(locale, SOURCE_CATEGORY_LABELS[sourceCategory] || { zh: sourceCategory, en: sourceCategory })
}

function parseFrontmatter(content: string) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match) return {}

  const result: Record<string, string> = {}
  for (const line of match[1].split(/\r?\n/)) {
    const separatorIndex = line.indexOf(":")
    if (separatorIndex === -1) continue
    const key = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "")
    if (key) result[key] = value
  }
  return result
}

function startCaseFromSlug(value: string) {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function buildImportedAgentId(sourceCategory: string, sourceFilePath: string) {
  const fileSlug = sourceFilePath
    .replace(/\.md$/i, "")
    .replace(/[\\/]+/g, "-")
  return fileSlug.startsWith(`${sourceCategory}-`)
    ? `agency-${fileSlug}`
    : `agency-${sourceCategory}-${fileSlug}`
}

function listMarkdownFilesRecursive(dirPath: string) {
  const markdownFiles: string[] = []

  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const nextPath = path.join(dirPath, entry.name)
    if (entry.isDirectory()) {
      markdownFiles.push(...listMarkdownFilesRecursive(nextPath))
      continue
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      markdownFiles.push(nextPath)
    }
  }

  return markdownFiles.sort()
}

function buildCategorySamplePrompts(locale: AppLocale, categoryLabel: string, agentName: string) {
  if (locale === "zh") {
    return [
      `请以「${agentName}」的角色，先判断这个问题最该从哪些事实和约束入手。`,
      `围绕当前目标，给我一版更像 ${categoryLabel} 专家会输出的分析与行动建议。`,
      `把这份材料改造成 ${categoryLabel} 场景下可直接执行的方案、清单或摘要。`,
    ]
  }

  return [
    `Act as "${agentName}" and start by identifying the key facts, constraints, and decision points in this problem.`,
    `Given the current goal, produce the kind of analysis and next-step plan a ${categoryLabel} specialist would actually use.`,
    `Turn this material into an execution-ready brief, checklist, or summary for a ${categoryLabel} workflow.`,
  ]
}

const ZH_AGENT_NAME_PHRASES: Array<[string, string]> = [
  ["Brand Strategy", "品牌策略"],
  ["Growth Marketing", "增长营销"],
  ["Paid Media", "付费投放"],
  ["Project Management", "项目管理"],
  ["Game Development", "游戏开发"],
  ["Spatial Computing", "空间计算"],
  ["Video Creative", "视频创意"],
  ["Content Growth", "内容增长"],
  ["Lead Conversion", "获客转化"],
  ["Outreach Conversion", "外联转化"],
  ["Sales Close", "销售成交"],
  ["Objection Handling", "异议处理"],
  ["Enterprise Operations", "企业运营"],
  ["Product Marketing", "产品营销"],
  ["Marketing Strategy", "营销策略"],
  ["Customer Support", "客户支持"],
  ["Quality Assurance", "质量保障"],
]

const ZH_AGENT_NAME_TOKENS: Array<[RegExp, string]> = [
  [/\bAgent\b/gi, "智能体"],
  [/\bStrategist\b/gi, "策略师"],
  [/\bSpecialist\b/gi, "专家"],
  [/\bResearcher\b/gi, "研究员"],
  [/\bReviewer\b/gi, "评审"],
  [/\bWriter\b/gi, "写作顾问"],
  [/\bMarketing\b/gi, "营销"],
  [/\bStrategy\b/gi, "策略"],
  [/\bGrowth\b/gi, "增长"],
  [/\bBrand\b/gi, "品牌"],
  [/\bContent\b/gi, "内容"],
  [/\bVideo\b/gi, "视频"],
  [/\bCreative\b/gi, "创意"],
  [/\bSales\b/gi, "销售"],
  [/\bProduct\b/gi, "产品"],
  [/\bDesign\b/gi, "设计"],
  [/\bEngineering\b/gi, "工程"],
  [/\bFinance\b/gi, "财务"],
  [/\bResearch\b/gi, "研究"],
  [/\bAnalyst\b/gi, "分析师"],
  [/\bPlanner\b/gi, "规划师"],
  [/\bManager\b/gi, "经理"],
  [/\bConsultant\b/gi, "顾问"],
  [/\bAdvisor\b/gi, "顾问"],
  [/\bArchitect\b/gi, "架构师"],
  [/\bDeveloper\b/gi, "开发者"],
  [/\bDesigner\b/gi, "设计师"],
  [/\bEngineer\b/gi, "工程师"],
  [/\bGuardian\b/gi, "守护者"],
  [/\bStoryteller\b/gi, "叙事师"],
  [/\bOptimizer\b/gi, "优化师"],
  [/\bBuilder\b/gi, "构建师"],
  [/\bCoach\b/gi, "教练"],
  [/\bAuditor\b/gi, "审计师"],
  [/\bCreator\b/gi, "创作者"],
  [/\bArtist\b/gi, "艺术家"],
  [/\bOperator\b/gi, "运营专家"],
  [/\bOfficer\b/gi, "专员"],
  [/\bPsychologist\b/gi, "心理学家"],
  [/\bScripter\b/gi, "脚本工程师"],
  [/\bSteward\b/gi, "管理员"],
  [/\bResponder\b/gi, "响应负责人"],
  [/\bTester\b/gi, "测试员"],
  [/\bNavigator\b/gi, "导航顾问"],
  [/\bChecker\b/gi, "检查员"],
  [/\bCommander\b/gi, "指挥官"],
  [/\bMaster\b/gi, "专家"],
  [/\bWalkthrough\b/gi, "走查"],
  [/\bWhimsy\b/gi, "趣味"],
  [/\bInclusive\b/gi, "包容性"],
  [/\bVisual\b/gi, "视觉"],
  [/\bVisuals\b/gi, "视觉"],
  [/\bPrompt\b/gi, "提示词"],
  [/\bFrontend\b/gi, "前端"],
  [/\bBackend\b/gi, "后端"],
  [/\bTechnical\b/gi, "技术"],
  [/\bFinancial\b/gi, "财务"],
  [/\bInvestment\b/gi, "投资"],
  [/\bTracking\b/gi, "追踪"],
  [/\bMeasurement\b/gi, "衡量"],
  [/\bPaid Social\b/gi, "付费社媒"],
  [/\bProgrammatic\b/gi, "程序化"],
  [/\bSocial\b/gi, "社媒"],
  [/\bEmail\b/gi, "邮件"],
  [/\bOutbound\b/gi, "外联"],
  [/\bPipeline\b/gi, "管道"],
  [/\bPersona\b/gi, "角色"],
  [/\bGuardian\b/gi, "守护者"],
  [/\bDouyin\b/gi, "抖音"],
  [/\bWeChat\b/gi, "微信"],
  [/\bMini Program\b/gi, "小程序"],
  [/\bSite Reliability\b/gi, "站点可靠性"],
  [/\bSEO\b/g, "SEO"],
]

const ZH_AGENT_NAME_PATTERNS: Array<[RegExp, string]> = [
  [/\bUX\b/g, "UX"],
  [/\bUI\b/g, "UI"],
  [/\bAI\b/g, "AI"],
  [/\bPR\b/g, "PR"],
  [/\bGIS\b/g, "GIS"],
  [/\bFP&A\b/g, "FP&A"],
  [/\bSRE\b/g, "SRE"],
  [/\bXR\b/g, "XR"],
  [/\bBIM\b/g, "BIM"],
  [/\bML\b/g, "ML"],
  [/\bvisionOS\b/g, "visionOS"],
]

function localizeImportedAgentName(locale: AppLocale, name: string) {
  if (locale !== "zh") return name

  let localized = name
  for (const [from, to] of ZH_AGENT_NAME_PHRASES) {
    localized = localized.replace(new RegExp(from, "gi"), to)
  }
  for (const [pattern, replacement] of ZH_AGENT_NAME_TOKENS) {
    localized = localized.replace(pattern, replacement)
  }
  for (const [pattern, replacement] of ZH_AGENT_NAME_PATTERNS) {
    localized = localized.replace(pattern, replacement)
  }

  return localized
    .replace(/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g, "$1$2")
    .replace(/\s{2,}/g, " ")
    .trim()
}

function buildLocalizedImportedAgentSummary(
  locale: AppLocale,
  name: string,
  sourceCategoryLabel: string,
  description: string,
) {
  if (locale !== "zh") return description
  return `面向${sourceCategoryLabel}场景，围绕「${name}」提供可执行分析、建议与协作支持。`
}

function buildProofPoints(
  locale: AppLocale,
  sourceCategoryLabel: string,
  sourcePath: string,
  workflowSlugs: string[],
) {
  return [
    locale === "zh"
      ? `来源分类: Agency Agents / ${sourceCategoryLabel}`
      : `Source category: Agency Agents / ${sourceCategoryLabel}`,
    locale === "zh"
      ? "运行方式: 复用当前统一文本型 AI runtime"
      : "Runtime: reuses the current unified text AI runtime",
    locale === "zh"
      ? `关联工作流: ${workflowSlugs.join(", ")}`
      : `Connected workflows: ${workflowSlugs.join(", ")}`,
    locale === "zh"
      ? `Prompt 文件: ${sourcePath}`
      : `Prompt file: ${sourcePath}`,
  ]
}

function discoverImportedAgencyAgentDefinitions() {
  const definitions: ImportedAgencyAgentDefinition[] = []

  for (const sourceCategory of COMPATIBLE_SOURCE_CATEGORIES) {
    const categoryDir = path.join(IMPORTED_AGENT_BASE_DIR, sourceCategory)
    const filePaths = listMarkdownFilesRecursive(categoryDir)

    for (const filePath of filePaths) {
      const relativeFilePath = path.relative(categoryDir, filePath).replace(/\\/g, "/")
      const sourcePath = `${sourceCategory}/${relativeFilePath}`
      const content = readFileSync(filePath, "utf8")
      const meta = parseFrontmatter(content)
      const enName =
        meta.name_en?.trim() ||
        meta.nameEn?.trim() ||
        meta.enName?.trim() ||
        meta.name?.trim() ||
        startCaseFromSlug(relativeFilePath.replace(/\.md$/i, "").replace(/[\\/]+/g, "-"))
      const zhName =
        meta.name_zh?.trim() ||
        meta.nameZh?.trim() ||
        meta.zhName?.trim() ||
        localizeImportedAgentName("zh", enName)
      const description = meta.description?.trim() || `${enName} agent`
      definitions.push({
        agentId: buildImportedAgentId(sourceCategory, relativeFilePath),
        businessSlug: sourceCategory,
        sourceCategory,
        sourcePath,
        name: {
          zh: zhName,
          en: enName,
        },
        description,
        vibe: meta.vibe?.trim() || "",
        emoji: meta.emoji?.trim() || "",
        color: meta.color?.trim() || "",
      })
    }
  }

  return definitions
}

const IMPORTED_AGENCY_AGENT_DEFINITIONS = discoverImportedAgencyAgentDefinitions()
const IMPORTED_AGENCY_AGENT_MAP = new Map(
  IMPORTED_AGENCY_AGENT_DEFINITIONS.map((definition) => [definition.agentId, definition]),
)

function toLocalizedImportedAgent(
  locale: AppLocale,
  definition: ImportedAgencyAgentDefinition,
): ImportedAgencyAgentPlatformCard {
  const blueprint = CATEGORY_BLUEPRINTS[definition.sourceCategory]
  const sourceCategoryLabel = getSourceCategoryLabel(locale, definition.sourceCategory)
  const localizedName = localizeText(locale, definition.name)
  const localizedSummary = buildLocalizedImportedAgentSummary(
    locale,
    localizedName,
    sourceCategoryLabel,
    definition.description,
  )
  const samplePrompts = buildCategorySamplePrompts(locale, sourceCategoryLabel, localizedName)

  return {
    businessSlug: definition.businessSlug,
    agentId: definition.agentId,
    promptDocumentPath: definition.sourcePath,
    name: localizedName,
    summary: localizedSummary,
    systemPromptSummary:
      definition.vibe ||
      localizeText(locale, blueprint.systemPromptSummary),
    samplePrompts,
    workflowSlugs: blueprint.workflowSlugs,
    artifactKinds: blueprint.artifactKinds,
    source: "agency-agents",
    sourceCategory: definition.sourceCategory,
    sourceCategoryLabel,
    sourcePath: definition.sourcePath,
    sourceRepository: AGENCY_AGENT_SOURCE_REPOSITORY,
    nativeHref: buildDashboardBusinessHref(definition.businessSlug, {
      agentId: definition.agentId,
    }),
    proofPoints: buildProofPoints(locale, sourceCategoryLabel, definition.sourcePath, blueprint.workflowSlugs),
    emoji: definition.emoji,
    color: definition.color,
    vibe: definition.vibe,
  }
}

export function listImportedAgencyAgents(locale: AppLocale | "zh" | "en") {
  return IMPORTED_AGENCY_AGENT_DEFINITIONS.map((definition) =>
    toLocalizedImportedAgent(locale, definition),
  )
}

export function listImportedAgencyAgentsByBusinessSlug(
  locale: AppLocale | "zh" | "en",
  businessSlug: string,
) {
  return listImportedAgencyAgents(locale).filter((agent) => agent.businessSlug === businessSlug)
}

export function listImportedAgencyAgentsByIds(
  locale: AppLocale | "zh" | "en",
  agentIds: readonly string[],
) {
  const allowedIds = new Set(agentIds)
  return IMPORTED_AGENCY_AGENT_DEFINITIONS
    .filter((definition) => allowedIds.has(definition.agentId))
    .map((definition) => toLocalizedImportedAgent(locale, definition))
}

export function getImportedAgencyAgentById(
  locale: AppLocale | "zh" | "en",
  agentId: string | null | undefined,
) {
  if (!agentId) return null
  const definition = IMPORTED_AGENCY_AGENT_MAP.get(agentId)
  return definition ? toLocalizedImportedAgent(locale, definition) : null
}

export function getImportedAgencyAgentSkillSourceMap() {
  return Object.fromEntries(
    IMPORTED_AGENCY_AGENT_DEFINITIONS.map((definition) => [
      definition.agentId,
      definition.sourcePath,
    ]),
  )
}

export function isImportedAgencyAgentId(agentId: string | null | undefined) {
  return Boolean(agentId && IMPORTED_AGENCY_AGENT_MAP.has(agentId))
}

export function listImportedAgencyAgentDefinitions() {
  return [...IMPORTED_AGENCY_AGENT_DEFINITIONS]
}
