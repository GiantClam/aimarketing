import { tool, type ToolSet } from "ai"
import { z } from "zod"

import {
  hasAnyWebSearchProviderConfig,
  searchWithSerperWeb,
  searchWithTavilyWeb,
  type WebSearchHit,
} from "@/lib/skills/tools/web-search"

const WEB_SEARCH_MAX_RESULTS = 6

export type AiEntryWebSearchToolPolicy = "standard" | "consulting-speed"

function dedupeHits(hits: WebSearchHit[]) {
  const seen = new Set<string>()
  const output: WebSearchHit[] = []
  for (const hit of hits) {
    const key = hit.url.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    output.push(hit)
  }
  return output
}

function getWebSearchToolDescription(policy: AiEntryWebSearchToolPolicy) {
  if (policy === "consulting-speed") {
    return [
      "Search the public web only when the user's intent truly requires fresh, current, external, or verifiable public information.",
      "In consulting speed mode, do not search for evergreen diagnosis, strategy, funnel, messaging, operations, or general best-practice questions.",
      "Return concise sources and cite URLs in the final answer.",
    ].join(" ")
  }

  return "Search the public web when the user's intent requires fresh, external, or verifiable information. Use this based on intent, not fixed keywords. Return concise sources and cite URLs in the final answer."
}

export function buildAiEntryWebSearchTools(
  options?: { policy?: AiEntryWebSearchToolPolicy },
): ToolSet {
  if (!hasAnyWebSearchProviderConfig()) return {} as ToolSet
  const policy = options?.policy || "standard"

  return {
    web_search: tool({
      description: getWebSearchToolDescription(policy),
      inputSchema: z.object({
        query: z.string().min(2).describe("A focused web search query generated from the user's intent."),
        intent: z.string().optional().describe("Why fresh external evidence is needed for this request."),
        maxResults: z.number().int().min(1).max(10).optional(),
      }),
      execute: async ({ query, intent, maxResults }) => {
        const limit = Math.min(Math.max(maxResults ?? WEB_SEARCH_MAX_RESULTS, 1), 10)
        const [serperHits, tavilyHits] = await Promise.all([
          searchWithSerperWeb(query, { num: limit }).catch(() => []),
          searchWithTavilyWeb(query, { maxResults: limit, searchDepth: "basic" }).catch(() => []),
        ])
        const results = dedupeHits([...serperHits, ...tavilyHits]).slice(0, limit)
        return {
          query,
          intent: intent || null,
          searchedAt: new Date().toISOString(),
          results,
        }
      },
    }),
  } as ToolSet
}
