import assert from "node:assert/strict"
import test from "node:test"

import { FEATURE_KEYS, buildPermissionMap, type FeatureKey } from "@/lib/enterprise/constants"
import type { AuthUserPayload } from "@/lib/enterprise/server"
import { getAdvisorFeature, hasFeatureAccess } from "./guards"

function buildUser(overrides: Partial<AuthUserPayload> = {}): AuthUserPayload {
  return {
    id: 1,
    email: "user@example.com",
    name: "User",
    isDemo: false,
    enterpriseId: 1,
    enterpriseCode: "enterprise",
    enterpriseName: "Enterprise",
    enterpriseRole: "member",
    enterpriseStatus: "active",
    permissions: buildPermissionMap(false),
    ...overrides,
  }
}

test("NORMAL: enterprise admin with active status has access to all features", () => {
  const user = buildUser({
    enterpriseRole: "admin",
    enterpriseStatus: "active",
    permissions: buildPermissionMap(false),
  })

  for (const feature of FEATURE_KEYS) {
    assert.equal(hasFeatureAccess(user, feature), true, feature)
  }
})

test("NORMAL: active member access follows feature permission map", () => {
  const permissions = buildPermissionMap(false)
  permissions.copywriting_generation = true
  const user = buildUser({ permissions })

  assert.equal(hasFeatureAccess(user, "copywriting_generation"), true)
  assert.equal(hasFeatureAccess(user, "image_design_generation"), false)
})

test("SECURITY: inactive enterprise user cannot access feature even with permission", () => {
  const permissions = buildPermissionMap(true)
  const user = buildUser({
    enterpriseStatus: "suspended",
    permissions,
  })

  assert.equal(hasFeatureAccess(user, "copywriting_generation"), false)
})

test("NORMAL: missing feature means session-only access check", () => {
  const user = buildUser({ enterpriseStatus: "pending" })

  assert.equal(hasFeatureAccess(user), true)
})

test("NORMAL: advisor types map to their required feature keys", () => {
  const cases: Array<[string | null | undefined, FeatureKey | null]> = [
    ["copywriting", "copywriting_generation"],
    ["lead-hunter", "customer_profile_entry"],
    ["brand-strategy", "expert_advisor"],
    ["growth", "expert_advisor"],
    ["company-search", "expert_advisor"],
    ["contact-mining", "expert_advisor"],
    ["unknown", null],
    [null, null],
    [undefined, null],
  ]

  for (const [advisorType, feature] of cases) {
    assert.equal(getAdvisorFeature(advisorType), feature, String(advisorType))
  }
})
