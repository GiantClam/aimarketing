import assert from "node:assert/strict"
import test from "node:test"

import { getAiEntryAgentById, getAiEntryAgentCatalog } from "./agent-catalog"

test("agent catalog exposes ppt assistant as an executive advisor", () => {
  const catalog = getAiEntryAgentCatalog()
  const item = getAiEntryAgentById("executive-ppt")
  const presentationItem = getAiEntryAgentById("executive-presentation-ppt")

  assert.ok(catalog.some((entry) => entry.id === "executive-ppt"))
  assert.ok(catalog.some((entry) => entry.id === "executive-presentation-ppt"))
  assert.equal(item?.category, "executive")
  assert.equal(item?.name.zh, "可编辑 PPT 助手")
  assert.match(item?.description.en || "", /downloadable, editable PPTX presentation/i)
  assert.equal(presentationItem?.category, "executive")
  assert.equal(presentationItem?.name.zh, "演讲型 PPT 助手")
  assert.match(presentationItem?.description.en || "", /presentation-first HTML deck/i)
})
