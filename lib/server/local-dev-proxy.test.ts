import assert from "node:assert/strict"
import http from "node:http"
import test from "node:test"

import { proxyAwareFetch } from "./local-dev-proxy"

test("proxyAwareFetch serializes FormData bodies with multipart headers", async () => {
  let receivedContentType = ""
  let receivedBody = ""

  const server = http.createServer((req, res) => {
    receivedContentType = String(req.headers["content-type"] || "")
    const chunks: Buffer[] = []
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    req.on("end", () => {
      receivedBody = Buffer.concat(chunks).toString("utf8")
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify({ ok: true }))
    })
  })

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()))
  const address = server.address()
  assert(address && typeof address === "object")

  try {
    const form = new FormData()
    form.set("model", "gpt-image-2")
    form.set("prompt", "Edit this reference image")
    form.append("image", new Blob([Buffer.from("reference-image")], { type: "image/png" }), "ref.png")

    const response = await proxyAwareFetch(
      `http://127.0.0.1:${address.port}/upload`,
      {
        method: "POST",
        body: form,
      },
      {},
      new http.Agent({ keepAlive: false }),
    )

    assert.equal(response.status, 200)
    assert.match(receivedContentType, /^multipart\/form-data; boundary=/)
    assert.match(receivedBody, /name="model"\r\n\r\ngpt-image-2/)
    assert.match(receivedBody, /name="prompt"\r\n\r\nEdit this reference image/)
    assert.match(receivedBody, /name="image"; filename="ref\.png"/)
    assert.match(receivedBody, /reference-image/)
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  }
})
