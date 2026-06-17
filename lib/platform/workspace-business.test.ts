import assert from "node:assert/strict"
import test from "node:test"

import {
  CORE_WORKSPACE_BUSINESS_SLUGS,
  IMPORTED_WORKSPACE_BUSINESS_SLUGS,
  WORKSPACE_BUSINESS_SLUGS,
  buildDashboardBusinessHref,
  getLocalizedWorkspaceBusinessEntries,
  getLocalizedWorkspaceMarketplaceEntries,
  resolveWorkspaceBusinessSlug,
} from "@/lib/platform/workspace-business"

test("business workspace href stays on the unified super workbench route", () => {
  assert.equal(buildDashboardBusinessHref("sales-close"), "/dashboard/business?view=sales-close")
  assert.equal(
    buildDashboardBusinessHref("content-growth", { agentId: "business-seo-repurpose" }),
    "/dashboard/business?view=content-growth&agent=business-seo-repurpose",
  )
})

test("business workspace slug resolver falls back safely for invalid views", () => {
  assert.equal(resolveWorkspaceBusinessSlug("brand-creative"), "brand-creative")
  assert.equal(resolveWorkspaceBusinessSlug("not-a-real-view"), "content-growth")
  assert.equal(resolveWorkspaceBusinessSlug(null, "sales-close"), "sales-close")
})

test("localized business workspace entries stay focused on the default business lanes", () => {
  const zhEntries = getLocalizedWorkspaceBusinessEntries("zh")
  const enEntries = getLocalizedWorkspaceBusinessEntries("en")

  assert.equal(zhEntries.length, CORE_WORKSPACE_BUSINESS_SLUGS.length)
  assert.equal(enEntries.length, CORE_WORKSPACE_BUSINESS_SLUGS.length)
  assert.ok(zhEntries.some((entry) => entry.slug === "compliance-risk" && entry.title.includes("合规")))
  assert.ok(zhEntries.some((entry) => entry.slug === "training-enablement" && entry.title.includes("培训")))
  assert.ok(zhEntries.some((entry) => entry.slug === "talent-recruiting" && entry.title.includes("招聘")))
  assert.ok(enEntries.some((entry) => entry.slug === "legal-ops" && entry.title.includes("Legal")))
  assert.ok(!enEntries.some((entry) => entry.slug === "marketing"))
  assert.ok(!enEntries.some((entry) => entry.slug === "spatial-computing"))
})

test("marketplace entries expose the full imported category catalog and can be filtered by selected slugs", () => {
  const allEntries = getLocalizedWorkspaceMarketplaceEntries("en")
  const filteredEntries = getLocalizedWorkspaceBusinessEntries("en", {
    includeImportedSlugs: ["marketing", "engineering"],
  })

  assert.equal(WORKSPACE_BUSINESS_SLUGS.length, CORE_WORKSPACE_BUSINESS_SLUGS.length + IMPORTED_WORKSPACE_BUSINESS_SLUGS.length)
  assert.equal(allEntries.length, IMPORTED_WORKSPACE_BUSINESS_SLUGS.length)
  assert.ok(allEntries.some((entry) => entry.slug === "marketing" && entry.title.includes("Marketing")))
  assert.ok(allEntries.some((entry) => entry.slug === "spatial-computing" && entry.title.includes("Spatial")))
  assert.ok(filteredEntries.some((entry) => entry.slug === "marketing"))
  assert.ok(filteredEntries.some((entry) => entry.slug === "engineering"))
  assert.ok(!filteredEntries.some((entry) => entry.slug === "testing"))
})
