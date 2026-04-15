const { Pool } = require("pg")
require("./load-env")
const { getMigrationPoolConfig } = require("./get-db-connection")

const TABLES = {
  enterprises: "AI_MARKETING_enterprises",
  advisorConfigs: "AI_MARKETING_enterprise_dify_advisor_configs",
}

const ADVISOR_TYPE = "lead-hunter"
const DEFAULT_BASE_URL = process.env.DIFY_DEFAULT_BASE_URL || process.env.ENTERPRISE_DIFY_BASE_URL || "https://dify-api.o3-tools.com/v1"
const DEFAULT_LEAD_HUNTER_DIFY_KEY = process.env.LEAD_HUNTER_DIFY_API_KEY || ""

const TARGETS = [
  { code: "vbuy", mode: "skill" },
]

function normalizeMode(raw) {
  return String(raw || "").trim().toLowerCase() === "skill" ? "skill" : "dify"
}

async function findEnterprise(pool, code) {
  const result = await pool.query(
    `
      SELECT id, enterprise_code, name
      FROM "${TABLES.enterprises}"
      WHERE lower(enterprise_code) = lower($1) OR lower(name) = lower($1)
      LIMIT 1
    `,
    [code],
  )
  return result.rows[0] || null
}

async function upsertAdvisorMode(pool, input) {
  const mode = normalizeMode(input.mode)
  const apiKey = mode === "skill" ? "managed" : DEFAULT_LEAD_HUNTER_DIFY_KEY
  const baseUrl = mode === "skill" ? "skill://lead-hunter" : DEFAULT_BASE_URL

  const res = await pool.query(
    `
      INSERT INTO "${TABLES.advisorConfigs}" (
        enterprise_id,
        advisor_type,
        execution_mode,
        base_url,
        api_key,
        enabled,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, NULLIF($5, ''), TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (enterprise_id, advisor_type)
      DO UPDATE SET
        execution_mode = EXCLUDED.execution_mode,
        base_url = EXCLUDED.base_url,
        api_key = COALESCE(EXCLUDED.api_key, "${TABLES.advisorConfigs}".api_key),
        enabled = EXCLUDED.enabled,
        updated_at = CURRENT_TIMESTAMP
      RETURNING advisor_type, execution_mode, base_url, enabled
    `,
    [input.enterpriseId, ADVISOR_TYPE, mode, baseUrl, apiKey],
  )

  return res.rows || []
}

async function main() {
  const pool = new Pool(getMigrationPoolConfig())
  const summary = []

  try {
    await pool.query("BEGIN")
    for (const target of TARGETS) {
      const enterprise = await findEnterprise(pool, target.code)
      if (!enterprise?.id) {
        summary.push({
          code: target.code,
          mode: normalizeMode(target.mode),
          status: "not_found",
        })
        continue
      }

      const saved = await upsertAdvisorMode(pool, {
        enterpriseId: enterprise.id,
        mode: target.mode,
      })
      summary.push({
        code: enterprise.enterprise_code,
        name: enterprise.name,
        enterpriseId: enterprise.id,
        mode: normalizeMode(target.mode),
        status: "updated",
        advisors: saved,
      })
    }
    await pool.query("COMMIT")
    console.log(JSON.stringify({ ok: true, summary }, null, 2))
  } catch (error) {
    await pool.query("ROLLBACK").catch(() => {})
    throw error
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error("configure-lead-hunter-engine-modes failed:", error)
  process.exit(1)
})
