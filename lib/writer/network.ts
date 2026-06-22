import {
  hasLocalDevProxyTransport,
  isProxyTransportError,
  isRetryableProxyableRequestError,
  proxyAwareFetch,
  proxyAwareNodeRequest,
} from "@/lib/server/local-dev-proxy"

type WriterRequestOptions = {
  attempts?: number
  timeoutMs?: number
  responseType?: "json" | "text"
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function writerRequest(
  url: string,
  init: RequestInit = {},
  options: WriterRequestOptions = {},
) {
  const attempts = options.attempts ?? 2
  const timeoutMs = options.timeoutMs ?? 120_000
  let lastError: unknown = null

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await proxyAwareNodeRequest(url, init, { timeoutMs })
    } catch (error) {
      lastError = error
      console.error("writer.network.request_error", {
        attempt,
        url: url.slice(0, 120),
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack?.split("\n").slice(0, 5).join("\n") : undefined,
        hasProxy: hasWriterProxyTransport(),
        isProxyError: isProxyTransportError(error),
      })
      if (hasWriterProxyTransport() && isProxyTransportError(error)) {
        try {
          return await proxyAwareNodeRequest(url, { ...init }, { timeoutMs }, null)
        } catch (directError) {
          lastError = directError
        }
      }
      if (attempt >= attempts || !isRetryableProxyableRequestError(error)) {
        throw error
      }
      await sleep(400 * attempt)
    }
  }

  throw lastError instanceof Error ? lastError : new Error("writer_request_failed")
}

export async function writerFetch(input: string | URL | Request, init: RequestInit = {}) {
  try {
    return await proxyAwareFetch(input, init)
  } catch (error) {
    if (!hasWriterProxyTransport() || !isProxyTransportError(error)) {
      throw error
    }
    return proxyAwareFetch(input, init, {}, null)
  }
}

export async function writerRequestJson<T = any>(
  url: string,
  init: RequestInit = {},
  options: WriterRequestOptions = {},
) {
  const response = await writerRequest(url, init, { ...options, responseType: "json" })
  let data: T | null

  try {
    data = response.bodyText ? (JSON.parse(response.bodyText) as T) : null
  } catch {
    data = null
  }

  return {
    status: response.status,
    ok: response.status >= 200 && response.status < 300,
    data,
    text: response.bodyText,
  }
}

export async function writerRequestText(
  url: string,
  init: RequestInit = {},
  options: WriterRequestOptions = {},
) {
  const response = await writerRequest(url, init, { ...options, responseType: "text" })
  return {
    status: response.status,
    ok: response.status >= 200 && response.status < 300,
    text: response.bodyText,
  }
}

export function hasWriterProxyTransport() {
  return hasLocalDevProxyTransport()
}
