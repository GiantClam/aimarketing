import { createRequire } from "node:module"

import { Pool } from "pg"

import "./load-env"

const bootstrapRequire = createRequire(import.meta.url)
bootstrapRequire("./register-server-only-shim.cjs")

const { getMigrationPoolConfig } = bootstrapRequire("./get-db-connection")

type EnterpriseRow = {
  id: number
  enterprise_code: string
  name: string
}

function parseArgs() {
  const args = process.argv.slice(2)
  const ids = new Set<number>()
  const codes = new Set<string>()
  let dryRun = false
  let onlyMissing = false
  let limit: number | null = null

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === "--dry-run") {
      dryRun = true
      continue
    }
    if (arg === "--only-missing") {
      onlyMissing = true
      continue
    }
    if (arg === "--limit") {
      const raw = Number(args[index + 1])
      if (Number.isInteger(raw) && raw > 0) {
        limit = raw
      }
      index += 1
      continue
    }
    if (arg === "--enterprise-id") {
      const raw = args[index + 1]
      const value = Number(raw)
      if (Number.isInteger(value) && value > 0) {
        ids.add(value)
      }
      index += 1
      continue
    }
    if (arg === "--enterprise-code") {
      const raw = String(args[index + 1] || "").trim().toLowerCase()
      if (raw) {
        codes.add(raw)
      }
      index += 1
    }
  }

  return { ids, codes, dryRun, onlyMissing, limit }
}

async function loadEnterprises(pool: Pool, filters: ReturnType<typeof parseArgs>) {
  const result = await pool.query<EnterpriseRow>(`
    SELECT id, enterprise_code, name
    FROM "AI_MARKETING_enterprises"
    ORDER BY id ASC
  `)

  if (filters.ids.size === 0 && filters.codes.size === 0) {
    return result.rows
  }

  return result.rows.filter(
    (row) => filters.ids.has(row.id) || filters.codes.has(String(row.enterprise_code || "").trim().toLowerCase()),
  )
}

async function run() {
  const [{ ensureEnterpriseDefaultKnowledgeWorkspace, getKnowledgeSource }, { listKnowledgeDatasetsByEnterprise }] =
    await Promise.all([import("@/lib/knowledge/service"), import("@/lib/knowledge/repository")])

  const pool = new Pool(getMigrationPoolConfig())
  const filters = parseArgs()

  try {
    const enterprises = await loadEnterprises(pool, filters)
    const summary = []
    let processedCount = 0

    for (const enterprise of enterprises) {
      const beforeSource = await getKnowledgeSource(enterprise.id).catch(() => null)
      const beforeDatasets = await listKnowledgeDatasetsByEnterprise(enterprise.id).catch(() => [])

      if (!beforeSource?.enabled) {
        summary.push({
          enterpriseId: enterprise.id,
          enterpriseCode: enterprise.enterprise_code,
          enterpriseName: enterprise.name,
          status: "skipped_no_ragflow_source",
          datasetCountBefore: beforeDatasets.length,
          datasetCountAfter: beforeDatasets.length,
        })
        continue
      }

      if (filters.onlyMissing && beforeDatasets.length > 0) {
        summary.push({
          enterpriseId: enterprise.id,
          enterpriseCode: enterprise.enterprise_code,
          enterpriseName: enterprise.name,
          status: "skipped_existing_dataset",
          sourceName: beforeSource.name,
          datasetCountBefore: beforeDatasets.length,
          datasetCountAfter: beforeDatasets.length,
        })
        continue
      }

      if (typeof filters.limit === "number" && processedCount >= filters.limit) {
        break
      }
      processedCount += 1

      if (filters.dryRun) {
        summary.push({
          enterpriseId: enterprise.id,
          enterpriseCode: enterprise.enterprise_code,
          enterpriseName: enterprise.name,
          status: beforeDatasets.length > 0 ? "would_keep_existing" : "would_initialize_default_dataset",
          sourceName: beforeSource.name,
          datasetCountBefore: beforeDatasets.length,
          datasetCountAfter: beforeDatasets.length > 0 ? beforeDatasets.length : 1,
        })
        continue
      }

      const result = await ensureEnterpriseDefaultKnowledgeWorkspace(enterprise.id)
      const afterDatasets = await listKnowledgeDatasetsByEnterprise(enterprise.id).catch(() => result.datasets)

      summary.push({
        enterpriseId: enterprise.id,
        enterpriseCode: enterprise.enterprise_code,
        enterpriseName: enterprise.name,
        status: beforeDatasets.length > 0 ? "kept_existing" : "initialized_default_dataset",
        sourceName: result.source?.name || beforeSource.name,
        datasetCountBefore: beforeDatasets.length,
        datasetCountAfter: afterDatasets.length,
        datasets: afterDatasets.map((dataset) => ({
          id: dataset.id,
          name: dataset.name,
          providerDatasetId: dataset.providerDatasetId,
          category: dataset.category,
          enabled: dataset.enabled,
        })),
      })
    }

    const statusCounts = summary.reduce<Record<string, number>>((acc, item) => {
      const key = String(item.status || "unknown")
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})

    console.log(
      JSON.stringify(
        {
          ok: true,
          filters: {
            enterpriseIds: [...filters.ids],
            enterpriseCodes: [...filters.codes],
            dryRun: filters.dryRun,
            onlyMissing: filters.onlyMissing,
            limit: filters.limit,
          },
          ragflowEnvConfigured: Boolean(process.env.RAGFLOW_BASE_URL?.trim() && process.env.RAGFLOW_API_KEY?.trim()),
          matchedEnterpriseCount: enterprises.length,
          processedEnterpriseCount: processedCount,
          summaryCount: summary.length,
          statusCounts,
          summary,
        },
        null,
        2,
      ),
    )
  } finally {
    await pool.end()
  }
}

run()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error("seed-enterprise-ragflow-defaults failed:", error)
    process.exit(1)
  })
