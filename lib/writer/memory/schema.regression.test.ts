import assert from "node:assert/strict"
import test from "node:test"

import { writerMemoryEvents, writerMemoryItems, writerSoulProfiles } from "@/lib/db/schema"

test("writer memory tables are registered in schema", () => {
  assert.ok(writerMemoryItems)
  assert.ok(writerSoulProfiles)
  assert.ok(writerMemoryEvents)
})

