import fs from "node:fs/promises"
import path from "node:path"
import { createRequire } from "node:module"

import { Pool } from "pg"

import { routeExecutiveAgentByPrompt } from "../lib/ai-entry/executive-agent-router"
import { AI_ENTRY_CONSULTING_DEFAULT_EXECUTIVE_AGENT_ID } from "../lib/ai-entry/model-policy"

const require = createRequire(import.meta.url)
require("./load-env")
const { getMigrationPoolConfig } = require("./get-db-connection")

type FixedPromptCase = {
  name: string
  prompt: string
  expectedAgentId: string
}

type SampleRow = {
  id: number
  conversation_id: number
  user_id: number
  content: string
  created_at: string | Date | null
}

type DecisionSummary = {
  agentId: string
  confidence: "high" | "medium" | "low"
  score: number
  fallback: boolean
  matchedSignals: string[]
}

const TABLES = {
  conversations: "AI_MARKETING_conversations",
  messages: "AI_MARKETING_messages",
}

const FIXED_PROMPTS: FixedPromptCase[] = [
  {
    name: "brand",
    prompt: "我们要做品牌定位和价值主张重构，给我叙事框架。",
    expectedAgentId: "executive-brand",
  },
  {
    name: "growth",
    prompt: "请做增长漏斗诊断，给30天实验排期。",
    expectedAgentId: "executive-growth",
  },
  {
    name: "sales-strategy",
    prompt: "帮我设计销售分层与报价策略，提升赢单率。",
    expectedAgentId: "executive-sales-strategy",
  },
  {
    name: "legal",
    prompt: "评估合同条款与劳动合规风险，列出红线。",
    expectedAgentId: "executive-legal-risk",
  },
  {
    name: "fallback",
    prompt: "帮我想想下一步怎么做",
    expectedAgentId: AI_ENTRY_CONSULTING_DEFAULT_EXECUTIVE_AGENT_ID,
  },
]

function toInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(String(value || ""), 10)
  if (!Number.isFinite(parsed)) return fallback
  return parsed
}

function toFloat(value: string | undefined, fallback: number) {
  const parsed = Number.parseFloat(String(value || ""))
  if (!Number.isFinite(parsed)) return fallback
  return parsed
}

function makeSeededRng(seedInput: string) {
  let seed = 0
  for (let i = 0; i < seedInput.length; i += 1) {
    seed = (seed * 31 + seedInput.charCodeAt(i)) >>> 0
  }
  if (seed === 0) seed = 123456789

  return () => {
    seed = (1664525 * seed + 1013904223) >>> 0
    return seed / 0x100000000
  }
}

function shuffleWithSeed<T>(list: T[], seedInput: string) {
  const rng = makeSeededRng(seedInput)
  const arr = [...list]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function summarizeDecision(prompt: string): DecisionSummary {
  const decision = routeExecutiveAgentByPrompt(prompt)
  return {
    agentId: decision.agentId,
    confidence: decision.confidence,
    score: decision.score,
    fallback: decision.fallback,
    matchedSignals: decision.matchedSignals,
  }
}

function evaluateFixedPrompts() {
  const details = FIXED_PROMPTS.map((item) => {
    const decision = summarizeDecision(item.prompt)
    const passed = decision.agentId === item.expectedAgentId
    return {
      name: item.name,
      prompt: item.prompt,
      expectedAgentId: item.expectedAgentId,
      actualAgentId: decision.agentId,
      confidence: decision.confidence,
      score: decision.score,
      fallback: decision.fallback,
      matchedSignals: decision.matchedSignals,
      passed,
    }
  })

  const failed = details.filter((item) => !item.passed)
  return {
    total: details.length,
    passed: details.length - failed.length,
    failed: failed.length,
    details,
  }
}

async function queryOnlinePromptPool(pool: Pool, options: { days: number; limit: number }) {
  const result = await pool.query<SampleRow>(
    `
      SELECT
        m.id,
        m.conversation_id,
        c.user_id,
        m.content,
        m.created_at
      FROM "${TABLES.messages}" m
      INNER JOIN "${TABLES.conversations}" c ON c.id = m.conversation_id
      WHERE
        m.role = 'user'
        AND c.title LIKE '[ai-consulting] %'
        AND m.content IS NOT NULL
        AND length(trim(m.content)) > 0
        AND m.created_at >= NOW() - ($1::text || ' days')::interval
      ORDER BY m.id DESC
      LIMIT $2
    `,
    [String(options.days), options.limit],
  )

  return result.rows || []
}

function sampleOnlinePrompts(
  rows: SampleRow[],
  options: { sampleSize: number; seed: string },
) {
  const dedup = new Map<string, SampleRow>()
  for (const row of rows) {
    const normalizedPrompt = String(row.content || "").trim().replace(/\s+/g, " ")
    if (!normalizedPrompt) continue
    if (dedup.has(normalizedPrompt)) continue
    dedup.set(normalizedPrompt, { ...row, content: normalizedPrompt })
  }

  const uniqueRows = Array.from(dedup.values())
  const shuffled = shuffleWithSeed(uniqueRows, options.seed)
  return shuffled.slice(0, Math.max(0, options.sampleSize))
}

function evaluateOnlineSamples(rows: SampleRow[]) {
  const details = rows.map((row) => {
    const decision = summarizeDecision(row.content)
    return {
      id: row.id,
      conversationId: row.conversation_id,
      userId: row.user_id,
      createdAt: row.created_at,
      prompt: row.content,
      decision,
    }
  })

  const total = details.length
  const fallbackCount = details.filter((item) => item.decision.fallback).length
  const lowConfidenceCount = details.filter((item) => item.decision.confidence === "low").length

  const byAgent = details.reduce<Record<string, number>>((acc, item) => {
    const key = item.decision.agentId
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  const byConfidence = details.reduce<Record<string, number>>((acc, item) => {
    const key = item.decision.confidence
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  return {
    total,
    fallbackCount,
    fallbackRate: total > 0 ? fallbackCount / total : 0,
    lowConfidenceCount,
    lowConfidenceRate: total > 0 ? lowConfidenceCount / total : 0,
    byAgent,
    byConfidence,
    details,
  }
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true })
}

async function writeReportFile(report: unknown, outputDir: string) {
  await ensureDir(outputDir)
  const fileName = `report-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  const filePath = path.join(outputDir, fileName)
  await fs.writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`, "utf8")
  return filePath
}

async function main() {
  const days = toInt(process.env.AI_ENTRY_NIGHTLY_SAMPLE_DAYS, 7)
  const sampleSize = toInt(process.env.AI_ENTRY_NIGHTLY_SAMPLE_SIZE, 80)
  const recentPoolSize = toInt(
    process.env.AI_ENTRY_NIGHTLY_RECENT_POOL_SIZE,
    Math.max(sampleSize * 5, 200),
  )
  const minSampleForGate = toInt(process.env.AI_ENTRY_NIGHTLY_MIN_SAMPLE_FOR_GATE, 20)
  const fallbackRateThreshold = toFloat(process.env.AI_ENTRY_NIGHTLY_MAX_FALLBACK_RATE, 0.45)
  const lowConfidenceThreshold = toFloat(process.env.AI_ENTRY_NIGHTLY_MAX_LOW_CONFIDENCE_RATE, 0.75)
  const requireSamples = String(process.env.AI_ENTRY_NIGHTLY_REQUIRE_SAMPLES || "false").toLowerCase() === "true"
  const skipDbSample = String(process.env.AI_ENTRY_NIGHTLY_SKIP_DB_SAMPLE || "false").toLowerCase() === "true"
  const sampleSeed = process.env.AI_ENTRY_NIGHTLY_SAMPLE_SEED || new Date().toISOString().slice(0, 10)

  const fixed = evaluateFixedPrompts()

  const report: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    scenario: "ai-entry-routing-nightly-check",
    config: {
      days,
      sampleSize,
      recentPoolSize,
      minSampleForGate,
      fallbackRateThreshold,
      lowConfidenceThreshold,
      requireSamples,
      skipDbSample,
      sampleSeed,
    },
    fixedPrompts: fixed,
    onlineSamples: null,
    checks: {
      fixedPromptsPass: fixed.failed === 0,
      onlineFallbackRatePass: true,
      onlineLowConfidenceRatePass: true,
      onlineSampleCountPass: true,
    },
    failures: [] as string[],
  }

  if (fixed.failed > 0) {
    ;(report.failures as string[]).push(`fixed_prompts_failed:${fixed.failed}`)
  }

  if (!skipDbSample) {
    const pool = new Pool(getMigrationPoolConfig())
    try {
      const rows = await queryOnlinePromptPool(pool, {
        days,
        limit: recentPoolSize,
      })
      const sampled = sampleOnlinePrompts(rows, {
        sampleSize,
        seed: sampleSeed,
      })
      const onlineSummary = evaluateOnlineSamples(sampled)
      report.onlineSamples = onlineSummary

      if (requireSamples && onlineSummary.total === 0) {
        report.checks = {
          ...(report.checks as Record<string, unknown>),
          onlineSampleCountPass: false,
        }
        ;(report.failures as string[]).push("online_samples_missing")
      }

      if (onlineSummary.total >= minSampleForGate) {
        if (onlineSummary.fallbackRate > fallbackRateThreshold) {
          report.checks = {
            ...(report.checks as Record<string, unknown>),
            onlineFallbackRatePass: false,
          }
          ;(report.failures as string[]).push(
            `online_fallback_rate_high:${onlineSummary.fallbackRate.toFixed(4)}`,
          )
        }

        if (onlineSummary.lowConfidenceRate > lowConfidenceThreshold) {
          report.checks = {
            ...(report.checks as Record<string, unknown>),
            onlineLowConfidenceRatePass: false,
          }
          ;(report.failures as string[]).push(
            `online_low_confidence_rate_high:${onlineSummary.lowConfidenceRate.toFixed(4)}`,
          )
        }
      }
    } finally {
      await pool.end()
    }
  }

  const outputDir = path.join(process.cwd(), "artifacts", "ai-entry", "routing-nightly")
  const reportPath = await writeReportFile(report, outputDir)

  console.log("AI_ENTRY_ROUTING_NIGHTLY_REPORT_START")
  console.log(JSON.stringify(report, null, 2))
  console.log("AI_ENTRY_ROUTING_NIGHTLY_REPORT_END")
  console.log(`AI_ENTRY_ROUTING_NIGHTLY_REPORT_FILE=${reportPath}`)

  const failures = report.failures as string[]
  if (failures.length > 0) {
    throw new Error(`nightly_routing_check_failed:${failures.join(",")}`)
  }
}

main().catch((error) => {
  console.error(
    "ai_entry_routing_nightly_check.failed",
    error instanceof Error ? error.message : String(error),
  )
  process.exit(1)
})
