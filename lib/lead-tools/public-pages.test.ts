import assert from "node:assert/strict"
import test from "node:test"

import { getLeadToolExampleMetadata, getLeadToolMetadata, getToolsHubMetadata } from "@/lib/lead-tools/public-metadata"

test("lead tool metadata uses localized canonical URLs for hub, tool pages, and example pages", () => {
  const hubMetadata = getToolsHubMetadata("zh")
  const toolMetadata = getLeadToolMetadata("zh", "ai-ppt-preview")
  const exampleMetadata = getLeadToolExampleMetadata("zh", "ai-ppt-preview", "product-launch-deck")

  assert.deepEqual(hubMetadata.title, {
    absolute: "AI 工具目录 | AI Marketing",
  })
  assert.equal(hubMetadata.alternates?.canonical?.toString(), "http://localhost:3000/zh/tools")
  assert.equal(hubMetadata.alternates?.languages?.en?.toString(), "http://localhost:3000/en/tools")

  assert.deepEqual(toolMetadata.title, {
    absolute: "AI PPT 快速预览 | AI Marketing",
  })
  assert.equal(toolMetadata.alternates?.canonical?.toString(), "http://localhost:3000/zh/tools/ai-ppt-preview")
  assert.equal(toolMetadata.alternates?.languages?.en?.toString(), "http://localhost:3000/en/tools/ai-ppt-preview")

  assert.equal(
    exampleMetadata.alternates?.canonical?.toString(),
    "http://localhost:3000/zh/tools/ai-ppt-preview/examples/product-launch-deck",
  )
  assert.equal(
    exampleMetadata.alternates?.languages?.en?.toString(),
    "http://localhost:3000/en/tools/ai-ppt-preview/examples/product-launch-deck",
  )
})
