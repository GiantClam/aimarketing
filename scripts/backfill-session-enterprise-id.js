const { Pool } = require("pg")

require("./load-env")
const { getMigrationPoolConfig } = require("./get-db-connection")

const TABLES = {
  users: "AI_MARKETING_users",
  enterpriseJoinRequests: "AI_MARKETING_enterprise_join_requests",
  imageDesignSessions: "AI_MARKETING_image_design_sessions",
  writerConversations: "AI_MARKETING_writer_conversations",
}

const INDEXES = {
  imageEnterpriseUpdated: "AI_MARKETING_image_design_sessions_enterprise_updated_idx",
  writerEnterpriseUpdated: "AI_MARKETING_writer_conversations_enterprise_updated_idx",
}

function parseArgs(argv) {
  const args = {
    execute: false,
    includeRisky: false,
  }

  for (const arg of argv) {
    if (arg === "--execute") args.execute = true
    if (arg === "--dry-run") args.execute = false
    if (arg === "--include-risky") args.includeRisky = true
    if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/backfill-session-enterprise-id.js [--dry-run] [--execute] [--include-risky]

Options:
  --dry-run       Run in transaction and rollback (default)
  --execute       Commit backfill changes
  --include-risky Also backfill users with ambiguous enterprise history
`)
      process.exit(0)
    }
  }

  return args
}

function toCount(row, key = "count") {
  const value = row?.[key]
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

async function tableExists(client, tableName) {
  const result = await client.query(`SELECT to_regclass($1) IS NOT NULL AS exists`, [`public."${tableName}"`])
  return Boolean(result.rows[0]?.exists)
}

async function ensureIndexesAndColumns(client, tableAvailability) {
  if (tableAvailability.writerConversations) {
    await client.query(`
      ALTER TABLE "${TABLES.writerConversations}"
      ADD COLUMN IF NOT EXISTS enterprise_id INTEGER REFERENCES "AI_MARKETING_enterprises"(id) ON DELETE SET NULL
    `)
    await client.query(`
      CREATE INDEX IF NOT EXISTS "${INDEXES.writerEnterpriseUpdated}"
      ON "${TABLES.writerConversations}" (enterprise_id, updated_at DESC, id DESC)
    `)
  }

  if (tableAvailability.imageDesignSessions) {
    await client.query(`
      CREATE INDEX IF NOT EXISTS "${INDEXES.imageEnterpriseUpdated}"
      ON "${TABLES.imageDesignSessions}" (enterprise_id, updated_at DESC, id DESC)
    `)
  }
}

async function createRiskyUsersTempTable(client, { hasJoinRequestTable, includeRisky }) {
  await client.query(`DROP TABLE IF EXISTS _session_enterprise_risky_users`)

  if (!hasJoinRequestTable || includeRisky) {
    await client.query(`
      CREATE TEMP TABLE _session_enterprise_risky_users (
        user_id INTEGER PRIMARY KEY,
        email TEXT,
        current_enterprise_id INTEGER,
        approved_enterprise_ids INTEGER[]
      ) ON COMMIT DROP
    `)
    return
  }

  await client.query(`
    CREATE TEMP TABLE _session_enterprise_risky_users ON COMMIT DROP AS
    WITH approved_history AS (
      SELECT
        user_id,
        array_agg(DISTINCT enterprise_id ORDER BY enterprise_id) AS approved_enterprise_ids
      FROM "${TABLES.enterpriseJoinRequests}"
      WHERE status = 'approved'
      GROUP BY user_id
    )
    SELECT
      u.id AS user_id,
      u.email AS email,
      u.enterprise_id AS current_enterprise_id,
      h.approved_enterprise_ids
    FROM "${TABLES.users}" u
    JOIN approved_history h ON h.user_id = u.id
    WHERE
      cardinality(h.approved_enterprise_ids) > 1
      OR (
        cardinality(h.approved_enterprise_ids) = 1
        AND h.approved_enterprise_ids[1] <> u.enterprise_id
      )
  `)

  await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS _session_enterprise_risky_users_uidx ON _session_enterprise_risky_users (user_id)`)
}

async function collectRiskyUserSummary(client) {
  const countRes = await client.query(`SELECT COUNT(*)::int AS count FROM _session_enterprise_risky_users`)
  const sampleRes = await client.query(`
    SELECT user_id, email, current_enterprise_id, approved_enterprise_ids
    FROM _session_enterprise_risky_users
    ORDER BY user_id ASC
    LIMIT 20
  `)

  return {
    count: toCount(countRes.rows[0]),
    sample: sampleRes.rows,
  }
}

async function backfillImageSessions(client) {
  const beforeRes = await client.query(`
    SELECT
      COUNT(*) FILTER (WHERE s.enterprise_id IS NULL AND u.enterprise_id IS NOT NULL)::int AS null_with_user_enterprise,
      COUNT(*) FILTER (WHERE s.enterprise_id IS NULL AND u.enterprise_id IS NULL)::int AS null_with_user_enterprise_missing
    FROM "${TABLES.imageDesignSessions}" s
    INNER JOIN "${TABLES.users}" u ON u.id = s.user_id
  `)

  const updatedRes = await client.query(`
    WITH updated_rows AS (
      UPDATE "${TABLES.imageDesignSessions}" s
      SET enterprise_id = u.enterprise_id
      FROM "${TABLES.users}" u
      LEFT JOIN _session_enterprise_risky_users r ON r.user_id = u.id
      WHERE
        s.user_id = u.id
        AND s.enterprise_id IS NULL
        AND u.enterprise_id IS NOT NULL
        AND r.user_id IS NULL
      RETURNING s.id
    )
    SELECT COUNT(*)::int AS count FROM updated_rows
  `)

  const skippedRes = await client.query(`
    SELECT COUNT(*)::int AS count
    FROM "${TABLES.imageDesignSessions}" s
    INNER JOIN "${TABLES.users}" u ON u.id = s.user_id
    INNER JOIN _session_enterprise_risky_users r ON r.user_id = u.id
    WHERE s.enterprise_id IS NULL AND u.enterprise_id IS NOT NULL
  `)

  const remainingRes = await client.query(`
    SELECT COUNT(*)::int AS count
    FROM "${TABLES.imageDesignSessions}"
    WHERE enterprise_id IS NULL
  `)

  return {
    beforeNullWithUserEnterprise: toCount(beforeRes.rows[0], "null_with_user_enterprise"),
    beforeNullWithUserEnterpriseMissing: toCount(beforeRes.rows[0], "null_with_user_enterprise_missing"),
    updated: toCount(updatedRes.rows[0]),
    skippedRisky: toCount(skippedRes.rows[0]),
    remainingNull: toCount(remainingRes.rows[0]),
  }
}

async function backfillWriterConversations(client) {
  const beforeRes = await client.query(`
    SELECT
      COUNT(*) FILTER (WHERE c.enterprise_id IS NULL AND u.enterprise_id IS NOT NULL)::int AS null_with_user_enterprise,
      COUNT(*) FILTER (WHERE c.enterprise_id IS NULL AND u.enterprise_id IS NULL)::int AS null_with_user_enterprise_missing
    FROM "${TABLES.writerConversations}" c
    INNER JOIN "${TABLES.users}" u ON u.id = c.user_id
  `)

  const updatedRes = await client.query(`
    WITH updated_rows AS (
      UPDATE "${TABLES.writerConversations}" c
      SET enterprise_id = u.enterprise_id
      FROM "${TABLES.users}" u
      LEFT JOIN _session_enterprise_risky_users r ON r.user_id = u.id
      WHERE
        c.user_id = u.id
        AND c.enterprise_id IS NULL
        AND u.enterprise_id IS NOT NULL
        AND r.user_id IS NULL
      RETURNING c.id
    )
    SELECT COUNT(*)::int AS count FROM updated_rows
  `)

  const skippedRes = await client.query(`
    SELECT COUNT(*)::int AS count
    FROM "${TABLES.writerConversations}" c
    INNER JOIN "${TABLES.users}" u ON u.id = c.user_id
    INNER JOIN _session_enterprise_risky_users r ON r.user_id = u.id
    WHERE c.enterprise_id IS NULL AND u.enterprise_id IS NOT NULL
  `)

  const remainingRes = await client.query(`
    SELECT COUNT(*)::int AS count
    FROM "${TABLES.writerConversations}"
    WHERE enterprise_id IS NULL
  `)

  return {
    beforeNullWithUserEnterprise: toCount(beforeRes.rows[0], "null_with_user_enterprise"),
    beforeNullWithUserEnterpriseMissing: toCount(beforeRes.rows[0], "null_with_user_enterprise_missing"),
    updated: toCount(updatedRes.rows[0]),
    skippedRisky: toCount(skippedRes.rows[0]),
    remainingNull: toCount(remainingRes.rows[0]),
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const pool = new Pool(getMigrationPoolConfig())

  try {
    const client = await pool.connect()
    try {
      await client.query("BEGIN")

      const hasUsersTable = await tableExists(client, TABLES.users)
      if (!hasUsersTable) {
        throw new Error(`missing_required_table:${TABLES.users}`)
      }

      const tableAvailability = {
        imageDesignSessions: await tableExists(client, TABLES.imageDesignSessions),
        writerConversations: await tableExists(client, TABLES.writerConversations),
        enterpriseJoinRequests: await tableExists(client, TABLES.enterpriseJoinRequests),
      }

      await ensureIndexesAndColumns(client, tableAvailability)
      await createRiskyUsersTempTable(client, {
        hasJoinRequestTable: tableAvailability.enterpriseJoinRequests,
        includeRisky: args.includeRisky,
      })

      const riskyUsers = await collectRiskyUserSummary(client)
      const summary = {
        mode: args.execute ? "execute" : "dry-run",
        includeRisky: args.includeRisky,
        tableAvailability,
        riskyUsers,
        imageDesignSessions: tableAvailability.imageDesignSessions ? await backfillImageSessions(client) : null,
        writerConversations: tableAvailability.writerConversations ? await backfillWriterConversations(client) : null,
      }

      if (args.execute) {
        await client.query("COMMIT")
      } else {
        await client.query("ROLLBACK")
      }

      console.log(JSON.stringify(summary, null, 2))
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error("Backfill session enterprise_id failed:", error)
  process.exit(1)
})
