import assert from "node:assert/strict"
import test from "node:test"

import { isSyncablePlatformRun, syncPlatformTaskRuns } from "@/lib/platform/task-run-sync"

test("isSyncablePlatformRun accepts recent queued async workflow and media runs", () => {
  const recent = new Date(Date.now() - 60_000)

  assert.equal(
    isSyncablePlatformRun({
      kind: "media",
      status: "queued",
      externalSystem: "runninghub",
      externalRunId: "task-1",
      createdAt: recent,
    }),
    true,
  )

  assert.equal(
    isSyncablePlatformRun({
      kind: "workflow",
      status: "running",
      externalSystem: "writer",
      externalRunId: "job-1",
      createdAt: recent,
    }),
    true,
  )
})

test("isSyncablePlatformRun rejects stale, local-only, and terminal runs", () => {
  const stale = new Date(Date.now() - 25 * 60 * 60 * 1000)

  assert.equal(
    isSyncablePlatformRun({
      kind: "tool",
      status: "queued",
      externalSystem: "runninghub",
      externalRunId: "task-1",
      createdAt: new Date(),
    }),
    false,
  )
  assert.equal(
    isSyncablePlatformRun({
      kind: "media",
      status: "succeeded",
      externalSystem: "runninghub",
      externalRunId: "task-1",
      createdAt: new Date(),
    }),
    false,
  )
  assert.equal(
    isSyncablePlatformRun({
      kind: "workflow",
      status: "running",
      externalSystem: null,
      externalRunId: null,
      createdAt: new Date(),
    }),
    false,
  )
  assert.equal(
    isSyncablePlatformRun({
      kind: "media",
      status: "running",
      externalSystem: "runninghub",
      externalRunId: "task-1",
      createdAt: stale,
    }),
    false,
  )
})

test("syncPlatformTaskRuns patches generic runninghub runs with normalized results", async () => {
  const patched: Array<{ runId: number; patch: Record<string, unknown> }> = []
  const events: Array<{ runId: number; message: string }> = []

  const result = await syncPlatformTaskRuns(
    { limit: 10 },
    {
      listRuns: async () => [
        {
          id: 11,
          enterpriseId: 3,
          userId: 7,
          kind: "media",
          itemSlug: "ai-image",
          status: "running",
          externalSystem: "runninghub",
          externalRunId: "rh-1",
          createdAt: new Date(),
          inputPayload: null,
          normalizedResult: null,
        },
      ],
      patchRun: async (runId, patch) => {
        patched.push({ runId, patch })
      },
      appendEvent: async (runId, input) => {
        events.push({ runId, message: input.message })
        return {
          id: 1,
          runId,
          level: input.level,
          message: input.message,
          payload: input.payload ?? null,
          createdAt: new Date(),
        }
      },
      queryRunningHubTask: async () => ({
        taskId: "rh-1",
        status: "SUCCESS",
        results: [
          {
            url: "https://example.com/output.png",
            outputType: "png",
            text: "ok",
          },
        ],
      }),
    },
  )

  assert.deepEqual(result, {
    scanned: 1,
    updated: 1,
    failed: 0,
  })
  assert.equal(patched.length, 1)
  assert.equal(patched[0]?.runId, 11)
  assert.equal(patched[0]?.patch.status, "succeeded")
  assert.equal(events[0]?.message, "platform_task_sync_succeeded")
})

test("syncPlatformTaskRuns uses minimax query helper and warns on unsupported upstreams", async () => {
  const events: Array<{ runId: number; message: string }> = []
  let minimaxCalls = 0

  const result = await syncPlatformTaskRuns(
    { limit: 10 },
    {
      listRuns: async () => [
        {
          id: 21,
          enterpriseId: 5,
          userId: 9,
          kind: "media",
          itemSlug: "voice-synthesis",
          status: "running",
          externalSystem: "minimax",
          externalRunId: "mm-1",
          createdAt: new Date(),
          inputPayload: null,
          normalizedResult: null,
        },
        {
          id: 22,
          enterpriseId: 5,
          userId: 9,
          kind: "workflow",
          itemSlug: "content-repurpose",
          status: "queued",
          externalSystem: "writer",
          externalRunId: "writer-1",
          createdAt: new Date(),
          inputPayload: null,
          normalizedResult: null,
        },
      ],
      appendEvent: async (runId, input) => {
        events.push({ runId, message: input.message })
        return {
          id: 1,
          runId,
          level: input.level,
          message: input.message,
          payload: input.payload ?? null,
          createdAt: new Date(),
        }
      },
      queryMiniMaxAudioTask: async () => {
        minimaxCalls += 1
        return {
          taskId: "21",
          mediaTarget: "ai-music",
          requestedTarget: "voice-synthesis",
          provider: "minimax",
          status: "RUNNING",
          results: [],
          raw: {
            task_id: "mm-1",
          },
        }
      },
    },
  )

  assert.deepEqual(result, {
    scanned: 2,
    updated: 1,
    failed: 0,
  })
  assert.equal(minimaxCalls, 1)
  assert.equal(events[0]?.runId, 22)
  assert.equal(events[0]?.message, "platform_task_sync_unsupported_upstream")
})

test("syncPlatformTaskRuns routes minimax and runninghub video runs through video query helpers", async () => {
  let minimaxVideoCalls = 0
  let runningHubVideoCalls = 0

  const result = await syncPlatformTaskRuns(
    { limit: 10 },
    {
      listRuns: async () => [
        {
          id: 31,
          enterpriseId: 5,
          userId: 9,
          kind: "media",
          itemSlug: "text-to-video",
          status: "running",
          externalSystem: "minimax",
          externalRunId: "hailuo-1",
          createdAt: new Date(),
          inputPayload: null,
          normalizedResult: null,
        },
        {
          id: 32,
          enterpriseId: 5,
          userId: 9,
          kind: "media",
          itemSlug: "image-to-video",
          status: "running",
          externalSystem: "runninghub",
          externalRunId: "seedance-1",
          createdAt: new Date(),
          inputPayload: null,
          normalizedResult: null,
        },
      ],
      appendEvent: async (runId, input) => ({
        id: 1,
        runId,
        level: input.level,
        message: input.message,
        payload: input.payload ?? null,
        createdAt: new Date(),
      }),
      queryMiniMaxVideoTask: async () => {
        minimaxVideoCalls += 1
        return {
          taskId: "31",
          mediaTarget: "ai-video",
          requestedTarget: "text-to-video",
          provider: "minimax",
          status: "RUNNING",
          results: [],
          raw: {
            task_id: "hailuo-1",
          },
        }
      },
      queryRunningHubVideoTask: async () => {
        runningHubVideoCalls += 1
        return {
          taskId: "32",
          mediaTarget: "ai-video",
          requestedTarget: "image-to-video",
          provider: "runninghub",
          status: "RUNNING",
          results: [],
          raw: {
            taskId: "seedance-1",
          },
        }
      },
    },
  )

  assert.deepEqual(result, {
    scanned: 2,
    updated: 2,
    failed: 0,
  })
  assert.equal(minimaxVideoCalls, 1)
  assert.equal(runningHubVideoCalls, 1)
})
