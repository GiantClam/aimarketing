import { createRequire } from "node:module"

import { NextRequest } from "next/server"
import { Pool } from "pg"

import "./load-env"

const bootstrapRequire = createRequire(import.meta.url)
bootstrapRequire("./register-server-only-shim.cjs")

const TABLES = {
  enterprises: "AI_MARKETING_enterprises",
  users: "AI_MARKETING_users",
  userSessions: "AI_MARKETING_user_sessions",
  userFeaturePermissions: "AI_MARKETING_user_feature_permissions",
  leadHunterConversations: "AI_MARKETING_lead_hunter_conversations",
  leadHunterMessages: "AI_MARKETING_lead_hunter_messages",
  leadHunterEvidences: "AI_MARKETING_lead_hunter_evidences",
}

type LeadHunterAdvisorType = "company-search" | "contact-mining"

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function parseAdvisorTypeFromArgs(): LeadHunterAdvisorType {
  const args = process.argv.slice(2)
  const index = args.findIndex((arg) => arg === "--advisor-type")
  const candidate = index >= 0 ? args[index + 1] : undefined
  if (candidate === "contact-mining") return "contact-mining"
  return "company-search"
}

function extractCookie(response: Response) {
  const raw = response.headers.get("set-cookie")
  return raw ? raw.split(";")[0] : null
}

function makeRequest(url: string, method: string, body?: unknown, cookie?: string | null) {
  const headers = new Headers({ "content-type": "application/json" })
  if (cookie) headers.set("cookie", cookie)
  return new NextRequest(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
}

async function parseJsonSafe(response: Response) {
  try {
    return await response.json()
  } catch {
    return null
  }
}

async function readStreamText(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader()
  const decoder = new TextDecoder("utf-8")
  let output = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    output += decoder.decode(value, { stream: true })
  }
  output += decoder.decode()
  return output
}

function parseSsePayloads(wire: string) {
  const blocks = wire.split(/\r?\n\r?\n/)
  const payloads: Array<Record<string, unknown>> = []

  for (const block of blocks) {
    if (!block.trim()) continue
    const raw = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim()
    if (!raw || raw === "[DONE]") continue
    try {
      payloads.push(JSON.parse(raw) as Record<string, unknown>)
    } catch {
      // ignore malformed chunk
    }
  }

  return payloads
}

async function waitForEvidenceRows(pool: Pool, conversationId: number, timeoutMs = 12_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const result = await pool.query<{ cnt: number }>(
      `SELECT COUNT(*)::int AS cnt FROM "${TABLES.leadHunterEvidences}" WHERE conversation_id = $1`,
      [conversationId],
    )
    const count = result.rows?.[0]?.cnt || 0
    if (count > 0) return count
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return 0
}

function buildSmokeQuery(advisorType: LeadHunterAdvisorType, suffix: string) {
  if (advisorType === "contact-mining") {
    return `Acme contact mining smoke ${suffix}`
  }
  return `Acme company profile smoke ${suffix}`
}

async function run() {
  const advisorType = parseAdvisorTypeFromArgs()

  process.env.LEAD_HUNTER_ENGINE = "skill"
  process.env.TAVILY_API_KEY = process.env.TAVILY_API_KEY || "smoke-tavily-key"
  process.env.SERPER_API_KEY = process.env.SERPER_API_KEY || "smoke-serper-key"
  process.env.LEAD_HUNTER_SKILL_MODEL = process.env.LEAD_HUNTER_SKILL_MODEL || "smoke-lead-hunter-skill-model"

  const require = createRequire(import.meta.url)
  const nodeModule = require("node:module") as {
    _load: (request: string, parent: unknown, isMain: boolean) => unknown
  }
  const originalLoad = nodeModule._load
  const { getMigrationPoolConfig } = require("./get-db-connection")

  const suffix = Date.now().toString().slice(-8)
  const email = `lead_hunter_skill_smoke_${advisorType}_${suffix}@example.com`
  const password = "Smoke#12345678"
  let userId: number | null = null
  let enterpriseId: number | null = null
  let conversationId: number | null = null
  const pool = new Pool(getMigrationPoolConfig())

  nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
    if (request === "@/lib/writer/network") {
      return {
        writerRequestJson: async (url: string) => {
          if (url.includes("/search")) {
            if (url.includes("serper")) {
              return {
                ok: true,
                status: 200,
                data: {
                  organic: [
                    {
                      title: "Acme Home",
                      snippet: "Acme sells textile products and serves global buyers.",
                      link: "https://acme.example.com",
                    },
                  ],
                },
              }
            }
            return {
              ok: true,
              status: 200,
              data: {
                results: [
                  {
                    title: "Acme Contact",
                    url: "https://acme.example.com/contact",
                    content: "Contact page with leadership and business context.",
                  },
                ],
              },
            }
          }
          return { ok: true, status: 200, data: {} }
        },
      }
    }

    if (request === "@/lib/writer/aiberm") {
      return {
        generateTextWithWriterModel: async () =>
          "<think>internal reasoning</think># Lead Hunter Smoke Report\\n\\n## 1. Company Overview\\n- This content is generated for smoke verification.",
      }
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  try {
    const { POST: registerPost } = await import("@/app/api/auth/register/route")
    const { POST: difyChatPost } = await import("@/app/api/dify/chat-messages/route")

    const registerResponse = await registerPost(
      makeRequest("http://localhost/api/auth/register", "POST", {
        name: `LeadHunter Skill Smoke ${advisorType}`,
        email,
        password,
        enterpriseAction: "create",
        enterpriseName: `LeadHunter Skill Smoke ${advisorType} ${suffix}`,
      }),
    )
    const registerJson = await parseJsonSafe(registerResponse)
    expect(registerResponse.status === 200, `register failed: ${JSON.stringify(registerJson)}`)
    expect(registerJson?.user?.id, "register response missing user.id")
    expect(registerJson?.user?.enterpriseId, "register response missing enterpriseId")
    const cookie = extractCookie(registerResponse)
    expect(cookie, "register did not return session cookie")
    userId = Number(registerJson.user.id)
    enterpriseId = Number(registerJson.user.enterpriseId)

    await pool.query(
      `
        INSERT INTO "AI_MARKETING_enterprise_dify_advisor_configs" (
          enterprise_id,
          advisor_type,
          execution_mode,
          base_url,
          api_key,
          enabled,
          created_at,
          updated_at
        )
        VALUES ($1, $2, 'skill', 'skill://lead-hunter', 'managed', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (enterprise_id, advisor_type)
        DO UPDATE SET
          execution_mode = EXCLUDED.execution_mode,
          base_url = EXCLUDED.base_url,
          api_key = EXCLUDED.api_key,
          enabled = EXCLUDED.enabled,
          updated_at = CURRENT_TIMESTAMP;
      `,
      [enterpriseId, advisorType],
    )

    const streamResponse = await difyChatPost(
      makeRequest(
        "http://localhost/api/dify/chat-messages",
        "POST",
        {
          advisorType,
          response_mode: "streaming",
          query: buildSmokeQuery(advisorType, suffix),
        },
        cookie,
      ),
    )
    const streamErrorJson = await parseJsonSafe(streamResponse.clone())
    expect(streamResponse.status === 200, `chat failed: ${JSON.stringify(streamErrorJson)}`)
    const contentType = streamResponse.headers.get("content-type") || ""
    expect(contentType.includes("text/event-stream"), `unexpected content-type: ${contentType}`)
    const conversationHeader = streamResponse.headers.get("x-conversation-id")
    expect(conversationHeader, "missing x-conversation-id header")
    conversationId = Number.parseInt(conversationHeader || "", 10)
    expect(Number.isFinite(conversationId) && conversationId > 0, "invalid conversation id")
    expect(streamResponse.body, "stream response body missing")

    const wire = await readStreamText(streamResponse.body!)
    const payloads = parseSsePayloads(wire)
    expect(payloads.length > 0, "empty sse payload")

    const workflowFinished = payloads.find((item) => item.event === "workflow_finished")
    expect(workflowFinished, "workflow_finished event missing")
    const workflowData =
      workflowFinished && typeof workflowFinished.data === "object" && workflowFinished.data !== null
        ? (workflowFinished.data as Record<string, unknown>)
        : null
    expect(workflowData, "workflow_finished data missing")
    expect(!Object.prototype.hasOwnProperty.call(workflowData, "evidence"), "workflow_finished leaked evidence field")
    expect(typeof workflowData.evidence_count === "number", "workflow_finished missing evidence_count")

    const evidenceCount = await waitForEvidenceRows(pool, conversationId!)
    expect(evidenceCount > 0, "evidence rows were not persisted")

    console.log("lead_hunter_skill_stream_evidence_smoke: PASS", {
      advisorType,
      conversationId,
      evidenceRows: evidenceCount,
      workflowEvidenceCount: workflowData.evidence_count,
    })
  } finally {
    nodeModule._load = originalLoad
    try {
      if (conversationId) {
        await pool.query(`DELETE FROM "${TABLES.leadHunterEvidences}" WHERE conversation_id = $1`, [conversationId])
        await pool.query(`DELETE FROM "${TABLES.leadHunterMessages}" WHERE conversation_id = $1`, [conversationId])
        await pool.query(`DELETE FROM "${TABLES.leadHunterConversations}" WHERE id = $1`, [conversationId])
      }
      if (userId) {
        await pool.query(`DELETE FROM "${TABLES.userSessions}" WHERE user_id = $1`, [userId])
        await pool.query(`DELETE FROM "${TABLES.userFeaturePermissions}" WHERE user_id = $1`, [userId])
        await pool.query(`DELETE FROM "${TABLES.users}" WHERE id = $1`, [userId])
      }
      if (enterpriseId) {
        await pool.query(`DELETE FROM "${TABLES.enterprises}" WHERE id = $1`, [enterpriseId])
      }
    } finally {
      await pool.end()
    }
  }
}

run().catch((error) => {
  console.error(
    "lead_hunter_skill_stream_evidence_smoke: FAIL",
    error instanceof Error ? error.message : String(error),
  )
  process.exit(1)
})
