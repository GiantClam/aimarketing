import assert from "node:assert/strict"
import test from "node:test"

import {
  buildCompactCardSummary,
  pickPrimaryStatusBadge,
} from "@/lib/workspace/compact-business-card"

test("buildCompactCardSummary prefers the first non-empty summary candidate", () => {
  assert.equal(
    buildCompactCardSummary(["", "Generate launch-ready workflow variants", "ignored tail"]),
    "Generate launch-ready workflow variants",
  )
})

test("buildCompactCardSummary falls back to a safe title-derived string", () => {
  assert.equal(
    buildCompactCardSummary([], "brand-story-automation"),
    "Brand story automation",
  )
})

test("pickPrimaryStatusBadge keeps exactly one badge", () => {
  assert.deepEqual(
    pickPrimaryStatusBadge([
      { label: "Live", tone: "success" },
      { label: "12 nodes", tone: "neutral" },
    ]),
    { label: "Live", tone: "success" },
  )
})
