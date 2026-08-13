import assert from "node:assert/strict"
import test from "node:test"

import { searchWriterEnterpriseKnowledge } from "./enterprise-search"

test("writer enterprise search binds retrieval to the authenticated enterprise", async () => {
  const calls: Array<Record<string, unknown>> = []
  const result = await searchWriterEnterpriseKnowledge(
    {
      authenticatedEnterpriseId: 42,
      requestedEnterpriseId: 999,
      query: "product positioning",
      platform: "wechat",
      mode: "article",
    },
    {
      retrieve: async (input) => {
        calls.push(input as Record<string, unknown>)
        return {
          source: "dify",
          datasetsUsed: [{ datasetId: "ds-1", datasetName: "Product", scope: "product" }],
          snippets: [{
            datasetId: "ds-1",
            datasetName: "Product",
            scope: "product",
            score: 0.91,
            title: "Product facts",
            content: "API key: secret-do-not-return; product supports workflow automation.",
          }],
        }
      },
    },
  )

  assert.equal(calls[0]?.enterpriseId, 42)
  assert.notEqual(calls[0]?.enterpriseId, 999)
  assert.deepEqual(result?.datasetsUsed, [{ datasetId: "ds-1", datasetName: "Product", scope: "product" }])
  assert.equal(result?.source, "dify")
  assert.equal(result?.snippets[0]?.content, "product supports workflow automation.")
  assert.equal(JSON.stringify(result).includes("secret-do-not-return"), false)
})
test("writer enterprise search is read-only and returns no cross-enterprise context", async () => {
  let called = false
  const result = await searchWriterEnterpriseKnowledge(
    {
      authenticatedEnterpriseId: null,
      requestedEnterpriseId: 42,
      query: "anything",
      platform: "wechat",
      mode: "article",
    },
    { retrieve: async () => { called = true; return null } },
  )

  assert.equal(result, null)
  assert.equal(called, false)
})
