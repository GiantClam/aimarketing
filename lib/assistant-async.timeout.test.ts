import assert from "node:assert/strict"
import test from "node:test"

import { withTaskTimeout } from "./task-timeout"

test("withTaskTimeout aborts the provided controller when the task budget expires", async () => {
  const controller = new AbortController()
  let sawAbort = false
  const neverFinishes = new Promise<void>((_resolve, reject) => {
    controller.signal.addEventListener(
      "abort",
      () => {
        sawAbort = true
        reject(new Error("request_aborted"))
      },
      { once: true },
    )
  })

  await assert.rejects(
    withTaskTimeout(neverFinishes, 1, "image_assistant_task_timeout", { abortController: controller }),
    /image_assistant_task_timeout/,
  )
  assert.equal(controller.signal.aborted, true)
  assert.equal(sawAbort, true)
})
