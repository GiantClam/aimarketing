import assert from "node:assert/strict"
import test from "node:test"

import {
  buildMissingWorkflowNodeExecutionSeeds,
  createInMemoryWorkflowStore,
  createWorkflowDefinition,
  deleteWorkflowDefinition,
  getWorkflowDefinition,
  listWorkflowDefinitionsForEnterprise,
  updateWorkflowDefinition,
} from "@/lib/workflows/store"

test("workflow store persists nodes and edges for one workflow", async () => {
  const store = createInMemoryWorkflowStore()

  const created = await createWorkflowDefinition(
    {
      enterpriseId: 1,
      ownerUserId: 1,
      title: "图生视频链",
      nodes: [
        { nodeKey: "upload-1", type: "upload", title: "素材输入", positionX: 80, positionY: 120, config: {} },
        { nodeKey: "llm-1", type: "llm_generate", title: "提示词生成", positionX: 320, positionY: 120, config: {} },
      ],
      edges: [{ sourceNodeKey: "upload-1", targetNodeKey: "llm-1", inputName: "assets" }],
    },
    store,
  )

  const loaded = await getWorkflowDefinition(created.id, 1, store)
  assert.equal(loaded?.nodes.length, 2)
  assert.equal(loaded?.edges.length, 1)
  assert.equal(loaded?.slug, "workflow")
})

test("workflow store lists enterprise-scoped definitions in newest-first order", async () => {
  const store = createInMemoryWorkflowStore()

  const first = await createWorkflowDefinition(
    {
      enterpriseId: 7,
      ownerUserId: 9,
      title: "First workflow",
    },
    store,
  )

  const second = await createWorkflowDefinition(
    {
      enterpriseId: 7,
      ownerUserId: 9,
      title: "Second workflow",
    },
    store,
  )

  await createWorkflowDefinition(
    {
      enterpriseId: 8,
      ownerUserId: 9,
      title: "Other enterprise workflow",
    },
    store,
  )

  const listed = await listWorkflowDefinitionsForEnterprise(7, store)
  assert.deepEqual(
    listed.map((workflow) => workflow.id),
    [second.id, first.id],
  )
})

test("workflow store replaces node and edge sets on update", async () => {
  const store = createInMemoryWorkflowStore()
  const created = await createWorkflowDefinition(
    {
      enterpriseId: 11,
      ownerUserId: 4,
      title: "Visual pipeline",
      nodes: [
        { nodeKey: "input-1", type: "text_input", title: "Brief", positionX: 0, positionY: 0, config: {} },
        { nodeKey: "img-1", type: "image_generate", title: "Image", positionX: 240, positionY: 0, config: {} },
      ],
      edges: [{ sourceNodeKey: "input-1", targetNodeKey: "img-1", inputName: "text" }],
    },
    store,
  )

  const updated = await updateWorkflowDefinition(
    {
      workflowId: created.id,
      enterpriseId: 11,
      title: "Visual pipeline v2",
      nodes: [
        { nodeKey: "input-1", type: "text_input", title: "Brief", positionX: 0, positionY: 0, config: {} },
        { nodeKey: "llm-1", type: "llm_generate", title: "Prompt", positionX: 220, positionY: 0, config: {} },
        { nodeKey: "img-1", type: "image_generate", title: "Image", positionX: 440, positionY: 0, config: {} },
      ],
      edges: [
        { sourceNodeKey: "input-1", targetNodeKey: "llm-1", inputName: "text" },
        { sourceNodeKey: "llm-1", targetNodeKey: "img-1", inputName: "text" },
      ],
    },
    store,
  )

  assert.equal(updated.title, "Visual pipeline v2")
  assert.equal(updated.nodes.length, 3)
  assert.equal(updated.edges.length, 2)

  const loaded = await getWorkflowDefinition(created.id, 11, store)
  assert.equal(loaded?.nodes.some((node) => node.nodeKey === "llm-1"), true)
  assert.equal(loaded?.edges[0]?.sourceNodeKey, "input-1")
})

test("workflow store rejects duplicate node keys inside one definition", async () => {
  const store = createInMemoryWorkflowStore()

  await assert.rejects(
    () =>
      createWorkflowDefinition(
        {
          enterpriseId: 3,
          ownerUserId: 8,
          title: "Broken workflow",
          nodes: [
            { nodeKey: "dup", type: "upload", title: "One", positionX: 0, positionY: 0, config: {} },
            { nodeKey: "dup", type: "text_input", title: "Two", positionX: 100, positionY: 0, config: {} },
          ],
        },
        store,
      ),
    /duplicate_workflow_node_key/,
  )
})

test("workflow store clears legacy text-input example content on load", async () => {
  const store = createInMemoryWorkflowStore()

  const created = await createWorkflowDefinition(
    {
      enterpriseId: 5,
      ownerUserId: 2,
      title: "Legacy text node",
      nodes: [
        {
          nodeKey: "input-1",
          type: "text_input",
          title: "Brief",
          positionX: 0,
          positionY: 0,
          config: { text: "这是直接在节点卡片里编辑的文本" },
        },
      ],
    },
    store,
  )

  const loaded = await getWorkflowDefinition(created.id, 5, store)
  assert.equal(loaded?.nodes[0]?.config.text, "")
})

test("workflow store clears legacy llm tuning fields on load", async () => {
  const store = createInMemoryWorkflowStore()

  const created = await createWorkflowDefinition(
    {
      enterpriseId: 6,
      ownerUserId: 3,
      title: "Legacy llm node",
      nodes: [
        {
          nodeKey: "llm-1",
          type: "llm_generate",
          title: "大模型",
          positionX: 0,
          positionY: 0,
          config: {
            selectedProviderId: "openai",
            selectedModelId: "gpt-5.4",
            outputLength: "long",
            responseLength: "long",
            language: "zh-CN",
            reasoningMode: "deep",
            systemPrompt: "keep this",
          },
        },
      ],
    },
    store,
  )

  const loaded = await getWorkflowDefinition(created.id, 6, store)
  assert.deepEqual(loaded?.nodes[0]?.config, {
    selectedProviderId: "openai",
    selectedModelId: "gpt-5.4",
    systemPrompt: "keep this",
  })
})

test("workflow store clears legacy image sizing fields on load", async () => {
  const store = createInMemoryWorkflowStore()

  const created = await createWorkflowDefinition(
    {
      enterpriseId: 12,
      ownerUserId: 5,
      title: "Legacy image node",
      nodes: [
        {
          nodeKey: "image-3",
          type: "image_generate",
          title: "图片生成",
          positionX: 0,
          positionY: 0,
          config: {
            selectedProviderId: "aiberm",
            selectedModelId: "gpt-image-2",
            sizePreset: "16:9",
            resolution: "512",
            imageSize: "1024x1024",
            imageQuality: "auto",
            previewImageUrl: "https://example.com/preview.png",
          },
        },
      ],
    },
    store,
  )

  const loaded = await getWorkflowDefinition(created.id, 12, store)
  assert.deepEqual(loaded?.nodes[0]?.config, {
    selectedProviderId: "aiberm",
    selectedModelId: "gpt-image-2",
    imageSize: "1024x1024",
    imageQuality: "auto",
    previewImageUrl: "https://example.com/preview.png",
  })
})

test("workflow store seeds missing node executions when a retried run predates new nodes", () => {
  const seeds = buildMissingWorkflowNodeExecutionSeeds({
    runId: 106,
    workflowId: 2,
    existingNodeKeys: [
      "text-input-1",
      "image-2",
      "image-3",
      "image-4",
      "product-store-1",
      "ppt-1",
      "product-store-2",
    ],
    nodes: [
      { nodeKey: "text-input-1", type: "text_input", title: "文本输入", positionX: 0, positionY: 0, config: {} },
      { nodeKey: "image-2", type: "image_generate", title: "图片生成", positionX: 0, positionY: 0, config: {} },
      { nodeKey: "video-1", type: "video_generate", title: "视频生成", positionX: 0, positionY: 0, config: {} },
      { nodeKey: "text-input-5", type: "text_input", title: "文本输入", positionX: 0, positionY: 0, config: {} },
      { nodeKey: "product-store-3", type: "product_store", title: "作品库存储", positionX: 0, positionY: 0, config: {} },
    ],
  })

  assert.deepEqual(seeds, [
    {
      runId: 106,
      workflowId: 2,
      nodeKey: "video-1",
      nodeType: "video_generate",
      status: "queued",
    },
    {
      runId: 106,
      workflowId: 2,
      nodeKey: "text-input-5",
      nodeType: "text_input",
      status: "queued",
    },
    {
      runId: 106,
      workflowId: 2,
      nodeKey: "product-store-3",
      nodeType: "product_store",
      status: "queued",
    },
  ])
})

test("workflow store triggers workflow archive hook only when status first transitions to archived", async () => {
  const archivedCalls: Array<{ workflowId: number; enterpriseId: number }> = []
  const store = createInMemoryWorkflowStore({
    onWorkflowArchived(input) {
      archivedCalls.push(input)
    },
  })

  const created = await createWorkflowDefinition(
    {
      enterpriseId: 14,
      ownerUserId: 3,
      title: "Archive me",
    },
    store,
  )

  await updateWorkflowDefinition(
    {
      workflowId: created.id,
      enterpriseId: 14,
      status: "live",
    },
    store,
  )
  assert.deepEqual(archivedCalls, [])

  await updateWorkflowDefinition(
    {
      workflowId: created.id,
      enterpriseId: 14,
      status: "archived",
    },
    store,
  )
  assert.deepEqual(archivedCalls, [{ workflowId: created.id, enterpriseId: 14 }])

  await updateWorkflowDefinition(
    {
      workflowId: created.id,
      enterpriseId: 14,
      title: "Archive me v2",
    },
    store,
  )
  assert.deepEqual(archivedCalls, [{ workflowId: created.id, enterpriseId: 14 }])
})

test("workflow store deletes a workflow definition by enterprise scope", async () => {
  const store = createInMemoryWorkflowStore()

  const created = await createWorkflowDefinition(
    {
      enterpriseId: 15,
      ownerUserId: 3,
      title: "Delete me",
    },
    store,
  )

  await deleteWorkflowDefinition(created.id, 15, store)

  const loaded = await getWorkflowDefinition(created.id, 15, store)
  assert.equal(loaded, null)
  const listed = await listWorkflowDefinitionsForEnterprise(15, store)
  assert.deepEqual(listed, [])
})
