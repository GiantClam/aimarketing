export const DEFAULT_DB_RETRY_DELAYS_MS = [250, 750] as const

const DEFAULT_RETRY_TOKENS = [
  "error connecting to database",
  "fetch failed",
  "connect timeout",
  "connection timeout",
  "timeout exceeded when trying to connect",
  "econnreset",
  "econnrefused",
  "und_err_connect_timeout",
  "connection terminated unexpectedly",
  "connection terminated due to connection timeout",
  "terminating connection",
  "too many clients",
  "quota",
] as const

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error)
}

export function getCombinedErrorMessage(error: unknown) {
  const queue: unknown[] = [error]
  const visited = new Set<unknown>()
  const segments: string[] = []

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || visited.has(current)) continue
    visited.add(current)
    segments.push(getErrorMessage(current))

    if (typeof current === "object" && current) {
      if ("cause" in current) {
        queue.push((current as { cause?: unknown }).cause)
      }
      if ("errors" in current) {
        const nested = (current as { errors?: unknown }).errors
        if (Array.isArray(nested)) {
          queue.push(...nested)
        }
      }
    }
  }

  return segments.join(" ").toLowerCase()
}

export function createRetryableDbErrorMatcher(extraTokens: string[] = []) {
  const tokens = [...DEFAULT_RETRY_TOKENS, ...extraTokens].map((token) => token.toLowerCase())
  return (error: unknown) => {
    const combined = getCombinedErrorMessage(error)
    return tokens.some((token) => combined.includes(token))
  }
}

export const isCommonRetryableDbError = createRetryableDbErrorMatcher()

export function isFailedQueryError(error: unknown) {
  return getCombinedErrorMessage(error).includes("failed query:")
}

export function isDbUnavailableError(error: unknown, retryableMatcher = isCommonRetryableDbError) {
  return isFailedQueryError(error) || retryableMatcher(error)
}

type DbRetryOptions = {
  retryDelaysMs?: readonly number[]
  isRetryable?: (error: unknown) => boolean
  logPrefix?: string
  exhaustedErrorPrefix?: string
}

export async function withDbRetry<T>(
  label: string,
  operation: () => Promise<T>,
  options: DbRetryOptions = {},
) {
  const retryDelaysMs = options.retryDelaysMs ?? DEFAULT_DB_RETRY_DELAYS_MS
  const isRetryable = options.isRetryable ?? isCommonRetryableDbError
  const logPrefix = options.logPrefix ?? "db.retry"
  const exhaustedErrorPrefix = options.exhaustedErrorPrefix ?? "db_retry_exhausted"

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      if (!isRetryable(error) || attempt === retryDelaysMs.length) {
        throw error
      }

      console.warn(logPrefix, {
        label,
        attempt: attempt + 1,
        message: getErrorMessage(error),
      })
      await sleep(retryDelaysMs[attempt])
    }
  }

  throw new Error(`${exhaustedErrorPrefix}:${label}`)
}
