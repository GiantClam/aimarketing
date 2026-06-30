import assert from "node:assert/strict"
import test from "node:test"

import { getLocalizedPlatformCatalog, getLocalizedPlatformWorkflows } from "@/lib/platform/catalog"

test("platform catalog localizes into English by default shape", () => {
  const catalog = getLocalizedPlatformCatalog("en")

  assert.ok(catalog.capabilities.length > 0)
  assert.equal(catalog.capabilities[0]?.title.includes("AI") || catalog.capabilities[0]?.title.includes("Agent"), true)
  assert.ok(catalog.hubs.some((item) => item.href === "/capabilities"))
})

test("workspace surface excludes public-only items and keeps shared ones", () => {
  const catalog = getLocalizedPlatformCatalog("zh", "workspace")

  assert.ok(catalog.capabilities.every((item) => item.surface === "workspace" || item.surface === "both"))
  assert.ok(catalog.plugins.every((item) => item.surface === "workspace" || item.surface === "both"))
})

test("workflow catalog exposes expanded enterprise workflow templates", () => {
  const workflows = getLocalizedPlatformWorkflows("en", "workspace")
  const workflowSlugs = workflows.map((item) => item.slug)

  assert.equal(workflowSlugs.includes("sales-proposal"), true)
  assert.equal(workflowSlugs.includes("paid-media-creative-pipeline"), true)
  assert.equal(workflowSlugs.includes("seo-aeo-growth-engine"), true)
  assert.equal(workflowSlugs.includes("knowledge-asset-loop"), true)
})
