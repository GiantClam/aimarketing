import assert from "node:assert/strict"
import test from "node:test"

import {
  getLeadToolBySlug,
  getLeadToolPaths,
  getLocalizedLeadToolBySlug,
  getLocalizedLeadToolsCatalog,
} from "@/lib/lead-tools/catalog"

test("lead tool catalog hides deferred video-remake and hot-video research entries from public listings", () => {
  const paths = getLeadToolPaths()
  const catalog = getLocalizedLeadToolsCatalog("en")

  assert.equal(paths.includes("/tools/video-remake-studio"), false)
  assert.equal(paths.includes("/tools/hot-video-research"), false)
  assert.equal(catalog.some((tool) => tool.slug === "video-remake-studio"), false)
  assert.equal(catalog.some((tool) => tool.slug === "hot-video-research"), false)
  assert.equal(getLeadToolBySlug("video-remake-studio"), undefined)
  assert.equal(getLeadToolBySlug("hot-video-research"), undefined)
})

test("localized ai-video copy stays scoped to the four shipped video flows", () => {
  const zhTool = getLocalizedLeadToolBySlug("ai-video", "zh")
  const enTool = getLocalizedLeadToolBySlug("ai-video", "en")

  assert.ok(zhTool)
  assert.ok(enTool)

  assert.deepEqual(zhTool?.proofPoints, ["统一视频入口", "覆盖 4 个已上线视频流", "保留现有 dashboard/video runtime"])
  assert.deepEqual(enTool?.proofPoints, [
    "Unified video entry",
    "Covers the 4 shipped video flows",
    "Keeps the current dashboard/video runtime",
  ])

  assert.equal(zhTool?.faqs[0]?.question.includes("视频复刻"), false)
  assert.equal(enTool?.proofPoints.some((item) => item.includes("future video-clone")), false)
})
