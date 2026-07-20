import test from "node:test"
import assert from "node:assert/strict"

import { createProviderRouteToken, verifyProviderRouteToken } from "./provider-proxy"

test("provider proxy route tokens bind provider/model and expire", () => {
  const token = createProviderRouteToken({ secret: "proxy-secret", providerId: "deepseek", modelId: "deepseek-v4-pro", runId: "00000000-0000-4000-8000-000000000001", enterpriseId: 42, ttlMs: 30_000 })
  const claims = verifyProviderRouteToken(token, "proxy-secret")
  assert.equal(claims?.providerId, "deepseek")
  assert.equal(claims?.modelId, "deepseek-v4-pro")
  assert.equal(verifyProviderRouteToken(`${token}tampered`, "proxy-secret"), null)
  assert.equal(verifyProviderRouteToken(token, "wrong-secret"), null)
})

test("provider proxy route token caps TTL at one hour", () => {
  const token = createProviderRouteToken({ secret: "proxy-secret", providerId: "deepseek", modelId: "deepseek-v4-pro", runId: "00000000-0000-4000-8000-000000000001", enterpriseId: null, ttlMs: 24 * 60 * 60 * 1000 })
  const claims = verifyProviderRouteToken(token, "proxy-secret")
  assert.ok(claims)
  assert.ok(claims.expiresAt - Date.now() <= 60 * 60 * 1000)
})
