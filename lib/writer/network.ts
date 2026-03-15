import http from "node:http"
import https from "node:https"
import net from "node:net"
import { Readable } from "node:stream"
import tls from "node:tls"

const WRITER_PROXY_URL =
  process.env.WRITER_HTTP_PROXY ||
  (process.env.WRITER_USE_SYSTEM_PROXY === "true"
    ? process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY || ""
    : "")
const nativeFetch = globalThis.fetch.bind(globalThis)

let proxyAgent: https.Agent | null = null

type ProxyCreateConnectionOptions = tls.ConnectionOptions & {
  host?: string
  hostname?: string
  port?: number | string
  servername?: string
}

type ProxyCreateConnectionCallback = (error: Error | null, socket?: tls.TLSSocket) => void

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

function isProxyTransportError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  return (
    error.message.includes("writer_proxy_connect_timeout") ||
    error.message.includes("writer_proxy_connect_failed") ||
    error.message.includes("proxy") ||
    error.message.includes("tunneling") ||
    error.message.includes("socket hang up")
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
    const proxy = new URL(WRITER_PROXY_URL)
    const proxyPort = Number(proxy.port || (proxy.protocol === "https:" ? "443" : "80"))
    const proxyAuth =
      proxy.username || proxy.password
        ? `Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString("base64")}`
        : null

    const createConnection = (options: ProxyCreateConnectionOptions, callback: ProxyCreateConnectionCallback) => {
      const proxySocket = net.connect({
        host: proxy.hostname,
        port: proxyPort,
      })

      const cleanup = () => {
        proxySocket.removeAllListeners("connect")
        proxySocket.removeAllListeners("data")
        proxySocket.removeAllListeners("error")
        proxySocket.removeAllListeners("timeout")
      }

      proxySocket.setTimeout(30_000)
      proxySocket.once("timeout", () => {
        cleanup()
        proxySocket.destroy(new Error("writer_proxy_connect_timeout"))
      })

      proxySocket.once("error", (error) => {
        cleanup()
        callback(error as Error)
      })

      proxySocket.once("connect", () => {
        const targetHost = options.host || options.hostname || ""
        const targetPort = options.port || 443
        const headers = [
          `CONNECT ${targetHost}:${targetPort} HTTP/1.1`,
          `Host: ${targetHost}:${targetPort}`,
          "Proxy-Connection: Keep-Alive",
          proxyAuth ? `Proxy-Authorization: ${proxyAuth}` : "",
          "",
          "",
        ]
          .filter(Boolean)
          .join("\r\n")

        proxySocket.write(headers)
      })

      let responseBuffer = ""
      proxySocket.on("data", (chunk) => {
        responseBuffer += chunk.toString("utf8")
        if (!responseBuffer.includes("\r\n\r\n")) {
          return
        }

        const [headerBlock] = responseBuffer.split("\r\n\r\n", 1)
        const statusLine = headerBlock.split("\r\n")[0] || ""
        if (!statusLine.includes(" 200 ")) {
          cleanup()
          proxySocket.destroy()
          callback(new Error(`writer_proxy_connect_failed:${statusLine}`))
          return
        }

        cleanup()
        const tlsSocket = tls.connect(
          {
            socket: proxySocket,
            servername: options.servername || options.host || options.hostname,
            ALPNProtocols: ["http/1.1"],
          },
          () => callback(null, tlsSocket),
        )

        tlsSocket.once("error", (error) => callback(error as Error))
      })
    }

    proxyAgent = new https.Agent({ keepAlive: false })
    Object.assign(proxyAgent, { createConnection })
  }

  return proxyAgent
}

function normalizeFetchUrl(input: string | URL | Request) {
  if (typeof input === "string") {
    return input
  }

  if (input instanceof URL) {
    return input.toString()
  }

  return input.url
}

function normalizeFetchHeaders(input: string | URL | Request, init: RequestInit = {}) {
  const headers = new Headers()
  const requestHeaders = typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined

  if (requestHeaders) {
    requestHeaders.forEach((value, key) => headers.set(key, value))
  }

  if (init.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value))
  }

  return headers
}

async function normalizeFetchBody(input: string | URL | Request, init: RequestInit = {}) {
  if (init.body != null) {
    return init.body
  }

  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.arrayBuffer().then((buffer) => Buffer.from(buffer))
  }

  return undefined
}

async function requestWithNode(url: string, init: RequestInit, timeoutMs: number, agent = getProxyAgent()) {
  const target = new URL(url)
  const isHttps = target.protocol === "https:"
  const transport = isHttps ? https : http

  return await new Promise<{ status: number; bodyText: string }>((resolve, reject) => {
    const request = transport.request(
      target,
      {
        method: init.method || "GET",
        headers: init.headers as http.OutgoingHttpHeaders | undefined,
        agent,
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

async function requestWithNodeFetch(
  input: string | URL | Request,
  init: RequestInit = {},
  timeoutMs = 120_000,
  agent = getProxyAgent(),
) {
  const url = normalizeFetchUrl(input)
  const target = new URL(url)
  const isHttps = target.protocol === "https:"
  const transport = isHttps ? https : http
  const headers = normalizeFetchHeaders(input, init)
  const body = await normalizeFetchBody(input, init)

  return await new Promise<Response>((resolve, reject) => {
    const request = transport.request(
      target,
      {
        method:
          init.method ||
          (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET"),
        headers: Object.fromEntries(headers.entries()),
        agent,
      },
      (response) => {
        const responseHeaders = new Headers()
        Object.entries(response.headers).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            responseHeaders.set(key, value.join(", "))
          } else if (typeof value === "string") {
            responseHeaders.set(key, value)
          }
        })

        const webStream = Readable.toWeb(response) as globalThis.ReadableStream<Uint8Array>
        resolve(
          new Response(webStream, {
            status: response.statusCode || 500,
            statusText: response.statusMessage,
            headers: responseHeaders,
          }),
        )
      },
    )

    request.on("error", reject)
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error("writer_request_timeout"))
    })

    if (typeof body === "string" || Buffer.isBuffer(body)) {
      request.write(body)
    } else if (body instanceof ArrayBuffer) {
      request.write(Buffer.from(body))
    } else if (ArrayBuffer.isView(body)) {
      request.write(Buffer.from(body.buffer, body.byteOffset, body.byteLength))
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
      if (hasWriterProxyTransport() && isProxyTransportError(error)) {
        try {
          return await requestWithNode(url, { ...init }, timeoutMs, undefined)
        } catch (directError) {
          lastError = directError
        }
      }
      if (attempt >= attempts || !isRetryableError(error)) {
        throw error
      }
      await sleep(400 * attempt)
    }
  }

  throw lastError instanceof Error ? lastError : new Error("writer_request_failed")
}

export async function writerFetch(input: string | URL | Request, init: RequestInit = {}) {
  if (!hasWriterProxyTransport()) {
    return nativeFetch(input, init)
  }

  try {
    return await requestWithNodeFetch(input, init)
  } catch (error) {
    if (!isProxyTransportError(error)) {
      throw error
    }
    return requestWithNodeFetch(input, init, 120_000, undefined)
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
  return Boolean(WRITER_PROXY_URL)
}
