import { createServer, type Server } from "node:http"
import { request as httpRequest, type IncomingMessage, type RequestOptions } from "node:http"
import { request as httpsRequest } from "node:https"
import test from "node:test"
import assert from "node:assert/strict"
import { createWriterWebfetchTool } from "./writer_webfetch"

const publicHost = "public.example.test"

function fixtureLookup() {
  return async (): Promise<Array<{ address: string; family: number }>> => [{ address: "93.184.216.34", family: 4 }]
}

function fixtureDeps() {
  const fixtureRequest = (options: RequestOptions, callback: (response: IncomingMessage) => void) => httpRequest({ ...options, hostname: "127.0.0.1", lookup: undefined }, callback)
  return { lookup: fixtureLookup(), httpRequest: fixtureRequest, httpsRequest }
}

async function listen(handler: (path: string, response: import("node:http").ServerResponse) => void) {
  const server = createServer((request, response) => handler(new URL(request.url ?? "/", "http://127.0.0.1").pathname, response))
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve) })
  const address = server.address()
  assert.ok(address && typeof address === "object")
  return { server, url: `http://${publicHost}:${address.port}` }
}

async function close(server: Server) {
  await new Promise<void>((resolve) => server.close(() => resolve()))
}

test("writer_webfetch follows safe redirects and returns the final URL/content type", async () => {
  const fixture = await listen((path, response) => {
    if (path === "/start") {
      response.writeHead(302, { location: "/final" })
      response.end()
      return
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" })
    response.end("<h1>Hello</h1><script>ignore()</script>")
  })
  try {
    const result = JSON.parse(await createWriterWebfetchTool(fixtureDeps()).execute({ url: `${fixture.url}/start` })) as Record<string, unknown>
    assert.equal(result.url, `${fixture.url}/final`)
    assert.equal(result.contentType, "text/html")
    assert.equal(result.content, "Hello")
  } finally {
    await close(fixture.server)
  }
})

test("writer_webfetch rejects non-HTTP(S), credentials, private hosts and private DNS answers", async () => {
  const tool = createWriterWebfetchTool(fixtureDeps())
  await assert.rejects(tool.execute({ url: "ftp://public.example.test/file" }), /writer_webfetch_protocol_denied/)
  await assert.rejects(tool.execute({ url: "http://user:pass@public.example.test/file" }), /writer_webfetch_credentials_denied/)
  await assert.rejects(tool.execute({ url: "http://localhost/file" }), /writer_webfetch_private_host_denied/)
  const privateDns = createWriterWebfetchTool({ ...fixtureDeps(), lookup: async () => [{ address: "10.0.0.1", family: 4 }] })
  await assert.rejects(privateDns.execute({ url: "http://public.example.test/file" }), /writer_webfetch_private_host_denied/)
})

test("writer_webfetch rejects unsupported content types and bounded redirect loops", async () => {
  const fixture = await listen((path, response) => {
    if (path === "/loop") {
      response.writeHead(302, { location: "/loop" })
      response.end()
      return
    }
    if (path === "/error") {
      response.writeHead(502, { "content-type": "text/plain" })
      response.end("upstream failure")
      return
    }
    response.writeHead(200, { "content-type": "application/octet-stream" })
    response.end("binary")
  })
  try {
    const tool = createWriterWebfetchTool(fixtureDeps(), { maxRedirects: 2 })
    await assert.rejects(tool.execute({ url: `${fixture.url}/binary` }), /writer_webfetch_content_type_denied/)
    await assert.rejects(tool.execute({ url: `${fixture.url}/loop` }), /writer_webfetch_redirect_limit/)
    await assert.rejects(tool.execute({ url: `${fixture.url}/error` }), /writer_webfetch_http_502/)
  } finally {
    await close(fixture.server)
  }
})

test("writer_webfetch bounds response bytes and request timeouts", async () => {
  const fixture = await listen((path, response) => {
    if (path === "/slow") return
    response.writeHead(200, { "content-type": "text/plain" })
    response.end("0123456789abcdef")
  })
  try {
    const small = createWriterWebfetchTool(fixtureDeps(), { maxBytes: 8 })
    await assert.rejects(small.execute({ url: `${fixture.url}/large` }), /writer_webfetch_response_too_large/)
    const timeout = createWriterWebfetchTool(fixtureDeps(), { timeoutMs: 20 })
    await assert.rejects(timeout.execute({ url: `${fixture.url}/slow` }), /writer_webfetch_timeout/)
  } finally {
    await close(fixture.server)
  }
})
