import assert from "node:assert/strict"
import http from "node:http"
import test from "node:test"

import { imageSourceToDataUrl } from "./assets"

test("imageSourceToDataUrl returns inline data urls unchanged", async () => {
  const dataUrl = "data:image/png;base64,aW1hZ2U="

  const result = await imageSourceToDataUrl(dataUrl)

  assert.equal(result, dataUrl)
})

test("imageSourceToDataUrl materializes remote image urls into data urls", async () => {
  const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yX2cAAAAASUVORK5CYII="
  const pngBuffer = Buffer.from(pngBase64, "base64")
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "image/png" })
    response.end(pngBuffer)
  })

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()))

  try {
    const address = server.address()
    if (!address || typeof address === "string") {
      throw new Error("test_server_address_unavailable")
    }

    const result = await imageSourceToDataUrl(`http://127.0.0.1:${address.port}/asset.png`)

    assert.match(result, /^data:image\/png;base64,/)
    assert.equal(Buffer.from(result.split(",")[1] || "", "base64").toString("base64"), pngBuffer.toString("base64"))
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  }
})
