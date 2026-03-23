const WRITER_PROMPT_NGRAM_SIZE = 3

const COVER_FOCUS_RE = /Article theme:\s*([\s\S]*?)\.\s*Summary:\s*([\s\S]*?)\.\s*Visual style:/i
const INLINE_FOCUS_RE = /Section focus:\s*([\s\S]*?)\.\s*Section summary:\s*([\s\S]*?)\.\s*Visual style:/i

function normalizePromptText(value: string) {
  return value
    .toLowerCase()
    .replace(/[\s\r\n\t]+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
}

function collectNgrams(value: string, n = WRITER_PROMPT_NGRAM_SIZE) {
  if (!value) return new Set<string>()
  if (value.length <= n) return new Set([value])
  const grams = new Set<string>()
  for (let index = 0; index <= value.length - n; index += 1) {
    grams.add(value.slice(index, index + n))
  }
  return grams
}

export function extractWriterPromptFocus(prompt: string) {
  const normalized = prompt.trim()
  if (!normalized) return ""
  const uniqueKeyMatch = /Unique prompt key:\s*([^\s.]+)/i.exec(normalized)
  const uniqueKey = uniqueKeyMatch?.[1] ? ` ${uniqueKeyMatch[1]}` : ""

  const inlineMatch = INLINE_FOCUS_RE.exec(normalized)
  if (inlineMatch) {
    return `${inlineMatch[1]} ${inlineMatch[2]}${uniqueKey}`.trim()
  }

  const coverMatch = COVER_FOCUS_RE.exec(normalized)
  if (coverMatch) {
    return `${coverMatch[1]} ${coverMatch[2]}${uniqueKey}`.trim()
  }

  return `${normalized.slice(0, 400)}${uniqueKey}`.trim()
}

export function calculateWriterPromptSimilarity(left: string, right: string) {
  const leftNormalized = normalizePromptText(left)
  const rightNormalized = normalizePromptText(right)
  if (!leftNormalized && !rightNormalized) return 1
  if (!leftNormalized || !rightNormalized) return 0

  const leftNgrams = collectNgrams(leftNormalized)
  const rightNgrams = collectNgrams(rightNormalized)
  if (leftNgrams.size === 0 && rightNgrams.size === 0) return 1
  if (leftNgrams.size === 0 || rightNgrams.size === 0) return 0

  let intersection = 0
  for (const gram of leftNgrams) {
    if (rightNgrams.has(gram)) {
      intersection += 1
    }
  }

  return (2 * intersection) / (leftNgrams.size + rightNgrams.size)
}

function buildPromptDiversityVariant(basePrompt: string, assetId: string, attempt: number, similarAssetId: string) {
  return [
    basePrompt,
    `Prompt diversity rewrite ${attempt} for slot ${assetId}.`,
    `Prompt-similarity guard: this slot was too close to ${similarAssetId}.`,
    "Hard requirement: make the subject, scene, camera framing, and color mood explicitly different.",
    `Unique prompt key: ${assetId}-variant-${attempt}.`,
  ].join(" ")
}

export function ensureWriterPromptDiversity(params: {
  assetId: string
  prompt: string
  existing: Array<{ assetId: string; focus: string }>
  maxAttempts: number
  similarityMax: number
}) {
  const attemptLimit = Math.max(1, params.maxAttempts)
  let bestSimilarity: { assetId: string; score: number } | null = null

  for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
    const candidatePrompt =
      attempt === 1
        ? params.prompt
        : buildPromptDiversityVariant(
            params.prompt,
            params.assetId,
            attempt,
            bestSimilarity?.assetId || params.existing[0]?.assetId || "previous-slot",
          )
    const focus = extractWriterPromptFocus(candidatePrompt)

    bestSimilarity = null
    for (const existingItem of params.existing) {
      const score = calculateWriterPromptSimilarity(focus, existingItem.focus)
      if (!bestSimilarity || score > bestSimilarity.score) {
        bestSimilarity = { assetId: existingItem.assetId, score }
      }
    }

    if (!bestSimilarity || bestSimilarity.score <= params.similarityMax) {
      return {
        prompt: candidatePrompt,
        focus,
        attempt,
        similarTo: bestSimilarity?.assetId || null,
        similarity: bestSimilarity?.score ?? null,
      }
    }
  }

  const error = new Error("writer_asset_prompt_similarity_exhausted") as Error & {
    cause?: { similarTo: string | null; similarity: number | null; threshold: number; attempts: number }
  }
  error.cause = {
    similarTo: bestSimilarity?.assetId || null,
    similarity: bestSimilarity?.score ?? null,
    threshold: params.similarityMax,
    attempts: attemptLimit,
  }
  throw error
}
