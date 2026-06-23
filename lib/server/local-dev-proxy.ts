import http from "http"
import https from "https"
import net from "net"
import { Readable } from "stream"
import tls from "tls"

const nativeFetch = globalThis.fetch.bind(globalThis)
const proxyInstallFlag = Symbol.for("aimarketing.local-dev-proxy.installed")

let proxyAgent: https.Agent | null = null

type ProxyCreateConnectionOptions = tls.ConnectionOptions & {
  host?: string
  hostname?: string
  port?: number | string
  servername?: string
}

type ProxyCreateConnectionCallback = (error: Error | null, socket?: tls.TLSSocket) => void

type ProxyAwareRequestOptions = {
  timeoutMs?: number
}

function normalizeText(raw: unknown) {
  return typeof raw === "string" ? raw.trim() : ""
}

function normalizeBoolean(raw: unknown) {
  const value = normalizeText(raw).toLowerCase()
  return value === "1" || value === "true" || value === "yes" || value === "on"
}

export function getLocalDevProxyUrl() {
  const explicit =
    normalizeText(process.env.LOCAL_DEV_HTTP_PROXY) ||
    normalizeText(process.env.APP_HTTP_PROXY) ||
    normalizeText(process.env.WRITER_HTTP_PROXY)
  if (explicit) {
    return explicit
  }

  if (!normalizeBoolean(process.env.LOCAL_DEV_USE_SYSTEM_PROXY) && !normalizeBoolean(process.env.WRITER_USE_SYSTEM_PROXY)) {
    return ""
  }

  return (
    normalizeText(process.env.HTTPS_PROXY) ||
    normalizeText(process.env.HTTP_PROXY) ||
    normalizeText(process.env.ALL_PROXY)
  )
}

export function hasLocalDevProxyTransport() {
  return process.env.NODE_ENV !== "production" && Boolean(getLocalDevProxyUrl())
}

function parseNoProxyEntries() {
  return (normalizeText(process.env.LOCAL_DEV_NO_PROXY) || normalizeText(process.env.NO_PROXY) || normalizeText(process.env.no_proxy))
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
}

function isPrivateIpv4Host(hostname: string) {
  if (/^127\./.test(hostname) || /^10\./.test(hostname) || /^192\.168\./.test(hostname) || /^169\.254\./.test(hostname)) {
    return true
  }

  const match = /^172\.(\d{1,3})\./.exec(hostname)
  if (!match) return false

  const secondOctet = Number.parseInt(match[1] || "", 10)
  return secondOctet >= 16 && secondOctet <= 31
}

function hostnameMatchesNoProxyEntry(hostname: string, entry: string) {
  const normalizedEntry = entry.replace(/:\d+$/u, "")
  if (!normalizedEntry) return false
  if (normalizedEntry === "*") return true
  if (normalizedEntry.startsWith(".")) {
    const suffix = normalizedEntry.slice(1)
    return hostname === suffix || hostname.endsWith(normalizedEntry)
  }

  return hostname === normalizedEntry || hostname.endsWith(`.${normalizedEntry}`)
}

export function shouldBypassLocalDevProxy(rawUrl: string) {
  let target: URL
  try {
    target = new URL(rawUrl)
  } catch {
    return true
  }

  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return true
  }

  const hostname = target.hostname.toLowerCase()
  if (
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".local") ||
    isPrivateIpv4Host(hostname)
  ) {
    return true
  }

  return parseNoProxyEntries().some((entry) => hostnameMatchesNoProxyEntry(hostname, entry))
}

function getProxyAgentForUrl(rawUrl: string) {
  if (!hasLocalDevProxyTransport() || shouldBypassLocalDevProxy(rawUrl)) {
    return undefined
  }

  if (!proxyAgent) {
    const proxy = new URL(getLocalDevProxyUrl())
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
          ...(proxyAuth ? [`Proxy-Authorization: ${proxyAuth}`] : []),
          "",
          "",
        ].join("\r\n")

        proxySocket.write(headers)
      })

      let responseBuffer = ""
      proxySocket.on("data", (chunk) => {
        responseBuffer += chunk.toString("utf8")
        if (!responseBuffer.includes("\r\n\r\n")) {
          return
        }

        const headerBlock = responseBuffer.slice(0, responseBuffer.indexOf("\r\n\r\n"))
        const statusLine = headerBlock.split("\r\n")[0] || ""
        if (!statusLine.includes(" 200 ")) {
          cleanup()
          proxySocket.destroy()
          callback(new Error(`writer_proxy_connect_failed:${statusLine}`))
          return
        }

        cleanup()
        proxySocket.setTimeout(0)
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

export function createProxyAwareAbortError() {
  const error = new Error("request_aborted")
  error.name = "AbortError"
  return error
}

export function isProxyTransportError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  const cause = error.cause as { code?: string } | undefined
  const proxyUrl = getLocalDevProxyUrl()
  let proxyHost = ""
  let proxyPort = ""

  if (proxyUrl) {
    try {
      const parsedProxyUrl = new URL(proxyUrl)
      proxyHost = parsedProxyUrl.hostname
      proxyPort = parsedProxyUrl.port || (parsedProxyUrl.protocol === "https:" ? "443" : "80")
    } catch {
      proxyHost = ""
      proxyPort = ""
    }
  }

  const message = error.message || ""
  const referencesConfiguredProxy =
    Boolean(proxyHost) &&
    (message.includes(proxyHost) ||
      (proxyPort ? message.includes(`${proxyHost}:${proxyPort}`) : false) ||
      message.includes(proxyUrl))

  return (
    message.includes("writer_proxy_connect_timeout") ||
    message.includes("writer_proxy_connect_failed") ||
    message.includes("proxy") ||
    message.includes("tunneling") ||
    message.includes("socket hang up") ||
    (referencesConfiguredProxy &&
      (message.includes("ECONNREFUSED") ||
        message.includes("EHOSTUNREACH") ||
        message.includes("ENETUNREACH") ||
        message.includes("ETIMEDOUT") ||
        cause?.code === "ECONNREFUSED" ||
        cause?.code === "EHOSTUNREACH" ||
        cause?.code === "ENETUNREACH" ||
        cause?.code === "ETIMEDOUT"))
  )
}

export function isRetryableProxyableRequestError(error: unknown) {
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

async function normalizeFetchRequestData(input: string | URL | Request, init: RequestInit = {}) {
  const method =
    init.method ||
    (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")
  const upperMethod = method.toUpperCase()
  const bodyAllowed = upperMethod !== "GET" && upperMethod !== "HEAD"

  if (typeof Request !== "undefined" && input instanceof Request && init.body == null) {
    const source = input.clone()
    const headers = normalizeFetchHeaders(input, init)
    return {
      method,
      headers,
      body: bodyAllowed ? Buffer.from(await source.arrayBuffer()) : undefined,
    }
  }

  const headers = normalizeFetchHeaders(input, init)
  if (init.body == null || !bodyAllowed) {
    return { method, headers, body: undefined }
  }

  const normalizedRequest = new Request(normalizeFetchUrl(input), {
    method,
    headers,
    body: init.body as BodyInit,
  })

  return {
    method,
    headers: new Headers(normalizedRequest.headers),
    body: Buffer.from(await normalizedRequest.arrayBuffer()),
  }
}

export async function proxyAwareNodeRequest(
  url: string,
  init: RequestInit = {},
  options: ProxyAwareRequestOptions = {},
  overrideAgent?: http.Agent | https.Agent | null,
) {
  const timeoutMs = options.timeoutMs ?? 120_000
  const target = new URL(url)
  const isHttps = target.protocol === "https:"
  const transport = isHttps ? https : http
  const agent = overrideAgent === null ? undefined : overrideAgent ?? getProxyAgentForUrl(url)

  return await new Promise<{ status: number; bodyText: string }>((resolve, reject) => {
    if (init.signal?.aborted) {
      reject(createProxyAwareAbortError())
      return
    }

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

    const handleAbort = () => request.destroy(createProxyAwareAbortError())

    init.signal?.addEventListener("abort", handleAbort, { once: true })
    request.on("close", () => init.signal?.removeEventListener("abort", handleAbort))
    request.on("error", reject)
    request.setTimeout(timeoutMs, () => request.destroy(new Error("writer_proxy_connect_timeout")))

    if (typeof init.body === "string") {
      request.write(init.body)
    }

    request.end()
  })
}

export async function proxyAwareFetch(
  input: string | URL | Request,
  init: RequestInit = {},
  options: ProxyAwareRequestOptions = {},
  overrideAgent?: http.Agent | https.Agent | null,
): Promise<Response> {
  const url = normalizeFetchUrl(input)
  const target = new URL(url)

  if (overrideAgent === null) {
    return nativeFetch(input, init)
  }

  if (!overrideAgent && (!hasLocalDevProxyTransport() || shouldBypassLocalDevProxy(url))) {
    return nativeFetch(input, init)
  }

  const timeoutMs = options.timeoutMs ?? 120_000
  const isHttps = target.protocol === "https:"
  const transport = isHttps ? https : http
  const { method, headers, body } = await normalizeFetchRequestData(input, init)
  const agent = overrideAgent ?? getProxyAgentForUrl(url)

  return await new Promise<Response>((resolve, reject) => {
    if (init.signal?.aborted) {
      reject(createProxyAwareAbortError())
      return
    }

    const request = transport.request(
      target,
      {
        method,
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

        const status = response.statusCode || 500
        const webStream = Readable.toWeb(response) as globalThis.ReadableStream<Uint8Array>
        const bodyAllowed = method.toUpperCase() !== "HEAD" && status !== 204 && status !== 205 && status !== 304
        resolve(
          new Response(bodyAllowed ? webStream : null, {
            status,
            statusText: response.statusMessage,
            headers: responseHeaders,
          }),
        )
      },
    )

    const handleAbort = () => request.destroy(createProxyAwareAbortError())

    init.signal?.addEventListener("abort", handleAbort, { once: true })
    request.on("close", () => init.signal?.removeEventListener("abort", handleAbort))
    request.on("error", reject)
    request.setTimeout(timeoutMs, () => request.destroy(new Error("writer_proxy_connect_timeout")))

    if (Buffer.isBuffer(body)) {
      request.write(body)
    }

    request.end()
  })
}

export function installLocalDevProxyFetch() {
  if (!hasLocalDevProxyTransport()) {
    return false
  }

  const globalWithFlag = globalThis as typeof globalThis & {
    [proxyInstallFlag]?: boolean
    fetch: typeof fetch
  }

  if (globalWithFlag[proxyInstallFlag]) {
    return false
  }

  globalWithFlag.fetch = ((input: string | URL | Request, init?: RequestInit) =>
    proxyAwareFetch(input, init)) as typeof fetch
  globalWithFlag[proxyInstallFlag] = true
  console.info("local-dev.proxy.fetch.installed", {
    proxyUrl: getLocalDevProxyUrl(),
  })
  return true
}
