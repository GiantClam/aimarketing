import assert from "node:assert/strict"
import test from "node:test"

import { getAiEntryAgentById, getAiEntryAgentCatalog } from "./agent-catalog"

test("agent catalog exposes ppt assistant as an executive advisor", () => {
  const catalog = getAiEntryAgentCatalog()
  const item = getAiEntryAgentById("executive-ppt")

  assert.ok(catalog.some((entry) => entry.id === "executive-ppt"))
  assert.equal(item?.category, "executive")
  assert.equal(item?.name.zh, "PPT 助手")
  assert.match(item?.description.en || "", /downloadable PPT/i)
})
