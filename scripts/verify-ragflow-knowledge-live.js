const { Client } = require("pg")

require("./load-env")
const { getMigrationPoolConfig } = require("./get-db-connection")

function normalizeBaseUrl(baseUrl) {
  const trimmed = String(baseUrl || "").trim().replace(/\/+$/, "")
  if (!trimmed) return ""
  return /\/api\/v1$/i.test(trimmed) ? trimmed : `${trimmed}/api/v1`
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function requestRagflow(source, route, init = {}) {
  const response = await fetch(`${normalizeBaseUrl(source.baseUrl)}${route}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${source.apiKey}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(payload?.message || `ragflow_http_${response.status}`)
  }
  if (typeof payload?.code === "number" && payload.code !== 0) {
    throw new Error(payload?.message || `ragflow_api_${payload.code}`)
  }
  return payload?.data
}

function extractDocumentIds(value) {
  const rows = Array.isArray(value) ? value : [value]
  return rows
    .map((row) => {
      if (!row || typeof row !== "object") return null
      if (typeof row.document_id === "string" && row.document_id) return row.document_id
      if (typeof row.documentId === "string" && row.documentId) return row.documentId
      if (typeof row.id === "string" && row.id) return row.id
      return null
    })
    .filter(Boolean)
}

async function loadSource(client, enterpriseId) {
  const stored = await client.query(
    `select id, enterprise_id, provider_type, name, base_url, api_key, status, enabled
     from "AI_MARKETING_enterprise_knowledge_sources"
     where enterprise_id = $1 and provider_type = 'ragflow'
     order by id desc
     limit 1`,
    [enterpriseId],
  )

  const row = stored.rows[0] || null
  const envBaseUrl = process.env.RAGFLOW_BASE_URL?.trim() || ""
  const envApiKey = process.env.RAGFLOW_API_KEY?.trim() || ""
  if (envBaseUrl && envApiKey) {
    return {
      id: row?.id || null,
      enterpriseId,
      name: row?.name || "RAGFlow Enterprise Knowledge",
      baseUrl: envBaseUrl,
      apiKey: envApiKey,
      enabled: true,
    }
  }

  if (row?.base_url && row?.api_key) {
    return {
      id: row.id,
      enterpriseId,
      name: row.name,
      baseUrl: row.base_url,
      apiKey: row.api_key,
      enabled: row.enabled !== false,
    }
  }

  return null
}

async function upsertSource(client, source) {
  const existing = await client.query(
    `select id
     from "AI_MARKETING_enterprise_knowledge_sources"
     where enterprise_id = $1 and provider_type = 'ragflow'
     limit 1`,
    [source.enterpriseId],
  )

  if (existing.rows[0]?.id) {
    const updated = await client.query(
      `update "AI_MARKETING_enterprise_knowledge_sources"
       set name = $2,
           base_url = $3,
           api_key = $4,
           status = 'healthy',
           enabled = true,
           last_checked_at = now(),
           last_error = null,
           updated_at = now()
       where id = $1
       returning id`,
      [existing.rows[0].id, source.name, source.baseUrl, source.apiKey],
    )
    return updated.rows[0].id
  }

  const inserted = await client.query(
    `insert into "AI_MARKETING_enterprise_knowledge_sources"
      (enterprise_id, provider_type, name, base_url, api_key, status, enabled, last_checked_at, created_at, updated_at)
     values ($1, 'ragflow', $2, $3, $4, 'healthy', true, now(), now(), now())
     returning id`,
    [source.enterpriseId, source.name, source.baseUrl, source.apiKey],
  )
  return inserted.rows[0].id
}

async function syncDataset(client, enterpriseId, sourceId, remoteDataset) {
  const existing = await client.query(
    `select id
     from "AI_MARKETING_enterprise_knowledge_datasets"
     where source_id = $1 and provider_dataset_id = $2
     limit 1`,
    [sourceId, remoteDataset.id],
  )

  if (existing.rows[0]?.id) {
    await client.query(
      `update "AI_MARKETING_enterprise_knowledge_datasets"
       set name = $3, enabled = true, updated_at = now()
       where id = $1 and source_id = $2`,
      [existing.rows[0].id, sourceId, remoteDataset.name],
    )
    return existing.rows[0].id
  }

  const inserted = await client.query(
    `insert into "AI_MARKETING_enterprise_knowledge_datasets"
      (enterprise_id, source_id, provider_dataset_id, name, category, priority, enabled, created_at, updated_at)
     values ($1, $2, $3, $4, 'general', 100, true, now(), now())
     returning id`,
    [enterpriseId, sourceId, remoteDataset.id, remoteDataset.name],
  )
  return inserted.rows[0].id
}

async function uploadDocument(source, datasetId, text, fileName) {
  const formData = new FormData()
  formData.append("file", new File([Buffer.from(text)], fileName, { type: "text/plain" }))
  const response = await fetch(`${normalizeBaseUrl(source.baseUrl)}/datasets/${datasetId}/documents`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${source.apiKey}`,
    },
    body: formData,
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(payload?.message || `ragflow_document_upload_${response.status}`)
  }
  if (typeof payload?.code === "number" && payload.code !== 0) {
    throw new Error(payload?.message || `ragflow_api_${payload.code}`)
  }

  const documentIds = extractDocumentIds(payload?.data)
  if (documentIds.length === 0) {
    throw new Error("ragflow_document_upload_missing_document_id")
  }

  await requestRagflow(source, `/datasets/${datasetId}/chunks`, {
    method: "POST",
    body: JSON.stringify({ document_ids: documentIds }),
  })

  return documentIds[0]
}

async function waitForDocumentReady(source, datasetId, documentId) {
  const deadline = Date.now() + 180000
  let lastSeen = null

  while (Date.now() < deadline) {
    const data = await requestRagflow(source, `/datasets/${datasetId}/documents?page=1&page_size=100`, {
      method: "GET",
    })
    const docs = Array.isArray(data?.docs) ? data.docs : Array.isArray(data) ? data : []
    const match = docs.find((item) => {
      if (!item || typeof item !== "object") return false
      return item.id === documentId || item.document_id === documentId || item.documentId === documentId
    })

    if (match) {
      lastSeen = {
        id: match.id || match.document_id || match.documentId || documentId,
        run: match.run || null,
        progress: match.progress ?? null,
        chunkCount: match.chunk_count ?? match.chunkCount ?? null,
      }

      const run = String(match.run || "").toUpperCase()
      const chunkCount = Number(match.chunk_count ?? match.chunkCount ?? 0)
      if ((run === "DONE" || run === "SUCCESS" || run === "FINISH" || run === "GREEN") && chunkCount > 0) {
        return lastSeen
      }
      if (chunkCount > 0 && (run === "" || run === "1")) {
        return lastSeen
      }
    }

    await sleep(5000)
  }

  throw new Error(`ragflow_document_not_ready:${JSON.stringify(lastSeen)}`)
}

async function runRetrieval(source, datasetId, query) {
  const data = await requestRagflow(source, "/retrieval", {
    method: "POST",
    body: JSON.stringify({
      question: query,
      dataset_ids: [datasetId],
      top_k: 3,
      similarity_threshold: 0.2,
    }),
  })

  return Array.isArray(data?.chunks) ? data.chunks : Array.isArray(data) ? data : []
}

async function main() {
  const enterpriseId = Number(process.env.RAGFLOW_TEST_ENTERPRISE_ID || "1")
  if (!Number.isFinite(enterpriseId) || enterpriseId <= 0) {
    throw new Error("RAGFLOW_TEST_ENTERPRISE_ID must be a positive integer")
  }

  const client = new Client(getMigrationPoolConfig())
  let source
  let dataset

  try {
    await client.connect()
    source = await loadSource(client, enterpriseId)
    if (!source) {
      throw new Error(
        "Missing RAGFlow live config. Set RAGFLOW_BASE_URL and RAGFLOW_API_KEY, or save a ragflow source in AI_MARKETING_enterprise_knowledge_sources.",
      )
    }

    const sourceId = await upsertSource(client, source)
    const remoteDatasets = await requestRagflow(source, "/datasets", { method: "GET" })
    const datasets = Array.isArray(remoteDatasets)
      ? remoteDatasets
          .map((item) => ({
            id: typeof item?.id === "string" ? item.id : "",
            name: typeof item?.name === "string" ? item.name : "Untitled dataset",
          }))
          .filter((item) => item.id)
      : []

    if (datasets.length === 0) {
      throw new Error("ragflow_remote_dataset_missing")
    }

    const requestedDatasetId = process.env.RAGFLOW_TEST_DATASET_ID?.trim() || ""
    dataset = datasets.find((item) => item.id === requestedDatasetId) || datasets[0]
    await syncDataset(client, enterpriseId, sourceId, dataset)
  } finally {
    await client.end()
  }

  if (!source || !dataset) {
    throw new Error("ragflow_live_validation_setup_incomplete")
  }

  const token = `ragflow-live-${Date.now()}`
  const content = `RAGFlow live validation token ${token}. This document verifies enterprise knowledge retrieval.`
  const documentId = await uploadDocument(source, dataset.id, content, `${token}.txt`)
  const readyState = await waitForDocumentReady(source, dataset.id, documentId)
  const hits = await runRetrieval(source, dataset.id, token)
  const matched = hits.find((item) => {
    const text = [item?.content, item?.chunk, item?.text].find((value) => typeof value === "string") || ""
    return text.includes(token)
  })

  if (!matched) {
    throw new Error(`ragflow_retrieval_miss:${token}`)
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        enterpriseId,
        datasetId: dataset.id,
        datasetName: dataset.name,
        documentId,
        readyState,
        retrievalHitPreview: String(matched.content || matched.chunk || matched.text || "").slice(0, 200),
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
