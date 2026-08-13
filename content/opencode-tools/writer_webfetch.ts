import { lookup } from "node:dns/promises"
import { request as httpRequest } from "node:http"
import { request as httpsRequest } from "node:https"
import type { ClientRequest, IncomingMessage, RequestOptions } from "node:http"
import { isIP } from "node:net"
import { z } from "zod"

const MAX_BYTES = 1_500_000
const MAX_REDIRECTS = 3
const DEFAULT_TIMEOUT_MS = 15_000
const ALLOWED_CONTENT_TYPES = new Set(["text/html", "text/plain", "application/json"])

type LookupResult = { address: string; family: number }
type Lookup = (hostname: string, options: { all: true; verbatim: true }) => Promise<LookupResult[]>
type Requester = (options: RequestOptions, callback: (response: IncomingMessage) => void) => ClientRequest
type WriterWebfetchDeps = { lookup: Lookup; httpRequest: Requester; httpsRequest: Requester }

type WriterWebfetchOptions = {
  maxBytes?: number
  maxRedirects?: number
  timeoutMs?: number
}

function blockedIp(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "")
  if (isIP(normalized) === 4) {
    const octets = normalized.split(".").map(Number)
    const [a, b] = octets
    return a === 0 || a === 10 || a === 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127
  }
  return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb") || (normalized.startsWith("::ffff:") && blockedIp(normalized.slice("::ffff:".length)))
}

async function assertPublicUrl(raw: string, resolve: Lookup) {
  const url = new URL(raw)
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("writer_webfetch_protocol_denied")
  if (url.username || url.password) throw new Error("writer_webfetch_credentials_denied")
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase()
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || blockedIp(hostname)) {
    throw new Error("writer_webfetch_private_host_denied")
  }
  const resolved = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await resolve(hostname, { all: true, verbatim: true })
  const addresses = resolved.map((item) => item.address)
  if (!addresses.length || addresses.some(blockedIp)) throw new Error("writer_webfetch_private_host_denied")
  return { url, hostname, address: resolved[0].address, family: resolved[0].family }
}

async function requestPinned(url: URL, hostname: string, address: string, family: number, deps: WriterWebfetchDeps, options: Required<WriterWebfetchOptions>) {
  const client = url.protocol === "https:" ? deps.httpsRequest : deps.httpRequest
  return await new Promise<{ status: number; location: string | null; contentType: string; body: string }>((resolve, reject) => {
    const request = client({
      protocol: url.protocol,
      hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      headers: { Accept: "text/html, text/plain, application/json;q=0.8", Host: url.host },
      ...(url.protocol === "https:" ? { servername: hostname } : {}),
      lookup: (_hostname, _options, callback) => callback(null, address, family),
    }, (response) => {
      const chunks: string[] = []
      let size = 0
      response.on("data", (chunk: Buffer) => {
        size += chunk.byteLength
        if (size > options.maxBytes) {
          request.destroy()
          reject(new Error("writer_webfetch_response_too_large"))
          return
        }
        chunks.push(chunk.toString("utf8"))
      })
      response.on("end", () => resolve({
        status: response.statusCode || 0,
        location: response.headers.location || null,
        contentType: typeof response.headers["content-type"] === "string" ? response.headers["content-type"] : "",
        body: chunks.join(""),
      }))
      response.on("error", reject)
    })
    request.setTimeout(options.timeoutMs, () => request.destroy(new Error("writer_webfetch_timeout")))
    request.on("error", reject)
    request.end()
  })
}

function readableText(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/giu, " ")
    .replace(/<style[\s\S]*?<\/style>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/gu, " ")
    .replace(/&amp;/gu, "&")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 80_000)
}

export function createWriterWebfetchTool(deps: WriterWebfetchDeps = { lookup: lookup as Lookup, httpRequest, httpsRequest }, options: WriterWebfetchOptions = {}) {
  const limits = {
    maxBytes: options.maxBytes ?? MAX_BYTES,
    maxRedirects: options.maxRedirects ?? MAX_REDIRECTS,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  }
  return {
    description: "Fetch one public HTTP(S) URL for Writer research with SSRF and redirect protection.",
    args: {
      url: z.string().url().describe("The public HTTP or HTTPS URL to retrieve"),
    },
    async execute(args: { url: string }) {
      let current = args.url
      for (let redirects = 0; redirects <= limits.maxRedirects; redirects += 1) {
        const safe = await assertPublicUrl(current, deps.lookup)
        const response = await requestPinned(safe.url, safe.hostname, safe.address, safe.family, deps, limits)
        if (response.status >= 300 && response.status < 400) {
          const location = response.location
          if (!location || redirects === limits.maxRedirects) throw new Error("writer_webfetch_redirect_limit")
          current = new URL(location, safe.url).toString()
          continue
        }
        if (response.status < 200 || response.status >= 300) throw new Error(`writer_webfetch_http_${response.status}`)
        const contentType = response.contentType.split(";", 1)[0]?.trim().toLowerCase() ?? ""
        if (!ALLOWED_CONTENT_TYPES.has(contentType)) throw new Error("writer_webfetch_content_type_denied")
        return JSON.stringify({ url: safe.url.toString(), status: response.status, contentType, content: readableText(response.body) })
      }
      throw new Error("writer_webfetch_redirect_limit")
    },
  }
}

export default createWriterWebfetchTool()
