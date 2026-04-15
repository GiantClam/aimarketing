const { Pool } = require("pg")
require("./load-env")
const { getMigrationPoolConfig } = require("./get-db-connection")

const TABLES = {
  enterprises: "AI_MARKETING_enterprises",
  advisorConfigs: "AI_MARKETING_enterprise_dify_advisor_configs",
}

const ENTERPRISE_CODE = "vbuy"
const DEFAULT_BASE_URL = process.env.DIFY_DEFAULT_BASE_URL || process.env.ENTERPRISE_DIFY_BASE_URL || "https://dify-api.o3-tools.com/v1"
const LEAD_HUNTER_SKILL_BASE_URL = "skill://lead-hunter"
const LEAD_HUNTER_SKILL_API_KEY = "managed"
const COMPANY_SEARCH_API_KEY =
  process.env.VBUY_COMPANY_SEARCH_DIFY_API_KEY ||
  process.env.COMPANY_SEARCH_DIFY_API_KEY ||
  process.env.DIFY_DEFAULT_COMPANY_SEARCH_API_KEY ||
  ""
const CONTACT_MINING_API_KEY =
  process.env.VBUY_CONTACT_MINING_DIFY_API_KEY ||
  process.env.CONTACT_MINING_DIFY_API_KEY ||
  process.env.DIFY_DEFAULT_CONTACT_MINING_API_KEY ||
  ""

function maskApiKey(apiKey) {
  const trimmed = String(apiKey || "").trim()
  if (!trimmed) return ""
  if (trimmed.length <= 8) return `${trimmed.slice(0, 2)}****${trimmed.slice(-2)}`
  return `${trimmed.slice(0, 4)}****${trimmed.slice(-4)}`
}

async function upsertAdvisorConfig(pool, enterpriseId, advisorType, apiKey) {
  await pool.query(
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
      VALUES ($1, $2, 'dify', $3, $4, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (enterprise_id, advisor_type)
      DO UPDATE SET
        execution_mode = EXCLUDED.execution_mode,
        base_url = EXCLUDED.base_url,
        api_key = COALESCE(EXCLUDED.api_key, "${TABLES.advisorConfigs}".api_key),
        enabled = EXCLUDED.enabled,
        updated_at = CURRENT_TIMESTAMP;
    `,
    [enterpriseId, advisorType, DEFAULT_BASE_URL, apiKey || null],
  )
}

async function upsertLeadHunterSkillConfig(pool, enterpriseId) {
  await pool.query(
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
      VALUES ($1, 'lead-hunter', 'skill', $2, $3, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (enterprise_id, advisor_type)
      DO UPDATE SET
        execution_mode = EXCLUDED.execution_mode,
        base_url = EXCLUDED.base_url,
        api_key = EXCLUDED.api_key,
        enabled = EXCLUDED.enabled,
        updated_at = CURRENT_TIMESTAMP;
    `,
    [enterpriseId, LEAD_HUNTER_SKILL_BASE_URL, LEAD_HUNTER_SKILL_API_KEY],
  )
}

async function getExistingAdvisorApiKey(pool, enterpriseId, advisorType) {
  const res = await pool.query(
    `
      SELECT api_key
      FROM "${TABLES.advisorConfigs}"
      WHERE enterprise_id = $1 AND advisor_type = $2
      LIMIT 1
    `,
    [enterpriseId, advisorType],
  )
  const raw = String(res.rows?.[0]?.api_key || "").trim()
  return raw || ""
}

async function resolveDifyApiKey(pool, enterpriseId, advisorType, preferredApiKey) {
  const preferred = String(preferredApiKey || "").trim()
  if (preferred) return preferred
  const existing = await getExistingAdvisorApiKey(pool, enterpriseId, advisorType)
  if (existing && existing.toLowerCase() !== "managed") {
    return existing
  }
  throw new Error(`missing_dify_api_key:${advisorType}`)
}

async function main() {
  const pool = new Pool(getMigrationPoolConfig())

  try {
    await pool.query("BEGIN")

    const enterpriseRes = await pool.query(
      `
        SELECT id, enterprise_code, name
        FROM "${TABLES.enterprises}"
        WHERE enterprise_code = $1
        LIMIT 1;
      `,
      [ENTERPRISE_CODE],
    )
    const enterprise = enterpriseRes.rows[0]
    if (!enterprise?.id) {
      throw new Error(`enterprise_not_found:${ENTERPRISE_CODE}`)
    }

    const companySearchApiKey = await resolveDifyApiKey(
      pool,
      enterprise.id,
      "company-search",
      COMPANY_SEARCH_API_KEY,
    )
    const contactMiningApiKey = await resolveDifyApiKey(
      pool,
      enterprise.id,
      "contact-mining",
      CONTACT_MINING_API_KEY,
    )

    await upsertAdvisorConfig(pool, enterprise.id, "company-search", companySearchApiKey)
    await upsertAdvisorConfig(pool, enterprise.id, "contact-mining", contactMiningApiKey)
    await upsertLeadHunterSkillConfig(pool, enterprise.id)

    const savedRes = await pool.query(
      `
        SELECT advisor_type, execution_mode, base_url, api_key, enabled
        FROM "${TABLES.advisorConfigs}"
        WHERE enterprise_id = $1
          AND advisor_type IN ('lead-hunter', 'company-search', 'contact-mining')
        ORDER BY advisor_type ASC;
      `,
      [enterprise.id],
    )

    await pool.query("COMMIT")

    console.log(
      JSON.stringify(
        {
          ok: true,
          enterprise: {
            id: enterprise.id,
            code: enterprise.enterprise_code,
            name: enterprise.name,
          },
          workflows: savedRes.rows.map((row) => ({
            advisorType: row.advisor_type,
            executionMode: row.execution_mode,
            baseUrl: row.base_url,
            apiKeyMasked: maskApiKey(row.api_key),
            enabled: Boolean(row.enabled),
          })),
        },
        null,
        2,
      ),
    )
  } catch (error) {
    await pool.query("ROLLBACK").catch(() => {})
    throw error
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error("Configure VBUY lead hunter workflows failed:", error)
  process.exit(1)
})
