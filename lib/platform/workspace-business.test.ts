import assert from "node:assert/strict"
import test from "node:test"

import {
  WORKSPACE_BUSINESS_SLUGS,
  buildDashboardBusinessHref,
  getLocalizedWorkspaceBusinessEntries,
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

test("localized business workspace entries cover the expanded business taxonomy", () => {
  const zhEntries = getLocalizedWorkspaceBusinessEntries("zh")
  const enEntries = getLocalizedWorkspaceBusinessEntries("en")

  assert.equal(zhEntries.length, WORKSPACE_BUSINESS_SLUGS.length)
  assert.equal(enEntries.length, WORKSPACE_BUSINESS_SLUGS.length)
  assert.ok(zhEntries.some((entry) => entry.slug === "compliance-risk" && entry.title.includes("合规")))
  assert.ok(zhEntries.some((entry) => entry.slug === "training-enablement" && entry.title.includes("培训")))
  assert.ok(zhEntries.some((entry) => entry.slug === "talent-recruiting" && entry.title.includes("招聘")))
  assert.ok(enEntries.some((entry) => entry.slug === "legal-ops" && entry.title.includes("Legal")))
})
