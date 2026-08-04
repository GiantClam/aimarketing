import assert from "node:assert/strict"
import test from "node:test"

import { withWriterAssetTaskSlot } from "./task-concurrency"

test("writer asset tasks do not overlap provider work", async () => {
  let active = 0
  let peak = 0
  const order: string[] = []

  const run = (label: string) =>
    withWriterAssetTaskSlot(async () => {
      active += 1
      peak = Math.max(peak, active)
      order.push(`${label}:start`)
      await new Promise((resolve) => setTimeout(resolve, 5))
      order.push(`${label}:end`)
      active -= 1
    })

  await Promise.all([run("first"), run("second")])

  assert.equal(peak, 1)
  assert.deepEqual(order, ["first:start", "first:end", "second:start", "second:end"])
})
