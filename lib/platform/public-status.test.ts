import assert from "node:assert/strict"
import test from "node:test"

import { getPublicProofPoints, getPublicRegistryEntryLabel } from "./public-status"

test("public registry labels translate internal availability states", () => {
  assert.equal(getPublicRegistryEntryLabel("en", "ready", "public"), "Available")
  assert.equal(getPublicRegistryEntryLabel("zh", "deferred", "public"), "即将开放")
  assert.equal(getPublicRegistryEntryLabel("en", "ready", "permission_required"), "Enterprise access")
})

test("public proof points filter internal implementation terminology", () => {
  assert.deepEqual(
    getPublicProofPoints("en", ["existing runtime binding", "enterprise_permission", "Review the generated outline"]),
    ["Review the generated outline"],
  )
  assert.deepEqual(getPublicProofPoints("zh", ["provider binding"], []), ["查看公开说明与当前可用入口"])
})
