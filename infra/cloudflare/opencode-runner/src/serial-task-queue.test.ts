import assert from "node:assert/strict"
import { test } from "node:test"

import { SerialTaskQueue } from "./serial-task-queue"

test("serializes tasks that share a sandbox session", async () => {
  const queue = new SerialTaskQueue()
  const active: string[] = []
  const order: string[] = []
  const run = (name: string, delay: number) => queue.run(async () => {
    active.push(name)
    assert.equal(active.length, 1)
    order.push(`${name}:started`)
    await new Promise((resolve) => setTimeout(resolve, delay))
    order.push(`${name}:completed`)
    active.pop()
    return name
  })

  const results = await Promise.all([run("first", 5), run("second", 1), run("third", 1)])
  assert.deepEqual(results, ["first", "second", "third"])
  assert.deepEqual(order, ["first:started", "first:completed", "second:started", "second:completed", "third:started", "third:completed"])
})

test("a failed task does not block the next session task", async () => {
  const queue = new SerialTaskQueue()
  const first = queue.run(async () => { throw new Error("first_failed") })
  const second = queue.run(async () => "second_succeeded")

  await assert.rejects(first, /first_failed/u)
  assert.equal(await second, "second_succeeded")
})
