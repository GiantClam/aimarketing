import "./load-env"

import { createRequire } from "node:module"
import fs from "node:fs"

import { Pool } from "pg"

const bootstrapRequire = createRequire(import.meta.url)
bootstrapRequire("./register-server-only-shim.cjs")

const { getMigrationPoolConfig } = bootstrapRequire("./get-db-connection")

type QueryRow = {
  artifact_id: number
  enterprise_id: number
  enterprise_code: string | null
  run_id: number
  owner_user_id: number
  kind: string
  title: string
  mime_type: string | null
  storage_key: string | null
  external_url: string | null
  payload: Record<string, unknown> | null
  created_at: Date | string | null
  reference_count: number
  has_work_item: boolean
}

type AuditRow = {
  artifactId: number
  enterpriseId: number
  enterpriseCode: string | null
  runId: number
  ownerUserId: number
  kind: string
  title: string
  mimeType: string | null
  sourceType: string | null
  createdAt: string | null
  referenceCount: number
  hasWorkItem: boolean
  storageKey: string | null
  externalUrl: string | null
  hasEmbeddedContent: boolean
  hasInlineText: boolean
  reason: "missing_backing_content"
}

type Args = {
  enterpriseIds: number[]
  artifactIds: number[]
  limit: number | null
  format: "json" | "csv"
  outputPath: string | null
}

function printHelp() {
  console.log(
    [
      "Usage: pnpm exec tsx scripts/audit-unavailable-platform-artifacts.ts [options]",
      "",
      "Options:",
      "  --enterprise-id <id>   Limit to one or more enterprise ids",
      "  --artifact-id <id>     Limit to one or more artifact ids",
      "  --limit <n>            Limit scanned rows after SQL ordering",
      "  --format <json|csv>    Output format (default: json)",
      "  --output <path>        Write output to a file instead of stdout",
      "  --help                 Show this help",
    ].join("\n"),
  )
}

function parseArgs(argv: string[]): Args {
  const enterpriseIds: number[] = []
  const artifactIds: number[] = []
  let limit: number | null = null
  let format: "json" | "csv" = "json"
  let outputPath: string | null = null

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === "--help") {
      printHelp()
      process.exit(0)
    }
    if (arg === "--enterprise-id") {
      const value = Number(argv[index + 1])
      if (Number.isInteger(value) && value > 0) {
        enterpriseIds.push(value)
      }
      index += 1
      continue
    }
    if (arg === "--artifact-id") {
      const value = Number(argv[index + 1])
      if (Number.isInteger(value) && value > 0) {
        artifactIds.push(value)
      }
      index += 1
      continue
    }
    if (arg === "--limit") {
      const value = Number(argv[index + 1])
      if (Number.isInteger(value) && value > 0) {
        limit = value
      }
      index += 1
      continue
    }
    if (arg === "--format") {
      const value = String(argv[index + 1] || "").trim().toLowerCase()
      if (value === "json" || value === "csv") {
        format = value
      }
      index += 1
      continue
    }
    if (arg === "--output") {
      const value = String(argv[index + 1] || "").trim()
      outputPath = value || null
      index += 1
    }
  }

  return { enterpriseIds, artifactIds, limit, format, outputPath }
}

function hasEmbeddedContent(payload: Record<string, unknown> | null) {
  return typeof payload?.embeddedContentBase64 === "string" && payload.embeddedContentBase64.trim().length > 0
}

function hasInlineText(payload: Record<string, unknown> | null) {
  return typeof payload?.text === "string" && payload.text.trim().length > 0
}

function readSourceType(payload: Record<string, unknown> | null) {
  return typeof payload?.source === "string" ? payload.source : null
}

function isAccessible(row: QueryRow) {
  if (row.storage_key?.trim()) return true
  if (row.external_url?.trim()) return true
  if (hasEmbeddedContent(row.payload)) return true
  if (hasInlineText(row.payload)) return true
  return false
}

function toAuditRow(row: QueryRow): AuditRow {
  return {
    artifactId: row.artifact_id,
    enterpriseId: row.enterprise_id,
    enterpriseCode: row.enterprise_code,
    runId: row.run_id,
    ownerUserId: row.owner_user_id,
    kind: row.kind,
    title: row.title,
    mimeType: row.mime_type,
    sourceType: readSourceType(row.payload),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    referenceCount: Number(row.reference_count || 0),
    hasWorkItem: Boolean(row.has_work_item),
    storageKey: row.storage_key,
    externalUrl: row.external_url,
    hasEmbeddedContent: hasEmbeddedContent(row.payload),
    hasInlineText: hasInlineText(row.payload),
    reason: "missing_backing_content",
  }
}

function toCsv(rows: AuditRow[]) {
  const columns: Array<keyof AuditRow> = [
    "artifactId",
    "enterpriseId",
    "enterpriseCode",
    "runId",
    "ownerUserId",
    "kind",
    "title",
    "mimeType",
    "sourceType",
    "createdAt",
    "referenceCount",
    "hasWorkItem",
    "storageKey",
    "externalUrl",
    "hasEmbeddedContent",
    "hasInlineText",
    "reason",
  ]

  const quote = (value: unknown) => {
    const stringValue = value == null ? "" : String(value)
    return `"${stringValue.replaceAll("\"", "\"\"")}"`
  }

  return [columns.join(","), ...rows.map((row) => columns.map((column) => quote(row[column])).join(","))].join("\n")
}

async function fetchRows(pool: Pool, args: Args) {
  const values: Array<number> = []
  const where: string[] = []

  if (args.enterpriseIds.length > 0) {
    const placeholders = args.enterpriseIds.map((value) => {
      values.push(value)
      return `$${values.length}`
    })
    where.push(`a.enterprise_id IN (${placeholders.join(", ")})`)
  }

  if (args.artifactIds.length > 0) {
    const placeholders = args.artifactIds.map((value) => {
      values.push(value)
      return `$${values.length}`
    })
    where.push(`a.id IN (${placeholders.join(", ")})`)
  }

  let limitClause = ""
  if (args.limit) {
    values.push(args.limit)
    limitClause = `LIMIT $${values.length}`
  }

  const query = `
    SELECT
      a.id AS artifact_id,
      a.enterprise_id,
      e.enterprise_code,
      a.run_id,
      a.owner_user_id,
      a.kind,
      a.title,
      a.mime_type,
      a.storage_key,
      a.external_url,
      a.payload,
      a.created_at,
      COUNT(w.id)::int AS reference_count,
      BOOL_OR(w.id IS NOT NULL) AS has_work_item
    FROM "AI_MARKETING_platform_artifacts" a
    LEFT JOIN "AI_MARKETING_enterprises" e
      ON e.id = a.enterprise_id
    LEFT JOIN "AI_MARKETING_platform_work_items" w
      ON w.source_artifact_id = a.id
      AND w.enterprise_id = a.enterprise_id
    ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
    GROUP BY
      a.id,
      a.enterprise_id,
      e.enterprise_code,
      a.run_id,
      a.owner_user_id,
      a.kind,
      a.title,
      a.mime_type,
      a.storage_key,
      a.external_url,
      a.payload,
      a.created_at
    ORDER BY a.created_at DESC NULLS LAST, a.id DESC
    ${limitClause}
  `

  const result = await pool.query<QueryRow>(query, values)
  return result.rows
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const pool = new Pool(getMigrationPoolConfig())

  try {
    const rows = await fetchRows(pool, args)
    const unavailableRows = rows.filter((row) => !isAccessible(row)).map(toAuditRow)

    const summary = {
      scanned: rows.length,
      unavailable: unavailableRows.length,
      byEnterprise: unavailableRows.reduce<Record<string, number>>((acc, row) => {
        const key = row.enterpriseCode || String(row.enterpriseId)
        acc[key] = (acc[key] || 0) + 1
        return acc
      }, {}),
      bySourceType: unavailableRows.reduce<Record<string, number>>((acc, row) => {
        const key = row.sourceType || "unknown"
        acc[key] = (acc[key] || 0) + 1
        return acc
      }, {}),
    }

    const output =
      args.format === "csv"
        ? toCsv(unavailableRows)
        : JSON.stringify({ generatedAt: new Date().toISOString(), summary, rows: unavailableRows }, null, 2)

    if (args.outputPath) {
      fs.writeFileSync(args.outputPath, output, "utf8")
      console.log(`Wrote ${unavailableRows.length} unavailable artifacts to ${args.outputPath}`)
      return
    }

    console.log(output)
  } finally {
    await pool.end().catch(() => undefined)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
