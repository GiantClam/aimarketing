import type { EnterpriseKnowledgeContext, EnterpriseKnowledgeScope } from "@/lib/knowledge/types"

type WriterEnterpriseSearchInput = {
  authenticatedEnterpriseId: number | null | undefined
  requestedEnterpriseId?: unknown
  query: string
  queryVariants?: string[]
  preferredScopes?: EnterpriseKnowledgeScope[]
  platform: string
  mode: string
}

type WriterEnterpriseSearchRetriever = (input: {
  enterpriseId: number
  query: string
  queryVariants?: string[]
  preferredScopes?: EnterpriseKnowledgeScope[]
  platform: string
  mode: string
}) => Promise<EnterpriseKnowledgeContext | null>

type WriterEnterpriseSearchDeps = {
  retrieve?: WriterEnterpriseSearchRetriever
}

const SECRET_PATTERN = /(?:api[_ -]?key|access[_ -]?token|secret|password|authorization)\s*[:=]\s*[^,;\n]*(?:[,;]\s*|$)/giu
const MAX_QUERY_CHARS = 240
const MAX_VARIANTS = 4
const MAX_SNIPPETS = 12

function normalizeQuery(value: string) {
  return value.replace(/\s+/gu, " ").trim().slice(0, MAX_QUERY_CHARS)
}

function sanitizeText(value: string) {
  return value.replace(SECRET_PATTERN, "").replace(/\s{2,}/gu, " ").trim().slice(0, 1200)
}

function sanitizeContext(context: EnterpriseKnowledgeContext): EnterpriseKnowledgeContext {
  return {
    source: context.source,
    datasetsUsed: context.datasetsUsed.slice(0, MAX_SNIPPETS).map((dataset) => ({
      datasetId: sanitizeText(dataset.datasetId),
      datasetName: sanitizeText(dataset.datasetName),
      scope: dataset.scope,
    })),
    snippets: context.snippets.slice(0, MAX_SNIPPETS).map((snippet) => ({
      datasetId: sanitizeText(snippet.datasetId),
      datasetName: sanitizeText(snippet.datasetName),
      scope: snippet.scope,
      ...(snippet.inferredScope ? { inferredScope: snippet.inferredScope } : {}),
      score: typeof snippet.score === "number" && Number.isFinite(snippet.score) ? snippet.score : null,
      title: sanitizeText(snippet.title),
      content: sanitizeText(snippet.content),
    })),
  }
}

async function defaultRetrieve(input: Parameters<WriterEnterpriseSearchRetriever>[0]) {
  const { loadEnterpriseKnowledgeContext } = await import("@/lib/knowledge/service")
  return loadEnterpriseKnowledgeContext(input)
}

/**
 * Read-only Writer enterprise search boundary. The authenticated scope is the
 * only enterprise identity forwarded to the knowledge service; any model- or
 * client-supplied requestedEnterpriseId is intentionally ignored.
 */
export async function searchWriterEnterpriseKnowledge(
  input: WriterEnterpriseSearchInput,
  deps: WriterEnterpriseSearchDeps = {},
) {
  const enterpriseId = input.authenticatedEnterpriseId
  const query = normalizeQuery(input.query)
  if (typeof enterpriseId !== "number" || !Number.isInteger(enterpriseId) || enterpriseId <= 0 || !query) return null
  const authenticatedEnterpriseId = enterpriseId as number

  const queryVariants = [...new Set((input.queryVariants || []).map(normalizeQuery).filter(Boolean))].slice(0, MAX_VARIANTS)
  const retrieve = deps.retrieve || defaultRetrieve
  const context = await retrieve({
    enterpriseId: authenticatedEnterpriseId,
    query,
    queryVariants,
    preferredScopes: input.preferredScopes,
    platform: input.platform,
    mode: input.mode,
  })
  return context ? sanitizeContext(context) : null
}
