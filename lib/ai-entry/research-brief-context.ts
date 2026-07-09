type SearchResultLike = {
  title?: unknown
  url?: unknown
  snippet?: unknown
}

type WebSearchResultLike = {
  query?: unknown
  intent?: unknown
  results?: unknown
}

export type StructuredResearchBrief = {
  topic: string
  keyFacts: string[]
  numericEvidence?: string[]
  risks?: string[]
  implications?: string[]
  sourceNotes?: string[]
  rawSummary?: string
}

const RESEARCH_BRIEF_CONTEXT_PREFIX = "<!-- ai-entry-research-brief:"
const RESEARCH_BRIEF_CONTEXT_SUFFIX = "-->"
const MAX_RESEARCH_BRIEF_CHARS = 2_000
const MAX_ATTACHMENT_BRIEF_FACTS = 5

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

function trimToLength(value: string, maxChars: number) {
  if (value.length <= maxChars) return value
  return `${value.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`
}

function normalizeStringList(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => normalizeOptionalText(item))
        .filter((item): item is string => Boolean(item))
    : []
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return [...new Set(values.map((item) => normalizeOptionalText(item)).filter((item): item is string => Boolean(item)))]
}

function normalizeStructuredResearchBrief(value: unknown): StructuredResearchBrief | null {
  if (!value || typeof value !== "object") return null

  const record = value as StructuredResearchBrief
  const topic = normalizeOptionalText(record.topic)
  const keyFacts = normalizeStringList(record.keyFacts)

  if (!topic || keyFacts.length === 0) {
    return null
  }

  const brief: StructuredResearchBrief = {
    topic,
    keyFacts,
  }

  const numericEvidence = normalizeStringList(record.numericEvidence)
  if (numericEvidence.length > 0) {
    brief.numericEvidence = numericEvidence
  }

  const risks = normalizeStringList(record.risks)
  if (risks.length > 0) {
    brief.risks = risks
  }

  const implications = normalizeStringList(record.implications)
  if (implications.length > 0) {
    brief.implications = implications
  }

  const sourceNotes = normalizeStringList(record.sourceNotes)
  if (sourceNotes.length > 0) {
    brief.sourceNotes = sourceNotes
  }

  brief.rawSummary = normalizeOptionalText(record.rawSummary) || buildResearchBriefSummary(brief)
  return brief
}

export function buildResearchBriefSummary(brief: StructuredResearchBrief) {
  const lines = [
    `Topic: ${brief.topic}`,
    brief.keyFacts.length ? `Key facts:\n- ${brief.keyFacts.join("\n- ")}` : null,
    brief.numericEvidence?.length ? `Numeric evidence:\n- ${brief.numericEvidence.join("\n- ")}` : null,
    brief.risks?.length ? `Risks:\n- ${brief.risks.join("\n- ")}` : null,
    brief.implications?.length ? `Implications:\n- ${brief.implications.join("\n- ")}` : null,
    brief.sourceNotes?.length ? `Source notes:\n- ${brief.sourceNotes.join("\n- ")}` : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n")

  return trimToLength(lines, MAX_RESEARCH_BRIEF_CHARS)
}

export function buildResearchBriefFromWebSearchResult(result: unknown): StructuredResearchBrief | null {
  if (!result || typeof result !== "object") return null

  const payload = result as WebSearchResultLike
  const query = normalizeOptionalText(payload.query)
  const intent = normalizeOptionalText(payload.intent)
  const results = Array.isArray(payload.results) ? payload.results : []

  if (!query || results.length === 0) {
    return null
  }

  const normalizedResults = results
    .map((item) => {
      const row = item as SearchResultLike
      return {
        title: normalizeOptionalText(row?.title),
        url: normalizeOptionalText(row?.url),
        snippet: normalizeOptionalText(row?.snippet),
      }
    })
    .filter((item) => item.title || item.url || item.snippet)
    .slice(0, 4)

  if (normalizedResults.length === 0) {
    return null
  }

  const keyFacts = normalizedResults
    .map((item) => normalizeWhitespace(item.snippet || item.title || ""))
    .filter(Boolean)
    .slice(0, 4)

  const sourceNotes = normalizedResults
    .map((item) => {
      const title = item.title || "Untitled source"
      return item.url ? `${title} - ${item.url}` : title
    })
    .slice(0, 4)

  const brief: StructuredResearchBrief = {
    topic: query,
    keyFacts,
    sourceNotes,
  }

  if (intent) {
    brief.implications = [intent]
  }

  brief.rawSummary = buildResearchBriefSummary(brief)
  return brief
}

function extractAttachmentBody(content: string) {
  const blocks = [...content.matchAll(/\[Uploaded file:[^\]]+\]\n([\s\S]*?)(?=(?:\n*\[Uploaded file:[^\]]+\]\n)|$)/g)]
  const bodies = blocks
    .map((match) => normalizeOptionalText(match[1]))
    .filter((item): item is string => Boolean(item))

  if (bodies.length === 0) return null
  return bodies.join("\n\n")
}

function extractTopicFromText(text: string) {
  const lines = text
    .split("\n")
    .map((line) => normalizeOptionalText(line))
    .filter((line): line is string => Boolean(line))

  const titled = lines.find((line) => /^#/.test(line))
  if (titled) {
    return titled.replace(/^#+\s*/u, "").trim()
  }

  return lines[0] ?? null
}

function buildKeyFactsFromText(text: string) {
  const bulletFacts = [...text.matchAll(/^[\-\*\u2022]\s+(.+)$/gmu)]
    .map((match) => normalizeWhitespace(match[1] || ""))
    .filter(Boolean)

  if (bulletFacts.length > 0) {
    return uniqueStrings(bulletFacts).slice(0, MAX_ATTACHMENT_BRIEF_FACTS)
  }

  const sentenceFacts = text
    .split(/[\n。！？!?]/u)
    .map((line) => normalizeWhitespace(line))
    .filter((line) => line.length >= 12)

  return uniqueStrings(sentenceFacts).slice(0, MAX_ATTACHMENT_BRIEF_FACTS)
}

export function buildResearchBriefFromAttachmentContent(input: {
  latestUserPrompt?: string | null | undefined
  messageContents?: string[] | undefined
}) {
  const latestPrompt = normalizeOptionalText(input.latestUserPrompt) || ""
  const attachmentBody =
    input.messageContents
      ?.map((content) => (typeof content === "string" ? extractAttachmentBody(content) : null))
      .filter((item): item is string => Boolean(item))
      .at(-1) ?? extractAttachmentBody(latestPrompt)

  if (!attachmentBody) return null

  const topic = extractTopicFromText(attachmentBody) || extractTopicFromText(latestPrompt) || "Attachment research brief"
  const keyFacts = buildKeyFactsFromText(attachmentBody)
  if (keyFacts.length === 0) return null

  const brief: StructuredResearchBrief = {
    topic,
    keyFacts,
    rawSummary: trimToLength(attachmentBody, MAX_RESEARCH_BRIEF_CHARS),
  }

  return brief
}

export function buildResearchBriefContextMarker(brief: StructuredResearchBrief) {
  return `${RESEARCH_BRIEF_CONTEXT_PREFIX}${JSON.stringify(brief)} ${RESEARCH_BRIEF_CONTEXT_SUFFIX}`
}

export function extractLatestResearchBriefContext(content: string | null | undefined): StructuredResearchBrief | null {
  const normalized = typeof content === "string" ? content : ""
  if (!normalized) return null

  let searchIndex = 0
  let latest: StructuredResearchBrief | null = null

  while (searchIndex < normalized.length) {
    const start = normalized.indexOf(RESEARCH_BRIEF_CONTEXT_PREFIX, searchIndex)
    if (start < 0) break
    const jsonStart = start + RESEARCH_BRIEF_CONTEXT_PREFIX.length
    const end = normalized.indexOf(RESEARCH_BRIEF_CONTEXT_SUFFIX, jsonStart)
    if (end < 0) break
    const rawPayload = normalized.slice(jsonStart, end).trim()
    searchIndex = end + RESEARCH_BRIEF_CONTEXT_SUFFIX.length

    try {
      const parsed = normalizeStructuredResearchBrief(JSON.parse(rawPayload || "{}"))
      if (parsed) {
        latest = parsed
      }
    } catch {
      continue
    }
  }

  return latest
}

export function extractLatestResearchBriefContextFromContents(messageContents: string[] | undefined) {
  return (messageContents || [])
    .map((content) => extractLatestResearchBriefContext(content))
    .filter((value): value is StructuredResearchBrief => Boolean(value))
    .at(-1) ?? null
}

export function stripResearchBriefContextMarkers(content: string | null | undefined) {
  const normalized = typeof content === "string" ? content : ""
  if (!normalized) return ""

  let output = ""
  let searchIndex = 0
  let didStrip = false

  while (searchIndex < normalized.length) {
    const start = normalized.indexOf(RESEARCH_BRIEF_CONTEXT_PREFIX, searchIndex)
    if (start < 0) {
      output += normalized.slice(searchIndex)
      break
    }
    output += normalized.slice(searchIndex, start)
    const jsonStart = start + RESEARCH_BRIEF_CONTEXT_PREFIX.length
    const end = normalized.indexOf(RESEARCH_BRIEF_CONTEXT_SUFFIX, jsonStart)
    if (end < 0) {
      output += normalized.slice(start)
      break
    }
    didStrip = true
    searchIndex = end + RESEARCH_BRIEF_CONTEXT_SUFFIX.length
  }

  return didStrip ? output.replace(/\n{3,}/g, "\n\n").trim() : normalized
}
