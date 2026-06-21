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

test("listRecentWorkflowTaskRunsForEnterprise limits results to workflow runs", async () => {
  const store = createInMemoryPlatformTaskRunStore()

  await store.createPlatformTaskRun({
    enterpriseId: 12,
    userId: 7,
    kind: "media",
    itemType: "tool",
    itemSlug: "not-a-workflow",
  })
  const firstWorkflow = await store.createPlatformTaskRun({
    enterpriseId: 12,
    userId: 7,
    kind: "workflow",
    itemType: "workflow",
    itemSlug: "first-workflow",
  })
  const secondWorkflow = await store.createPlatformTaskRun({
    enterpriseId: 12,
    userId: 7,
    kind: "workflow",
    itemType: "workflow",
    itemSlug: "second-workflow",
  })

  const recent = await store.listRecentWorkflowTaskRunsForEnterprise(12, 1)

  assert.deepEqual(
    recent.map((run) => run.id),
    [secondWorkflow.id],
  )
  assert.equal(recent[0]?.kind, "workflow")
  assert.equal(recent[0]?.itemType, "workflow")
  assert.notEqual(recent[0]?.id, firstWorkflow.id)
})

test("listRecentPlatformArtifactsForEnterprise applies the requested limit", async () => {
  const store = createInMemoryPlatformTaskRunStore()
  const run = await store.createPlatformTaskRun({
    enterpriseId: 13,
    userId: 7,
    kind: "workflow",
    itemType: "workflow",
    itemSlug: "artifact-limit",
  })

  const firstArtifact = await store.savePlatformArtifact({
    runId: run.id,
    enterpriseId: 13,
    ownerUserId: 7,
    kind: "file",
    title: "first",
  })
  const secondArtifact = await store.savePlatformArtifact({
    runId: run.id,
    enterpriseId: 13,
    ownerUserId: 7,
    kind: "file",
    title: "second",
  })

  const recent = await store.listRecentPlatformArtifactsForEnterprise(13, 1)

  assert.deepEqual(
    recent.map((artifact) => artifact.id),
    [secondArtifact.id],
  )
  assert.notEqual(recent[0]?.id, firstArtifact.id)
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

test("listPlatformWorkLibraryItemsForEnterprise hydrates artifacts and counts references", async () => {
  const store = createInMemoryPlatformTaskRunStore()
  const run = await store.createPlatformTaskRun({
    enterpriseId: 8,
    userId: 3,
    kind: "workflow",
    itemType: "workflow",
    itemSlug: "asset-hydration",
  })

  const artifact = await store.savePlatformArtifact({
    runId: run.id,
    enterpriseId: 8,
    ownerUserId: 3,
    kind: "file",
    title: "reference-image.png",
    mimeType: "image/png",
    externalUrl: "https://example.com/reference-image.png",
    source: "workflow",
  })

  await store.promotePlatformArtifactToWorkItem({
    sourceArtifactId: artifact.id,
    enterpriseId: 8,
    ownerUserId: 3,
    type: "image_set",
    title: "First image work",
  })

  await store.promotePlatformArtifactToWorkItem({
    sourceArtifactId: artifact.id,
    enterpriseId: 8,
    ownerUserId: 3,
    type: "image_set",
    title: "Second image work",
  })

  const items = await store.listPlatformWorkLibraryItemsForEnterprise(8)
  assert.equal(items.length, 2)
  assert.equal(items[0]?.artifact.id, artifact.id)
  assert.equal(items[0]?.referenceCount, 2)
  assert.equal(items[1]?.referenceCount, 2)
})

test("deletePlatformWorkItem removes only the selected work record", async () => {
  const store = createInMemoryPlatformTaskRunStore()
  const run = await store.createPlatformTaskRun({
    enterpriseId: 9,
    userId: 3,
    kind: "workflow",
    itemType: "workflow",
    itemSlug: "remove-only",
  })

  const artifact = await store.savePlatformArtifact({
    runId: run.id,
    enterpriseId: 9,
    ownerUserId: 3,
    kind: "file",
    title: "shared.pdf",
    mimeType: "application/pdf",
  })

  const workA = await store.promotePlatformArtifactToWorkItem({
    sourceArtifactId: artifact.id,
    enterpriseId: 9,
    ownerUserId: 3,
    type: "document",
    title: "shared-a",
  })

  const workB = await store.promotePlatformArtifactToWorkItem({
    sourceArtifactId: artifact.id,
    enterpriseId: 9,
    ownerUserId: 3,
    type: "document",
    title: "shared-b",
  })

  const deleted = await store.deletePlatformWorkItem(workA.id, 9)
  const workItems = await store.listPlatformWorkItemsForEnterprise(9)
  const hydrated = await store.listPlatformWorkLibraryItemsForEnterprise(9)

  assert.equal(deleted?.id, workA.id)
  assert.deepEqual(workItems.map((item) => item.id), [workB.id])
  assert.equal(hydrated[0]?.artifact.id, artifact.id)
  assert.equal(hydrated[0]?.referenceCount, 1)
})

test("movePlatformArtifactToAssetLibrary removes work records and marks artifact as import", async () => {
  const store = createInMemoryPlatformTaskRunStore()
  const run = await store.createPlatformTaskRun({
    enterpriseId: 11,
    userId: 4,
    kind: "workflow",
    itemType: "workflow",
    itemSlug: "move-to-assets",
  })

  const artifact = await store.savePlatformArtifact({
    runId: run.id,
    enterpriseId: 11,
    ownerUserId: 4,
    kind: "file",
    title: "generated-image.png",
    mimeType: "image/png",
    payload: {
      source: "generated",
      entry: "image_assistant_generate",
    },
  })

  const workA = await store.promotePlatformArtifactToWorkItem({
    sourceArtifactId: artifact.id,
    enterpriseId: 11,
    ownerUserId: 4,
    type: "image_set",
    title: "generated image a",
  })
  const workB = await store.promotePlatformArtifactToWorkItem({
    sourceArtifactId: artifact.id,
    enterpriseId: 11,
    ownerUserId: 4,
    type: "image_set",
    title: "generated image b",
  })

  const result = await store.movePlatformArtifactToAssetLibrary(artifact.id, 11)
  const updatedArtifact = await store.getPlatformArtifact(artifact.id)

  assert.deepEqual(result?.deletedWorkItemIds, [workA.id, workB.id])
  assert.equal((updatedArtifact?.payload as { source?: string } | null)?.source, "import")
  assert.equal((updatedArtifact?.payload as { movedFromWorkLibrary?: boolean } | null)?.movedFromWorkLibrary, true)
  assert.equal((await store.listPlatformWorkItemsForEnterprise(11)).length, 0)
})

test("deletePlatformArtifactPermanently removes artifact and all related work items", async () => {
  const store = createInMemoryPlatformTaskRunStore()
  const run = await store.createPlatformTaskRun({
    enterpriseId: 10,
    userId: 6,
    kind: "workflow",
    itemType: "workflow",
    itemSlug: "permanent-delete",
  })

  const artifact = await store.savePlatformArtifact({
    runId: run.id,
    enterpriseId: 10,
    ownerUserId: 6,
    kind: "file",
    title: "final.mp4",
    mimeType: "video/mp4",
    storageKey: "platform-artifacts/final.mp4",
  })

  const work = await store.promotePlatformArtifactToWorkItem({
    sourceArtifactId: artifact.id,
    enterpriseId: 10,
    ownerUserId: 6,
    type: "video",
    title: "final video",
  })

  const result = await store.deletePlatformArtifactPermanently(artifact.id, 10)

  assert.equal(result?.artifactId, artifact.id)
  assert.deepEqual(result?.deletedWorkItemIds, [work.id])
  assert.equal(await store.getPlatformArtifact(artifact.id), null)
  assert.equal((await store.listPlatformWorkItemsForEnterprise(10)).length, 0)
})
