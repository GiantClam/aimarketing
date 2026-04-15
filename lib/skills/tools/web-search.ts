import { writerRequestJson } from "@/lib/writer/network"

export type WebSearchProvider = "serper" | "tavily"

export type WebSearchHit = {
  title: string
  url: string
  snippet: string
  provider: WebSearchProvider
}

function getTavilyApiBase() {
  return (process.env.TAVILY_API_BASE || "https://api.tavily.com").replace(/\/+$/, "")
}

function getTavilyApiKey() {
  return (process.env.TAVILY_API_KEY || "").trim()
}

function getSerperApiBase() {
  return (process.env.SERPER_API_BASE || "https://google.serper.dev").replace(/\/+$/, "")
}

function getSerperApiKey() {
  return (process.env.SERPER_API_KEY || "").trim()
}

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim()
}

export function hasSerperWebSearchConfig() {
  return Boolean(getSerperApiKey())
}

export function hasTavilyWebSearchConfig() {
  return Boolean(getTavilyApiKey())
}

export function hasAnyWebSearchProviderConfig() {
  return hasSerperWebSearchConfig() || hasTavilyWebSearchConfig()
}

export async function searchWithSerperWeb(
  query: string,
  options?: { signal?: AbortSignal; num?: number },
): Promise<WebSearchHit[]> {
  const apiKey = getSerperApiKey()
  if (!apiKey) return []

  const response = await writerRequestJson<{ organic?: Array<{ title?: string; snippet?: string; link?: string }> }>(
    `${getSerperApiBase()}/search`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify({
        q: query,
        num: Math.min(Math.max(options?.num ?? 6, 1), 10),
      }),
      signal: options?.signal,
    },
    { attempts: 2, timeoutMs: 60_000 },
  )

  if (!response.ok) {
    throw new Error(`serper_search_http_${response.status}`)
  }

  const organic = Array.isArray(response.data?.organic) ? response.data.organic : []
  return organic
    .map((item) => ({
      title: normalizeWhitespace(item.title || ""),
      url: normalizeWhitespace(item.link || ""),
      snippet: normalizeWhitespace(item.snippet || ""),
      provider: "serper" as const,
    }))
    .filter((item) => item.url)
}

export async function searchWithTavilyWeb(
  query: string,
  options?: {
    signal?: AbortSignal
    maxResults?: number
    searchDepth?: "basic" | "advanced"
    includeAnswer?: boolean
    includeRawContent?: boolean
  },
): Promise<WebSearchHit[]> {
  const apiKey = getTavilyApiKey()
  if (!apiKey) return []

  const response = await writerRequestJson<{
    results?: Array<{ title?: string; url?: string; content?: string }>
    answer?: string
  }>(
    `${getTavilyApiBase()}/search`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: options?.maxResults ?? 5,
        search_depth: options?.searchDepth || "basic",
        include_answer: options?.includeAnswer ?? true,
        include_raw_content: options?.includeRawContent ?? false,
      }),
      signal: options?.signal,
    },
    { attempts: 2, timeoutMs: 75_000 },
  )

  if (!response.ok) {
    throw new Error(`tavily_search_http_${response.status}`)
  }

  const results = Array.isArray(response.data?.results) ? response.data.results : []
  return results
    .map((item) => ({
      title: normalizeWhitespace(item.title || ""),
      url: normalizeWhitespace(item.url || ""),
      snippet: normalizeWhitespace(item.content || response.data?.answer || ""),
      provider: "tavily" as const,
    }))
    .filter((item) => item.url)
}
