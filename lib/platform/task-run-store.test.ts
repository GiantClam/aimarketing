import assert from "node:assert/strict"
import test from "node:test"

import {
  buildPlatformArtifactRecord,
  buildPlatformKnowledgeSaveJobRecord,
  buildPlatformTaskRunRecord,
  buildPlatformWorkItemRecord,
  createInMemoryPlatformTaskRunStore,
} from "@/lib/platform/task-run-store"

test("platform task run records normalize workflow and media runs", () => {
  const run = buildPlatformTaskRunRecord({
    enterpriseId: 3,
    userId: 7,
    kind: "workflow",
    itemType: "mcp_service",
    itemSlug: "Campaign Launch",
    externalSystem: " n8n ",
    status: "queued",
  })

  assert.equal(run.kind, "workflow")
  assert.equal(run.status, "queued")
  assert.equal(run.itemType, "mcp_service")
  assert.equal(run.itemSlug, "campaign-launch")
  assert.equal(run.externalSystem, "n8n")
  assert.ok(run.createdAt instanceof Date)
  assert.ok(run.updatedAt instanceof Date)
})

test("platform artifact, work item, and knowledge job records keep lineage", () => {
  const artifact = buildPlatformArtifactRecord({
    runId: 11,
    enterpriseId: 3,
    ownerUserId: 7,
    kind: "file",
    title: "Campaign brief deck",
    storageKey: "artifacts/decks/q3-brief.pptx",
  })
  const work = buildPlatformWorkItemRecord({
    sourceArtifactId: 21,
    enterpriseId: 3,
    ownerUserId: 7,
    type: "deck",
    title: "Campaign brief deck",
  })
  const knowledgeJob = buildPlatformKnowledgeSaveJobRecord({
    artifactId: 21,
    enterpriseId: 3,
    ownerUserId: 7,
    requestPayload: { targetId: "kb-1" },
  })

  assert.equal(artifact.runId, 11)
  assert.equal(artifact.storageKey, "artifacts/decks/q3-brief.pptx")
  assert.equal(work.sourceArtifactId, 21)
  assert.equal(work.type, "deck")
  assert.equal(knowledgeJob.artifactId, 21)
  assert.equal(knowledgeJob.status, "queued")
})

test("createPlatformTaskRun saves a queued run and appendPlatformRunEvent adds an event", async () => {
  const store = createInMemoryPlatformTaskRunStore()
  const run = await store.createPlatformTaskRun({
    enterpriseId: 3,
    userId: 7,
    kind: "workflow",
    itemType: "workflow",
    itemSlug: "campaign-launch",
    inputPayload: { campaign: "Q3 launch" },
  })

  await store.appendPlatformRunEvent(run.id, {
    level: "info",
    message: "workflow_queued",
  })

  const hydrated = await store.getPlatformTaskRun(run.id)
  assert.ok(hydrated)
  assert.equal(hydrated.status, "queued")
  assert.deepEqual(hydrated.inputPayload, { campaign: "Q3 launch" })
  assert.equal(hydrated.events.length, 1)
  assert.equal(hydrated.events[0]?.message, "workflow_queued")
})

test("savePlatformArtifact and promotePlatformArtifactToWorkItem preserve run lineage", async () => {
  const store = createInMemoryPlatformTaskRunStore()
  const run = await store.createPlatformTaskRun({
    enterpriseId: 5,
    userId: 9,
    kind: "media",
    itemType: "tool",
    itemSlug: "ai-music",
  })

  const artifact = await store.savePlatformArtifact({
    runId: run.id,
    enterpriseId: 5,
    ownerUserId: 9,
    kind: "json",
    title: "AI music output",
    payload: { audioUrl: "https://example.com/audio.mp3" },
  })

  const workItem = await store.promotePlatformArtifactToWorkItem({
    sourceArtifactId: artifact.id,
    enterpriseId: 5,
    ownerUserId: 9,
    type: "audio",
    title: "AI music output",
    metadata: { artifactId: artifact.id },
  })

  await store.enqueuePlatformKnowledgeSaveJob({
    artifactId: artifact.id,
    enterpriseId: 5,
    ownerUserId: 9,
    requestPayload: { source: "workspace-output-actions" },
  })

  const hydrated = await store.getPlatformTaskRun(run.id)
  assert.ok(hydrated)
  assert.equal(hydrated.artifacts.length, 1)
  assert.equal(hydrated.artifacts[0]?.id, artifact.id)
  assert.equal(hydrated.workItems.length, 1)
  assert.equal(hydrated.workItems[0]?.id, workItem.id)
  assert.equal(hydrated.workItems[0]?.sourceArtifactId, artifact.id)
  assert.equal(hydrated.knowledgeSaveJobs.length, 1)

  const [artifactList, workList] = await Promise.all([
    store.listPlatformArtifactsForEnterprise(5),
    store.listPlatformWorkItemsForEnterprise(5),
  ])

  assert.equal(artifactList[0]?.id, artifact.id)
  assert.equal(workList[0]?.id, workItem.id)
})
