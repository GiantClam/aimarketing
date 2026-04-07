import "server-only"

import { readFile } from "node:fs/promises"
import * as path from "node:path"

const EXECUTIVE_SKILL_BASE_DIR = path.join(process.cwd(), "content", "skills", "executive-consulting-suite")

const skillCache = new Map<string, Promise<string>>()

function getSkillDocumentPath(relativePath: string) {
  return path.join(EXECUTIVE_SKILL_BASE_DIR, relativePath)
}

async function readSkillDocument(relativePath: string) {
  const existing = skillCache.get(relativePath)
  if (existing) {
    return existing
  }

  const nextPromise = readFile(getSkillDocumentPath(relativePath), "utf8")
  skillCache.set(relativePath, nextPromise)
  return nextPromise
}

function stripFrontmatter(markdown: string) {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim()
}

// Agent ID 到 skill 文件的映射
const AGENT_SKILL_MAP: Record<string, string[]> = {
  "executive-diagnostic": [
    "SKILL.md",
    "references/diagnostic-core.md",
    "references/routing-matrix.md",
    "references/kb-contract.md",
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

/**
 * 根据 agent ID 加载对应的 skill 文档内容
 */
export async function loadExecutiveSkillForAgent(agentId: string): Promise<string> {
  const skillFiles = AGENT_SKILL_MAP[agentId]
  if (!skillFiles || skillFiles.length === 0) {
    return ""
  }

  try {
    const contents = await Promise.all(
      skillFiles.map(async (file) => {
        try {
          const content = await readSkillDocument(file)
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
  return agentId.startsWith("executive-")
}

/**
 * 为通用咨询模式加载默认的 executive skill
 */
export async function loadDefaultExecutiveSkill(): Promise<string> {
  return loadExecutiveSkillForAgent("executive-diagnostic")
}
