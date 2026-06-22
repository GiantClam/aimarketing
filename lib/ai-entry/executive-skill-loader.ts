import "server-only"

import { readFile } from "node:fs/promises"
import * as path from "node:path"

import { listBusinessAgentConfigs } from "@/lib/platform/business-agents"
import { getImportedAgencyAgentSkillSourceMap } from "@/lib/platform/imported-agency-agents"

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
const IMPORTED_AGENCY_AGENT_SKILL_MAP = Object.fromEntries(
  Object.entries(getImportedAgencyAgentSkillSourceMap()).map(([agentId, sourcePath]) => [agentId, [sourcePath]]),
)

function getAgentSkillSource(agentId: string) {
  if (AGENT_SKILL_MAP[agentId]?.length) {
    return {
      baseDir: EXECUTIVE_SKILL_BASE_DIR,
      files: AGENT_SKILL_MAP[agentId],
    }
  }

  if (BUSINESS_AGENT_SKILL_MAP[agentId]?.length) {
    return {
      baseDir: BUSINESS_AGENT_SKILL_BASE_DIR,
      files: BUSINESS_AGENT_SKILL_MAP[agentId],
    }
  }

  if (IMPORTED_AGENCY_AGENT_SKILL_MAP[agentId]?.length) {
    return {
      baseDir: IMPORTED_AGENCY_AGENT_SKILL_BASE_DIR,
      files: IMPORTED_AGENCY_AGENT_SKILL_MAP[agentId],
    }
  }

  return null
}

/**
 * 根据 agent ID 加载对应的 skill 文档内容
 */
export async function loadExecutiveSkillForAgent(agentId: string): Promise<string> {
  const source = getAgentSkillSource(agentId)
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
  return Boolean(getAgentSkillSource(agentId))
}

/**
 * 为通用咨询模式加载默认的 executive skill
 */
export async function loadDefaultExecutiveSkill(): Promise<string> {
  return loadExecutiveSkillForAgent("executive-diagnostic")
}
