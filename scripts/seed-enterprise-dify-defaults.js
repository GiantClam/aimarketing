const { Pool } = require("pg")
require("./load-env")
const { getMigrationPoolConfig } = require("./get-db-connection")

const DIFY_BASE_URL = process.env.ENTERPRISE_DIFY_BASE_URL || "https://dify-api.o3-tools.com/v1"
const TABLES = {
  enterprises: "AI_MARKETING_enterprises",
  difyConnections: "AI_MARKETING_dify_connections",
  enterpriseDifyBindings: "AI_MARKETING_enterprise_dify_bindings",
  enterpriseDifyDatasets: "AI_MARKETING_enterprise_dify_datasets",
}

const ENTERPRISES = [
  {
    code: "vbuy",
    name: "VBUY",
    datasetId: "bc9f5ddd-1774-49e9-ba91-41af4673c253",
    datasetName: "VBUY 企业知识库",
    scope: "general",
    priority: 10,
  },
  {
    code: "灵创智能",
    name: "灵创智能",
    datasetId: "302cf95a-2473-4d57-be04-401d5cfda3d6",
    datasetName: "灵创智能 企业知识库",
    scope: "general",
    priority: 10,
  },
]

const LEGACY_ENTERPRISE_FIXES = [
  {
    fromCode: "閻忛潧鍨遍弲楦垮厴",
    fromName: "閻忛潧鍨遍弲楦垮厴",
    toCode: "灵创智能",
    toName: "灵创智能",
  },
]

async function normalizeLegacyEnterpriseRows(pool) {
  for (const fix of LEGACY_ENTERPRISE_FIXES) {
    await pool.query(
      `
        UPDATE "${TABLES.enterprises}"
        SET enterprise_code = $3,
            name = $4,
            updated_at = CURRENT_TIMESTAMP
        WHERE (enterprise_code = $1 OR name = $2)
          AND NOT EXISTS (
            SELECT 1 FROM "${TABLES.enterprises}" other
            WHERE other.enterprise_code = $3 AND other.id <> "${TABLES.enterprises}".id
          );
      `,
      [fix.fromCode, fix.fromName, fix.toCode, fix.toName],
    )
  }
}

async function ensureEnterprise(pool, enterprise) {
  const inserted = await pool.query(
    `
      INSERT INTO "${TABLES.enterprises}" (enterprise_code, name, updated_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (enterprise_code)
      DO UPDATE SET
        name = EXCLUDED.name,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, enterprise_code, name;
    `,
    [enterprise.code, enterprise.name],
  )

  return inserted.rows[0]
}

async function resolveDifyApiKey(pool) {
  const explicitApiKey = process.env.ENTERPRISE_DIFY_API_KEY?.trim()
  if (explicitApiKey) return explicitApiKey

  const legacy = await pool.query(
    `
      SELECT api_key
      FROM "${TABLES.difyConnections}"
      WHERE base_url = $1
        AND COALESCE(api_key, '') <> ''
      ORDER BY is_default DESC, updated_at DESC, id DESC
      LIMIT 1
    `,
    [DIFY_BASE_URL],
  )

  const inheritedApiKey = legacy.rows[0]?.api_key?.trim()
  if (inheritedApiKey) return inheritedApiKey

  throw new Error(
    `ENTERPRISE_DIFY_API_KEY is required when no legacy Dify API key is available in ${TABLES.difyConnections}`,
  )
}

async function upsertEnterpriseDifyBinding(pool, enterpriseId) {
  const apiKey = await resolveDifyApiKey(pool)
  const inserted = await pool.query(
    `
      INSERT INTO "${TABLES.enterpriseDifyBindings}" (enterprise_id, base_url, api_key, enabled, created_at, updated_at)
      VALUES ($1, $2, $3, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (enterprise_id)
      DO UPDATE SET
        base_url = EXCLUDED.base_url,
        api_key = EXCLUDED.api_key,
        enabled = EXCLUDED.enabled,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id;
    `,
    [enterpriseId, DIFY_BASE_URL, apiKey],
  )

  return inserted.rows[0].id
}

async function replaceDatasets(pool, bindingId, enterprise) {
  await pool.query(`DELETE FROM "${TABLES.enterpriseDifyDatasets}" WHERE binding_id = $1`, [bindingId])
  await pool.query(
    `
      INSERT INTO "${TABLES.enterpriseDifyDatasets}" (
        binding_id,
        dataset_id,
        dataset_name,
        scope,
        priority,
        enabled,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    [bindingId, enterprise.datasetId, enterprise.datasetName, enterprise.scope || "brand", enterprise.priority || 10],
  )
}

async function main() {
  const pool = new Pool(getMigrationPoolConfig())

  try {
    await pool.query("BEGIN")
    await normalizeLegacyEnterpriseRows(pool)

    const missingTables = await pool.query(`
      SELECT ARRAY_REMOVE(ARRAY[
        CASE WHEN to_regclass('public."AI_MARKETING_enterprises"') IS NULL THEN 'AI_MARKETING_enterprises' END,
        CASE WHEN to_regclass('public."AI_MARKETING_enterprise_dify_bindings"') IS NULL THEN 'AI_MARKETING_enterprise_dify_bindings' END,
        CASE WHEN to_regclass('public."AI_MARKETING_enterprise_dify_datasets"') IS NULL THEN 'AI_MARKETING_enterprise_dify_datasets' END
      ], NULL) AS names;
    `)

    const names = missingTables.rows[0]?.names || []
    if (names.length > 0) {
      throw new Error(`missing required tables: ${names.join(", ")}`)
    }

    const results = []
    for (const enterprise of ENTERPRISES) {
      const savedEnterprise = await ensureEnterprise(pool, enterprise)
      const bindingId = await upsertEnterpriseDifyBinding(pool, savedEnterprise.id)
      await replaceDatasets(pool, bindingId, enterprise)

      results.push({
        enterpriseCode: savedEnterprise.enterprise_code,
        enterpriseName: savedEnterprise.name,
        bindingId,
        datasetId: enterprise.datasetId,
        datasetName: enterprise.datasetName,
      })
    }

    await pool.query("COMMIT")
    console.log(
      JSON.stringify(
        {
          ok: true,
          baseUrl: DIFY_BASE_URL,
          enterprises: results,
        },
        null,
        2,
      ),
    )
  } catch (error) {
    await pool.query("ROLLBACK")
    throw error
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error("Enterprise Dify defaults seed failed:", error)
  process.exit(1)
})
