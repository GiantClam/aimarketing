const { Client } = require("pg")
require("./load-env")
const { getMigrationPoolConfig } = require("./get-db-connection")

const SOURCE_DATABASE_URL =
  process.env.AI_MARKETING_SOURCE_DATABASE_URL || process.env.SOURCE_DATABASE_URL || null

const TABLE_MAPPINGS = [
  { source: "enterprises", target: "AI_MARKETING_enterprises" },
  { source: "users", target: "AI_MARKETING_users" },
  { source: "enterprise_join_requests", target: "AI_MARKETING_enterprise_join_requests" },
  { source: "user_feature_permissions", target: "AI_MARKETING_user_feature_permissions" },
  { source: "user_sessions", target: "AI_MARKETING_user_sessions" },
  { source: "user_files", target: "AI_MARKETING_user_files" },
  { source: "n8n_connections", target: "AI_MARKETING_n8n_connections" },
  { source: "tasks", target: "AI_MARKETING_tasks" },
  { source: "dify_connections", target: "AI_MARKETING_dify_connections" },
  { source: "aimarketing_enterprise_dify_bindings", target: "AI_MARKETING_enterprise_dify_bindings" },
  { source: "aimarketing_enterprise_dify_datasets", target: "AI_MARKETING_enterprise_dify_datasets" },
  { source: "aimarketing_enterprise_dify_advisor_configs", target: "AI_MARKETING_enterprise_dify_advisor_configs" },
  { source: "writer_conversations", target: "AI_MARKETING_writer_conversations" },
  { source: "writer_messages", target: "AI_MARKETING_writer_messages" },
  { source: "image_design_sessions", target: "AI_MARKETING_image_design_sessions" },
  { source: "image_design_messages", target: "AI_MARKETING_image_design_messages" },
  { source: "image_design_assets", target: "AI_MARKETING_image_design_assets" },
  { source: "image_design_canvas_documents", target: "AI_MARKETING_image_design_canvas_documents" },
  { source: "image_design_versions", target: "AI_MARKETING_image_design_versions" },
  { source: "image_design_version_candidates", target: "AI_MARKETING_image_design_version_candidates" },
  { source: "image_design_canvas_layers", target: "AI_MARKETING_image_design_canvas_layers" },
  { source: "image_design_masks", target: "AI_MARKETING_image_design_masks" },
  { source: "image_design_exports", target: "AI_MARKETING_image_design_exports" },
]

const BATCH_SIZE = 100

function createSourceClient() {
  if (!SOURCE_DATABASE_URL) {
    throw new Error("AI_MARKETING_SOURCE_DATABASE_URL is required")
  }

  return new Client({
    connectionString: SOURCE_DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  })
}

function createTargetClient() {
  return new Client(getMigrationPoolConfig())
}

async function getColumns(client, tableName) {
  const result = await client.query(
    `
      select column_name
      from information_schema.columns
      where table_schema = 'public' and table_name = $1
      order by ordinal_position
    `,
    [tableName],
  )

  return result.rows.map((row) => row.column_name)
}

async function fetchRows(client, tableName, columns) {
  const orderBy = columns.includes("id") ? ' order by "id"' : ""
  const result = await client.query(`select * from "${tableName}"${orderBy}`)
  return result.rows
}

async function resetTargetTables(client) {
  const tables = TABLE_MAPPINGS.map((mapping) => `"${mapping.target}"`).join(", ")
  await client.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`)
}

async function insertBatch(client, tableName, columns, rows) {
  if (rows.length === 0) return

  const values = []
  const placeholders = []

  rows.forEach((row, rowIndex) => {
    const rowPlaceholders = columns.map((column, columnIndex) => {
      values.push(row[column])
      return `$${rowIndex * columns.length + columnIndex + 1}`
    })
    placeholders.push(`(${rowPlaceholders.join(", ")})`)
  })

  await client.query(
    `insert into "${tableName}" (${columns.map((column) => `"${column}"`).join(", ")}) values ${placeholders.join(", ")}`,
    values,
  )
}

async function setSequence(client, tableName) {
  const result = await client.query(
    `
      select pg_get_serial_sequence($1, 'id') as sequence_name,
             coalesce(max(id), 0) as max_id
      from "${tableName}"
    `,
    [`public."${tableName}"`],
  )

  const sequenceName = result.rows[0]?.sequence_name
  const maxId = Number(result.rows[0]?.max_id || 0)
  if (!sequenceName) return

  const nextValue = maxId > 0 ? maxId : 1
  await client.query(`select setval($1, $2, $3)`, [sequenceName, nextValue, maxId > 0])
}

async function migrateTable(sourceClient, targetClient, mapping) {
  const sourceColumns = await getColumns(sourceClient, mapping.source)
  const targetColumns = await getColumns(targetClient, mapping.target)
  const columns = sourceColumns.filter((column) => targetColumns.includes(column))

  const rows = await fetchRows(sourceClient, mapping.source, columns)
  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    await insertBatch(targetClient, mapping.target, columns, rows.slice(index, index + BATCH_SIZE))
  }

  if (columns.includes("id")) {
    await setSequence(targetClient, mapping.target)
  }

  return rows.length
}

async function verifyCounts(sourceClient, targetClient) {
  const report = []
  for (const mapping of TABLE_MAPPINGS) {
    const sourceCount = await sourceClient.query(`select count(*)::int as count from "${mapping.source}"`)
    const targetCount = await targetClient.query(`select count(*)::int as count from "${mapping.target}"`)
    report.push({
      source: mapping.source,
      target: mapping.target,
      sourceCount: sourceCount.rows[0].count,
      targetCount: targetCount.rows[0].count,
    })
  }
  return report
}

async function main() {
  const sourceClient = createSourceClient()
  const targetClient = createTargetClient()

  await sourceClient.connect()
  await targetClient.connect()

  try {
    await targetClient.query("BEGIN")
    await resetTargetTables(targetClient)

    const migrated = []
    for (const mapping of TABLE_MAPPINGS) {
      const count = await migrateTable(sourceClient, targetClient, mapping)
      migrated.push({ table: mapping.target, count })
    }

    await targetClient.query("COMMIT")

    const verification = await verifyCounts(sourceClient, targetClient)
    console.log(
      JSON.stringify(
        {
          ok: true,
          migrated,
          verification,
        },
        null,
        2,
      ),
    )
  } catch (error) {
    try {
      await targetClient.query("ROLLBACK")
    } catch {}
    throw error
  } finally {
    await sourceClient.end()
    await targetClient.end()
  }
}

main().catch((error) => {
  console.error("AI_MARKETING data migration failed:", error)
  process.exit(1)
})
