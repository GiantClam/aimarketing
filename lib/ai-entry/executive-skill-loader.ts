import "server-only"

import { readFile } from "node:fs/promises"
import * as path from "node:path"

import { listBusinessAgentConfigs } from "@/lib/platform/business-agents"

const EXECUTIVE_SKILL_BASE_DIR = path.join(process.cwd(), "content", "skills", "executive-consulting-suite")
const BUSINESS_AGENT_SKILL_BASE_DIR = path.join(process.cwd(), "content", "skills", "business-agents")
const IMPORTED_AGENCY_AGENT_SKILL_BASE_DIR = path.join(process.cwd(), "content", "skills", "agency-agents")

const skillCache = new Map<string, Promise<string>>()

function getSkillDocumentPath(baseDir: string, relativePath: string) {
  return path.join(baseDir, relativePath)
}

async function readSkillDocument(baseDir: string, relativePath: string) {
  const cacheKey = `${baseDir}:${relativePath}`
  const existing = skillCache.get(cacheKey)
  if (existing) {
    return existing
  }

  const nextPromise = readFile(getSkillDocumentPath(baseDir, relativePath), "utf8")
  skillCache.set(cacheKey, nextPromise)
  return nextPromise
}

function stripFrontmatter(markdown: string) {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim()
}

// Agent ID 到 skill 文件的映射
const AGENT_SKILL_MAP: Record<string, string[]> = {
  "executive-diagnostic": [
    "references/diagnostic-runtime-brief.md",
  ],
  "executive-brand": [
    "SKILL.md",
    "references/domains/brand.md",
    "references/diagnostic-core.md",
  ],
  "executive-growth": [
    "SKILL.md",
    "references/domains/growth.md",
    "references/diagnostic-core.md",
  ],
  "executive-ppt": [
    "references/domains/ppt-generation.md",
    "references/diagnostic-core.md",
  ],
  "executive-sales-strategy": [
    "SKILL.md",
    "references/domains/sales-strategy.md",
    "references/diagnostic-core.md",
  ],
  "executive-sales-management": [
    "SKILL.md",
    "references/domains/sales-management-system.md",
    "references/diagnostic-core.md",
  ],
  "executive-org-hr": [
    "SKILL.md",
    "references/domains/organization-hr.md",
    "references/diagnostic-core.md",
  ],
  "executive-operations": [
    "SKILL.md",
    "references/domains/operations-production-management.md",
    "references/diagnostic-core.md",
  ],
  "executive-finance": [
    "SKILL.md",
    "references/domains/finance-management.md",
    "references/diagnostic-core.md",
  ],
  "executive-legal-risk": [
    "SKILL.md",
    "references/domains/legal-risk-screening.md",
    "references/legal-escalation.md",
    "references/legal-knowledge-policy.md",
    "references/diagnostic-core.md",
  ],
}

const BUSINESS_AGENT_SKILL_MAP = Object.fromEntries(
  listBusinessAgentConfigs().map((agent) => [agent.agentId, [agent.promptDocumentPath]]),
)

const BUSINESS_AGENT_IMPORTED_SKILL_MAP: Record<string, string[]> = {
  "business-content-growth-strategist": [
    "marketing/marketing-content-creator.md",
  ],
  "business-seo-repurpose": [
    "marketing/marketing-seo-specialist.md",
  ],
  "business-aeo-foundations": [
    "marketing/marketing-aeo-foundations.md",
  ],
  "business-ai-citation-strategist": [
    "marketing/marketing-ai-citation-strategist.md",
  ],
  "business-xiaohongshu-growth-strategist": [
    "marketing/marketing-xiaohongshu-specialist.md",
  ],
  "business-tiktok-growth-strategist": [
    "marketing/marketing-tiktok-strategist.md",
  ],
  "business-wechat-content-operator": [
    "marketing/marketing-wechat-official-account.md",
  ],
  "business-pr-communications": [
    "marketing/marketing-pr-communications-manager.md",
  ],
  "business-brand-creative": [
    "design/design-brand-guardian.md",
  ],
  "business-campaign-creative": [
    "marketing/marketing-social-media-strategist.md",
    "marketing/marketing-growth-hacker.md",
    "paid-media/paid-media-creative-strategist.md",
  ],
  "business-video-creative": [
    "marketing/marketing-video-optimization-specialist.md",
    "marketing/marketing-short-video-editing-coach.md",
    "paid-media/paid-media-creative-strategist.md",
  ],
  "business-ppc-strategist": [
    "paid-media/paid-media-ppc-strategist.md",
  ],
  "business-paid-social-strategist": [
    "paid-media/paid-media-paid-social-strategist.md",
  ],
  "business-ad-creative-strategist": [
    "paid-media/paid-media-creative-strategist.md",
  ],
  "business-paid-media-auditor": [
    "paid-media/paid-media-auditor.md",
  ],
  "business-tracking-analytics-specialist": [
    "paid-media/paid-media-tracking-specialist.md",
  ],
  "business-pricing-analyst": [
    "specialized/specialized-pricing-analyst.md",
  ],
  "business-lead-conversion": [
    "sales/sales-offer-lead-gen-strategist.md",
    "marketing/marketing-email-strategist.md",
    "sales/sales-outbound-strategist.md",
  ],
  "business-outreach-planner": [
    "sales/sales-outbound-strategist.md",
  ],
  "business-objection-handler": [
    "sales/sales-discovery-coach.md",
    "sales/sales-deal-strategist.md",
    "sales/sales-coach.md",
  ],
  "business-sales-close": [
    "sales/sales-deal-strategist.md",
  ],
  "business-proposal-strategist": [
    "sales/sales-proposal-strategist.md",
  ],
  "business-ui-design-system": [
    "design/design-ui-designer.md",
  ],
  "business-ux-architect": [
    "design/design-ux-architect.md",
  ],
  "business-compliance-auditor": [
    "security/security-compliance-auditor.md",
  ],
  "business-privacy-officer": [
    "specialized/data-privacy-officer.md",
  ],
  "business-healthcare-marketing-compliance": [
    "specialized/healthcare-marketing-compliance.md",
  ],
  "business-training-designer": [
    "specialized/corporate-training-designer.md",
  ],
  "business-recruitment-specialist": [
    "specialized/recruitment-specialist.md",
  ],
  "business-hr-onboarding": [
    "specialized/hr-onboarding.md",
  ],
  "business-legal-document-review": [
    "specialized/legal-document-review.md",
  ],
  "business-legal-client-intake": [
    "specialized/legal-client-intake.md",
  ],
  "business-enterprise-operations": [
    "specialized/operations-manager.md",
  ],
  "business-governance-capacity": [
    "specialized/automation-governance-architect.md",
  ],
}

function getStaticAgentSkillSource(agentId: string) {
  if (AGENT_SKILL_MAP[agentId]?.length) {
    return {
      baseDir: EXECUTIVE_SKILL_BASE_DIR,
      files: AGENT_SKILL_MAP[agentId],
    }
  }

  if (BUSINESS_AGENT_IMPORTED_SKILL_MAP[agentId]?.length) {
    return {
      baseDir: IMPORTED_AGENCY_AGENT_SKILL_BASE_DIR,
      files: BUSINESS_AGENT_IMPORTED_SKILL_MAP[agentId],
    }
  }

  if (BUSINESS_AGENT_SKILL_MAP[agentId]?.length) {
    return {
      baseDir: BUSINESS_AGENT_SKILL_BASE_DIR,
      files: BUSINESS_AGENT_SKILL_MAP[agentId],
    }
  }

  return null
}

async function getImportedAgencyAgentSkillSource(agentId: string) {
  if (!agentId.startsWith("agency-")) return null

  try {
    const { getImportedAgencyAgentSkillSourceMap } = await import("@/lib/platform/imported-agency-agents")
    const sourcePath = getImportedAgencyAgentSkillSourceMap()[agentId]
    if (!sourcePath) return null

    return {
      baseDir: IMPORTED_AGENCY_AGENT_SKILL_BASE_DIR,
      files: [sourcePath],
    }
  } catch (error) {
    console.warn("executive-skill.imported-agency-map-failed", {
      agentId,
      message: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/**
 * 根据 agent ID 加载对应的 skill 文档内容
 */
export async function loadExecutiveSkillForAgent(agentId: string): Promise<string> {
  const source = getStaticAgentSkillSource(agentId) || (await getImportedAgencyAgentSkillSource(agentId))
  if (!source) {
    return ""
  }

  try {
    const contents = await Promise.all(
      source.files.map(async (file) => {
        try {
          const content = await readSkillDocument(source.baseDir, file)
          return stripFrontmatter(content)
        } catch (error) {
          console.warn("executive-skill.read-failed", {
            agentId,
            file,
            message: error instanceof Error ? error.message : String(error),
          })
          return ""
        }
      })
    )

    return contents.filter(Boolean).join("\n\n---\n\n")
  } catch (error) {
    console.error("executive-skill.load-failed", {
      agentId,
      message: error instanceof Error ? error.message : String(error),
    })
    return ""
  }
}

/**
 * 检查 agent 是否是 executive consulting 类型
 */
export function isExecutiveConsultingAgent(agentId: string | null | undefined): boolean {
  if (!agentId) return false
  return Boolean(getStaticAgentSkillSource(agentId) || agentId.startsWith("agency-"))
}

/**
 * 为通用咨询模式加载默认的 executive skill
 */
export async function loadDefaultExecutiveSkill(): Promise<string> {
  return loadExecutiveSkillForAgent("executive-diagnostic")
}
