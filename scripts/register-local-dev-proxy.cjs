const http = require("http")
const https = require("https")
const net = require("net")
const tls = require("tls")
const { Readable } = require("stream")

function normalizeText(raw) {
  return typeof raw === "string" ? raw.trim() : ""
}

function normalizeBoolean(raw) {
  const value = normalizeText(raw).toLowerCase()
  return value === "1" || value === "true" || value === "yes" || value === "on"
}

function getLocalDevProxyUrl() {
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

  return normalizeText(process.env.HTTPS_PROXY) || normalizeText(process.env.HTTP_PROXY) || normalizeText(process.env.ALL_PROXY)
}

function hasLocalDevProxyTransport() {
  return process.env.NODE_ENV !== "production" && Boolean(getLocalDevProxyUrl())
}

function parseNoProxyEntries() {
  return (normalizeText(process.env.LOCAL_DEV_NO_PROXY) || normalizeText(process.env.NO_PROXY) || normalizeText(process.env.no_proxy))
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
}

function isPrivateIpv4Host(hostname) {
  if (/^127\./.test(hostname) || /^10\./.test(hostname) || /^192\.168\./.test(hostname) || /^169\.254\./.test(hostname)) {
    return true
  }

  const match = /^172\.(\d{1,3})\./.exec(hostname)
  if (!match) return false

  const secondOctet = Number.parseInt(match[1] || "", 10)
  return secondOctet >= 16 && secondOctet <= 31
}

function hostnameMatchesNoProxyEntry(hostname, entry) {
  const normalizedEntry = entry.replace(/:\d+$/u, "")
  if (!normalizedEntry) return false
  if (normalizedEntry === "*") return true
  if (normalizedEntry.startsWith(".")) {
    const suffix = normalizedEntry.slice(1)
    return hostname === suffix || hostname.endsWith(normalizedEntry)
  }

  return hostname === normalizedEntry || hostname.endsWith(`.${normalizedEntry}`)
}

function shouldBypassLocalDevProxy(rawUrl) {
  let target
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

let proxyAgent = null

function getProxyAgentForUrl(rawUrl) {
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

    const createConnection = (options, callback) => {
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
        callback(error)
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

        tlsSocket.once("error", (error) => callback(error))
      })
    }

    proxyAgent = new https.Agent({ keepAlive: false })
    Object.assign(proxyAgent, { createConnection })
  }

  return proxyAgent
}

function normalizeFetchUrl(input) {
  if (typeof input === "string") return input
  if (input instanceof URL) return input.toString()
  return input.url
}

function normalizeFetchHeaders(input, init = {}) {
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

async function normalizeFetchBody(input, init = {}) {
  if (init.body != null) {
    return init.body
  }

  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.arrayBuffer().then((buffer) => Buffer.from(buffer))
  }

  return undefined
}

function createAbortError() {
  const error = new Error("request_aborted")
  error.name = "AbortError"
  return error
}

const nativeFetch = globalThis.fetch.bind(globalThis)

async function proxyAwareFetch(input, init = {}) {
  const url = normalizeFetchUrl(input)
  const target = new URL(url)
  const method = init.method || (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")

  if (!hasLocalDevProxyTransport() || shouldBypassLocalDevProxy(url)) {
    return nativeFetch(input, init)
  }

  const headers = normalizeFetchHeaders(input, init)
  const body = await normalizeFetchBody(input, init)
  const transport = target.protocol === "https:" ? https : http
  const agent = getProxyAgentForUrl(url)

  return await new Promise((resolve, reject) => {
    if (init.signal?.aborted) {
      reject(createAbortError())
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
        const bodyAllowed = method.toUpperCase() !== "HEAD" && status !== 204 && status !== 205 && status !== 304
        const webStream = Readable.toWeb(response)
        resolve(
          new Response(bodyAllowed ? webStream : null, {
            status,
            statusText: response.statusMessage,
            headers: responseHeaders,
          }),
        )
      },
    )

    const handleAbort = () => request.destroy(createAbortError())
    init.signal?.addEventListener("abort", handleAbort, { once: true })
    request.on("close", () => init.signal?.removeEventListener("abort", handleAbort))
    request.on("error", reject)
    request.setTimeout(120_000, () => request.destroy(new Error("writer_request_timeout")))

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

if (hasLocalDevProxyTransport()) {
  globalThis.fetch = proxyAwareFetch
  console.info("local-dev.proxy.fetch.installed", {
    proxyUrl: getLocalDevProxyUrl(),
  })
}
