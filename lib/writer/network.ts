import { execFile } from "child_process"
import { promisify } from "util"

const execFileAsync = promisify(execFile)

const WRITER_PROXY_URL =
  process.env.WRITER_HTTP_PROXY ||
  process.env.HTTPS_PROXY ||
  process.env.HTTP_PROXY ||
  process.env.ALL_PROXY ||
  ""

const CURL_BINARY = process.platform === "win32" ? "curl.exe" : "curl"
const CURL_STATUS_MARKER = "__WRITER_HTTP_STATUS__:"

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  const cause = error.cause as { code?: string } | undefined
  return (
    error.message.includes("fetch failed") ||
    error.message.includes("other side closed") ||
    error.message.includes("ECONNRESET") ||
    error.message.includes("timed out") ||
    cause?.code === "UND_ERR_SOCKET" ||
    cause?.code === "ECONNRESET" ||
    cause?.code === "ETIMEDOUT"
  )
}

type WriterRequestOptions = {
  attempts?: number
  timeoutMs?: number
  responseType?: "json" | "text"
}

type CurlRequestInit = {
  method?: string
  headers?: Record<string, string>
  body?: string
}

async function requestWithCurl(url: string, init: CurlRequestInit, timeoutMs: number) {
  const args = [
    "-sS",
    "-L",
    "--http1.1",
    "--max-time",
    String(Math.max(10, Math.ceil(timeoutMs / 1000))),
    "-X",
    (init.method || "GET").toUpperCase(),
    url,
    "-w",
    `\n${CURL_STATUS_MARKER}%{http_code}`,
  ]

  if (WRITER_PROXY_URL) {
    args.push("-x", WRITER_PROXY_URL)
  }

  for (const [key, value] of Object.entries(init.headers || {})) {
    args.push("-H", `${key}: ${value}`)
  }

  if (typeof init.body === "string") {
    args.push("--data-binary", init.body)
  }

  const { stdout, stderr } = await execFileAsync(CURL_BINARY, args, {
    windowsHide: true,
    maxBuffer: 50 * 1024 * 1024,
  })

  const markerIndex = stdout.lastIndexOf(`\n${CURL_STATUS_MARKER}`)
  if (markerIndex < 0) {
    throw new Error(stderr?.trim() || "curl_missing_status")
  }

  const bodyText = stdout.slice(0, markerIndex)
  const statusText = stdout.slice(markerIndex + `\n${CURL_STATUS_MARKER}`.length).trim()
  const status = Number.parseInt(statusText, 10)

  if (!Number.isFinite(status)) {
    throw new Error("curl_invalid_status")
  }

  return { status, bodyText, stderr }
}

async function requestWithFetch(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error("writer_request_timeout")), timeoutMs)

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    })

    return {
      status: response.status,
      bodyText: await response.text(),
    }
  } finally {
    clearTimeout(timer)
  }
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
      if (WRITER_PROXY_URL) {
        return await requestWithCurl(
          url,
          {
            method: init.method,
            headers: (init.headers as Record<string, string> | undefined) || undefined,
            body: typeof init.body === "string" ? init.body : undefined,
          },
          timeoutMs,
        )
      }

      return await requestWithFetch(url, init, timeoutMs)
    } catch (error) {
      lastError = error
      if (attempt >= attempts || !isRetryableError(error)) {
        throw error
      }
      await sleep(400 * attempt)
    }
  }

  throw lastError instanceof Error ? lastError : new Error("writer_request_failed")
}

export async function writerRequestJson<T = any>(
  url: string,
  init: RequestInit = {},
  options: WriterRequestOptions = {},
) {
  const response = await writerRequest(url, init, { ...options, responseType: "json" })
  let data: T | null = null

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
  return Boolean(WRITER_PROXY_URL)
}
