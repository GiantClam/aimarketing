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

test("ai-ppt catalog copy reflects template choice, page planning, four candidates, and preview-before-login", () => {
  const zhTool = getLocalizedLeadToolBySlug("ai-ppt-preview", "zh")
  const enTool = getLocalizedLeadToolBySlug("ai-ppt-preview", "en")

  assert.equal(zhTool?.name, "AI PPT 生成器")
  assert.equal(enTool?.name, "AI PPT Generator")
  assert.ok(zhTool?.proofPoints.some((item) => item.includes("4 个候选")))
  assert.ok(zhTool?.proofPoints.some((item) => item.includes("页数")))
  assert.ok(zhTool?.proofPoints.some((item) => item.includes("登录前即可预览")))
  assert.ok(zhTool?.faqs.some((item) => item.question.includes("模板") || item.question.includes("页数")))
  assert.ok(enTool?.proofPoints.some((item) => item.includes("4 candidates")))
  assert.ok(enTool?.proofPoints.some((item) => item.includes("AI page planning")))
  assert.ok(enTool?.proofPoints.some((item) => item.includes("Preview before login")))
  assert.ok(enTool?.faqs.some((item) => /template|page count/i.test(item.question)))
})

test("seo remediation lead tools are exposed as live public pages with workflow routing", () => {
  const paths = getLeadToolPaths()
  const briefTool = getLocalizedLeadToolBySlug("content-brief-generator", "en")
  const descriptionTool = getLocalizedLeadToolBySlug("product-description-generator", "en")

  assert.equal(paths.includes("/tools/content-brief-generator"), true)
  assert.equal(paths.includes("/tools/product-description-generator"), true)
  assert.equal(paths.includes("/tools/press-release-generator"), true)
  assert.equal(paths.includes("/tools/bio-generator"), true)
  assert.equal(paths.includes("/tools/seo-title-generator"), true)

  assert.equal(briefTool?.status, "live")
  assert.equal(briefTool?.primaryCta?.href, "/tools/ai-seo-meta-generator")
  assert.equal(briefTool?.relatedLinks?.some((link) => link.href === "/agents/seo-article-agent"), true)
  assert.equal(descriptionTool?.secondaryCta?.href, "/tools/product-description-generator/examples/product-description-examples")
})
