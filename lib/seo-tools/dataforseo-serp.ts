import "server-only"

export type DataForSeoOrganicResult = {
  rank: number | null
  title: string
  url: string
  domain: string | null
  description: string | null
}

export type DataForSeoSerpResult = {
  keyword: string
  locationCode: number
  languageCode: string
  fetchedAt: string
  organicResults: DataForSeoOrganicResult[]
  serpFeatures: string[]
}

const DATAFORSEO_SERP_CREDIT_ESTIMATE = 30

export function getDataForSeoSerpCreditEstimate() {
  return DATAFORSEO_SERP_CREDIT_ESTIMATE
}

function getDataForSeoCredentials() {
  const login = process.env.DATAFORSEO_LOGIN?.trim() || process.env.DATAFORSEO_USERNAME?.trim() || ""
  const password = process.env.DATAFORSEO_PASSWORD?.trim() || ""
  return { login, password }
}

export function isDataForSeoConfigured() {
  const { login, password } = getDataForSeoCredentials()
  return Boolean(login && password)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null
}

function asText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function normalizeOrganicResults(items: unknown, limit: number): DataForSeoOrganicResult[] {
  if (!Array.isArray(items)) return []
  return items
    .map((item) => {
      const record = asRecord(item)
      if (!record || record.type !== "organic") return null
      const title = asText(record.title)
      const url = asText(record.url)
      if (!title || !url) return null
      return {
        rank: typeof record.rank_absolute === "number" ? record.rank_absolute : null,
        title,
        url,
        domain: asText(record.domain),
        description: asText(record.description),
      }
    })
    .filter((item): item is DataForSeoOrganicResult => Boolean(item))
    .slice(0, limit)
}

function normalizeSerpFeatures(items: unknown) {
  if (!Array.isArray(items)) return []
  return [...new Set(items
    .map((item) => asRecord(item)?.type)
    .filter((value): value is string => typeof value === "string" && value !== "organic"))]
}

export async function fetchDataForSeoGoogleOrganicSerp(input: {
  keyword: string
  locationCode: number
  languageCode: string
  limit?: number
}): Promise<DataForSeoSerpResult> {
  const { login, password } = getDataForSeoCredentials()
  if (!login || !password) throw new Error("dataforseo_not_configured")

  const response = await fetch("https://api.dataforseo.com/v3/serp/google/organic/live/advanced", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([{
      keyword: input.keyword,
      location_code: input.locationCode,
      language_code: input.languageCode,
      depth: Math.min(Math.max(input.limit || 10, 1), 20),
    }]),
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`dataforseo_http_${response.status}`)
  const payload = await response.json() as { status_code?: unknown; tasks?: unknown[] }
  const task = Array.isArray(payload.tasks) ? asRecord(payload.tasks[0]) : null
  const taskStatus = typeof task?.status_code === "number" ? task.status_code : Number(payload.status_code || 0)
  if (taskStatus !== 20000) {
    throw new Error(`dataforseo_api_${taskStatus || "unknown"}`)
  }
  const taskResult = Array.isArray(task?.result) ? asRecord(task.result[0]) : null
  const items = taskResult?.items
  return {
    keyword: input.keyword,
    locationCode: input.locationCode,
    languageCode: input.languageCode,
    fetchedAt: new Date().toISOString(),
    organicResults: normalizeOrganicResults(items, Math.min(Math.max(input.limit || 10, 1), 20)),
    serpFeatures: normalizeSerpFeatures(items),
  }
}
