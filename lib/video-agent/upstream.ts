import { withTaskTimeout } from "@/lib/task-timeout"

const VIDEO_AGENT_RETRY_DELAYS_MS = [500, 1_500]

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function isRetryableFetchError(error: unknown) {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  const cause = error.cause as { code?: string } | undefined

  return (
    message.includes("fetch failed") ||
    message.includes("other side closed") ||
    message.includes("socket hang up") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("temporarily unavailable") ||
    message.includes("econnreset") ||
    cause?.code === "ECONNRESET" ||
    cause?.code === "ETIMEDOUT" ||
    cause?.code === "UND_ERR_SOCKET" ||
    cause?.code === "UND_ERR_CONNECT_TIMEOUT"
  )
}

function createAbortError() {
  const error = new Error("request_aborted")
  error.name = "AbortError"
  return error
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return
  throw createAbortError()
}

function linkAbortSignal(parentSignal: AbortSignal | undefined, controller: AbortController) {
  if (!parentSignal) {
    return () => {}
  }
  if (parentSignal.aborted) {
    controller.abort()
    return () => {}
  }

  const handleAbort = () => controller.abort()
  parentSignal.addEventListener("abort", handleAbort, { once: true })
  return () => parentSignal.removeEventListener("abort", handleAbort)
}

export type VideoAgentFetchOptions = {
  label: string
  timeoutMs: number
  attempts?: number
  signal?: AbortSignal
}

export async function fetchVideoAgentUpstream(
  input: string,
  init: RequestInit,
  options: VideoAgentFetchOptions,
) {
  const attempts = Math.max(1, Math.min(options.attempts ?? VIDEO_AGENT_RETRY_DELAYS_MS.length + 1, 5))
  let lastError: unknown = null

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    throwIfAborted(options.signal)
    const controller = new AbortController()
    const cleanupAbort = linkAbortSignal(options.signal, controller)

    try {
      const response = await withTaskTimeout(
        fetch(input, {
          ...init,
          signal: controller.signal,
        }),
        options.timeoutMs,
        `${options.label}_timeout`,
        { abortController: controller },
      )

      if (attempt < attempts && isRetryableStatus(response.status)) {
        console.warn("video-agent.upstream.retry", {
          label: options.label,
          attempt,
          status: response.status,
          url: input,
        })
        await sleep(VIDEO_AGENT_RETRY_DELAYS_MS[attempt - 1] ?? VIDEO_AGENT_RETRY_DELAYS_MS.at(-1) ?? 1_500)
        continue
      }

      return response
    } catch (error) {
      lastError = error
      if (options.signal?.aborted) {
        throwIfAborted(options.signal)
      }
      if (attempt < attempts && isRetryableFetchError(error)) {
        console.warn("video-agent.upstream.retry", {
          label: options.label,
          attempt,
          message: getErrorMessage(error),
          url: input,
        })
        await sleep(VIDEO_AGENT_RETRY_DELAYS_MS[attempt - 1] ?? VIDEO_AGENT_RETRY_DELAYS_MS.at(-1) ?? 1_500)
        continue
      }
      throw error
    } finally {
      cleanupAbort()
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${options.label}_failed`)
}

export async function readJsonResponse(response: Response) {
  return (await response.json().catch(() => null)) as Record<string, unknown> | null
}

export function getVideoAgentErrorMessage(payload: Record<string, unknown> | null, fallback: string) {
  const message = typeof payload?.error === "string" ? payload.error.trim() : ""
  return message || fallback
}
