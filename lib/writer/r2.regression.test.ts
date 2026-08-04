import assert from "node:assert/strict"
import test from "node:test"

import { executeImageProviderPlan } from "../image-generation/provider-orchestration"
import { parseWriterDataUrl } from "./r2"

test("parseWriterDataUrl decodes normal data urls", () => {
  const source = "hello-writer"
  const dataUrl = `data:image/png;base64,${Buffer.from(source).toString("base64")}`
  const parsed = parseWriterDataUrl(dataUrl)

  assert.equal(parsed.contentType, "image/png")
  assert.equal(parsed.buffer.toString("utf8"), source)
})

test("parseWriterDataUrl tolerates whitespace in payload", () => {
  const source = "whitespace-ok"
  const base64 = Buffer.from(source).toString("base64")
  const withWhitespace = `${base64.slice(0, 4)} \n${base64.slice(4)}`
  const dataUrl = `data:image/webp;base64,${withWhitespace}`
  const parsed = parseWriterDataUrl(dataUrl)

  assert.equal(parsed.contentType, "image/webp")
  assert.equal(parsed.buffer.toString("utf8"), source)
})

test("parseWriterDataUrl rejects non-base64 data urls", () => {
  assert.throws(() => parseWriterDataUrl("data:image/png,plain-text"), /writer_asset_data_url_invalid/)
})

test("parseWriterDataUrl rejects malformed base64 payloads", () => {
  assert.throws(
    () => parseWriterDataUrl("data:image/png;base64,not-a-valid-data-url!"),
    /writer_asset_data_url_invalid/,
  )
  assert.throws(() => parseWriterDataUrl("data:image/png;base64,===="), /writer_asset_data_url_invalid/)
})

test("invalid provider image payload triggers provider fallback before upload", async () => {
  const failures: string[] = []
  const validDataUrl = `data:image/png;base64,${Buffer.from("valid-image").toString("base64")}`
  const result = await executeImageProviderPlan({
    providerPlan: ["pptoken", "aiberm"],
    handlers: {
      pptoken: async () => {
        parseWriterDataUrl("data:image/png;base64,not-a-valid-data-url!")
        return { dataUrl: "unreachable" }
      },
      aiberm: async () => ({ dataUrl: validDataUrl }),
    },
    onProviderFailure: ({ provider }) => failures.push(provider),
  })

  assert.equal(result.provider, "aiberm")
  assert.deepEqual(failures, ["pptoken"])
})
