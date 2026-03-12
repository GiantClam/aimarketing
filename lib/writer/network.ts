import http from "node:http"
import https from "node:https"

import { HttpsProxyAgent } from "https-proxy-agent"

const WRITER_PROXY_URL =
  process.env.WRITER_HTTP_PROXY ||
  process.env.HTTPS_PROXY ||
  process.env.HTTP_PROXY ||
  process.env.ALL_PROXY ||
  ""

let proxyAgent: HttpsProxyAgent<string> | null = null

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
    error.message.includes("socket hang up") ||
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

function getProxyAgent() {
  if (!WRITER_PROXY_URL) {
    return undefined
  }

  if (!proxyAgent) {
    proxyAgent = new HttpsProxyAgent(WRITER_PROXY_URL)
  }

  return proxyAgent
}

async function requestWithNode(url: string, init: RequestInit, timeoutMs: number) {
  const target = new URL(url)
  const isHttps = target.protocol === "https:"
  const transport = isHttps ? https : http

  return await new Promise<{ status: number; bodyText: string }>((resolve, reject) => {
    const request = transport.request(
      target,
      {
        method: init.method || "GET",
        headers: init.headers as http.OutgoingHttpHeaders | undefined,
        agent: getProxyAgent(),
      },
      (response) => {
        const chunks: string[] = []
        response.on("data", (chunk) =>
          chunks.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : Buffer.from(chunk).toString("utf8")),
        )
        response.on("end", () => {
          resolve({
            status: response.statusCode || 0,
            bodyText: chunks.join(""),
          })
        })
      },
    )

    request.on("error", reject)
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error("writer_request_timeout"))
    })

    if (typeof init.body === "string") {
      request.write(init.body)
    }

    request.end()
  })
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
      return await requestWithNode(url, init, timeoutMs)
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
