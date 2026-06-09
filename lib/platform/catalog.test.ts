import assert from "node:assert/strict"
import test from "node:test"

import { getLocalizedPlatformCatalog } from "@/lib/platform/catalog"

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
