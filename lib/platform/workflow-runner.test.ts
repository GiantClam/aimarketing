import assert from "node:assert/strict"
import test from "node:test"

import type { AuthUser } from "@/lib/auth/session"
import {
  buildPlatformWorkflowRunDetailPath,
  createPlatformWorkflowRun,
  getPlatformWorkflowRunDetail,
  recordPlatformWorkflowProxyResult,
  serializePlatformWorkflowRun,
  updatePlatformWorkflowRun,
} from "@/lib/platform/workflow-runner"
import {
  createInMemoryPlatformTaskRunStore,
  type HydratedPlatformTaskRun,
  type PlatformTaskRunStore,
} from "@/lib/platform/task-run-store"

function buildUser(overrides?: Partial<AuthUser>): AuthUser {
  return {
    id: 7,
    email: "demo@example.com",
    name: "Demo",
    isDemo: false,
    enterpriseId: 11,
    enterpriseCode: "acme",
    enterpriseName: "Acme",
    enterpriseRole: "admin",
    enterpriseStatus: "active",
    permissions: {
      image_design_generation: true,
      video_generation: true,
      copywriting_generation: true,
      website_generation: true,
      customer_profile_entry: true,
      expert_advisor: true,
    },
    ...overrides,
  }
}

function createWorkflowRunHarness() {
  const baseStore = createInMemoryPlatformTaskRunStore()
  const patches = new Map<number, Record<string, unknown>>()

  const store: Pick<
    PlatformTaskRunStore,
    | "createPlatformTaskRun"
    | "appendPlatformRunEvent"
    | "getPlatformTaskRun"
    | "savePlatformArtifact"
    | "promotePlatformArtifactToWorkItem"
  > & {
    patchPlatformTaskRun(runId: number, patch: Record<string, unknown>): Promise<void>
  } = {
    createPlatformTaskRun: baseStore.createPlatformTaskRun,
    appendPlatformRunEvent: baseStore.appendPlatformRunEvent,
    savePlatformArtifact: baseStore.savePlatformArtifact,
    promotePlatformArtifactToWorkItem: baseStore.promotePlatformArtifactToWorkItem,
    async getPlatformTaskRun(runId) {
      const detail = await baseStore.getPlatformTaskRun(runId)
      if (!detail) return null
      return {
        ...detail,
        ...(patches.get(runId) ?? {}),
      } as HydratedPlatformTaskRun
    },
    async patchPlatformTaskRun(runId, patch) {
      const current = patches.get(runId) ?? {}
      patches.set(runId, { ...current, ...patch, updatedAt: new Date() })
    },
  }

  return { store }
}

test("createPlatformWorkflowRun creates a local queued workflow run with a detail path", async () => {
  const { store } = createWorkflowRunHarness()

  const run = await createPlatformWorkflowRun({
    currentUser: buildUser(),
    slug: "content-repurpose",
    action: "execute",
    bindingTarget: "content-repurpose",
    inputPayload: { query: "Repurpose this article" },
    store,
  })

  assert.equal(run.status, "queued")
  assert.equal(run.itemSlug, "content-repurpose")
  assert.equal(run.events[0]?.message, "workflow_queued")
  assert.equal(buildPlatformWorkflowRunDetailPath(run.id), `/api/platform/workflows/runs/${run.id}`)

  const serialized = serializePlatformWorkflowRun(run)
  assert.equal(serialized.status, "queued")
  assert.equal(serialized.events[0]?.message, "workflow_queued")
})

test("recordPlatformWorkflowProxyResult marks async workflow responses as running and stores external run ids", async () => {
  const { store } = createWorkflowRunHarness()
  const run = await createPlatformWorkflowRun({
    currentUser: buildUser(),
    slug: "content-repurpose",
    bindingTarget: "content-repurpose",
    store,
  })

  await updatePlatformWorkflowRun({
    runId: run.id,
    store,
    patch: {
      status: "running",
      startedAt: new Date("2026-06-07T08:00:00.000Z"),
    },
  })

  const detail = await recordPlatformWorkflowProxyResult({
    runId: run.id,
    store,
    bindingTarget: "content-repurpose",
    target: {
      action: "chat",
      downstreamPath: "/api/writer/chat",
      requiresLogin: true,
    },
    response: new Response(
      JSON.stringify({
        accepted: true,
        task_id: "task-123",
      }),
      {
        status: 202,
        headers: {
          "content-type": "application/json",
        },
      },
    ),
  })

  assert.equal(detail.status, "running")
  assert.equal(detail.externalRunId, "task-123")
  assert.equal(detail.externalSystem, "writer")
  assert.equal(detail.events.at(-1)?.message, "workflow_dispatched")
  assert.equal(detail.normalizedResult?.downstreamStatus, 202)
  assert.equal(detail.artifacts.length, 1)
  assert.equal(detail.artifacts[0]?.title, "Content repurpose output")
  assert.equal(detail.workItems.length, 0)
})

test("recordPlatformWorkflowProxyResult promotes synchronous workflow outputs into work items", async () => {
  const { store } = createWorkflowRunHarness()
  const run = await createPlatformWorkflowRun({
    currentUser: buildUser(),
    slug: "campaign-launch",
    bindingTarget: "campaign-launch",
    store,
  })

  await updatePlatformWorkflowRun({
    runId: run.id,
    store,
    patch: {
      status: "running",
      startedAt: new Date("2026-06-07T08:00:00.000Z"),
    },
  })

  const detail = await recordPlatformWorkflowProxyResult({
    runId: run.id,
    store,
    bindingTarget: "campaign-launch",
    target: {
      action: "preview",
      downstreamPath: "/api/tools/ai-ppt-preview/preview",
      requiresLogin: false,
    },
    response: new Response(
      JSON.stringify({
        slides: [{ title: "Q3 launch" }],
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    ),
  })

  assert.equal(detail.status, "succeeded")
  assert.equal(detail.artifacts.length, 1)
  assert.equal(detail.workItems.length, 1)
  assert.equal(detail.workItems[0]?.type, "deck")
  assert.equal(detail.workItems[0]?.sourceArtifactId, detail.artifacts[0]?.id)
})

test("getPlatformWorkflowRunDetail hides runs from other enterprises", async () => {
  const { store } = createWorkflowRunHarness()
  const run = await createPlatformWorkflowRun({
    currentUser: buildUser(),
    slug: "campaign-launch",
    bindingTarget: "campaign-launch",
    store,
  })

  const visible = await getPlatformWorkflowRunDetail({
    runId: run.id,
    currentUser: buildUser(),
    store,
  })
  const hidden = await getPlatformWorkflowRunDetail({
    runId: run.id,
    currentUser: buildUser({ enterpriseId: 99 }),
    store,
  })

  assert.ok(visible)
  assert.equal(hidden, null)
})
