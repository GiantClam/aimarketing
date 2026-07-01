import assert from "node:assert/strict"
import test from "node:test"

import {
  buildExecutableWorkflowPlan,
  collectWorkflowRetryNodeKeys,
  retryWorkflowNodeExecution,
  runWorkflowDefinition,
  validateWorkflowGraph,
} from "@/lib/workflows/execution"
import type { WorkflowDefinitionNode, WorkflowDefinitionEdge } from "@/lib/workflows/schema"

test("execution plan exposes two parallel image nodes after one llm node", () => {
  const plan = buildExecutableWorkflowPlan({
    nodes: [
      { nodeKey: "llm-1", type: "llm_generate", title: "LLM", positionX: 0, positionY: 0, config: {} },
      { nodeKey: "img-1", type: "image_generate", title: "Image A", positionX: 0, positionY: 0, config: {} },
      { nodeKey: "img-2", type: "image_generate", title: "Image B", positionX: 0, positionY: 0, config: {} },
    ],
    edges: [
      { sourceNodeKey: "llm-1", targetNodeKey: "img-1" },
      { sourceNodeKey: "llm-1", targetNodeKey: "img-2" },
    ],
  })

  assert.deepEqual(plan.parallelLevels[1], ["img-1", "img-2"])
})

test("graph validation rejects cycles and invalid input kinds", () => {
  assert.throws(
    () =>
      validateWorkflowGraph({
        nodes: [
          { nodeKey: "a", type: "text_input", title: "A", positionX: 0, positionY: 0, config: {} },
          { nodeKey: "b", type: "llm_generate", title: "B", positionX: 0, positionY: 0, config: {} },
        ],
        edges: [
          { sourceNodeKey: "a", targetNodeKey: "b" },
          { sourceNodeKey: "b", targetNodeKey: "a" },
        ],
      }),
    /workflow_graph_invalid_input_type|workflow_graph_cycle_detected/,
  )
})

test("graph validation accepts upload asset connections into typed file inputs", () => {
  assert.doesNotThrow(() =>
    validateWorkflowGraph({
      nodes: [
        { nodeKey: "upload-1", type: "upload", title: "Upload", positionX: 0, positionY: 0, config: {} },
        { nodeKey: "image-1", type: "image_generate", title: "Image", positionX: 0, positionY: 0, config: {} },
      ],
      edges: [{ sourceNodeKey: "upload-1", targetNodeKey: "image-1", inputName: "images" }],
    }),
  )
})

test("runWorkflowDefinition executes serial and parallel branches deterministically", async () => {
  const nodes: WorkflowDefinitionNode[] = [
    { nodeKey: "input-1", type: "text_input", title: "Input", positionX: 0, positionY: 0, config: { text: "Launch brief" } },
    { nodeKey: "llm-1", type: "llm_generate", title: "LLM", positionX: 0, positionY: 0, config: {} },
    { nodeKey: "img-1", type: "image_generate", title: "Image 1", positionX: 0, positionY: 0, config: {} },
    { nodeKey: "img-2", type: "image_generate", title: "Image 2", positionX: 0, positionY: 0, config: {} },
  ]
  const edges: WorkflowDefinitionEdge[] = [
    { sourceNodeKey: "input-1", targetNodeKey: "llm-1" },
    { sourceNodeKey: "llm-1", targetNodeKey: "img-1" },
    { sourceNodeKey: "llm-1", targetNodeKey: "img-2" },
  ]

  const callOrder: string[] = []
  const result = await runWorkflowDefinition({
    enterpriseId: 1,
    ownerUserId: 1,
    nodes,
    edges,
    executorContext: {
      capabilityInvoker: async ({ nodeType, node, input }) => {
        callOrder.push(node.nodeKey)

        if (nodeType === "llm_generate") {
          return {
            output: {
              text: [`Prompt for ${input.text.join(" ")}`],
            },
          }
        }

        return {
          output: {
            image: [{ url: `https://example.com/${node.nodeKey}.png`, title: node.title }],
          },
        }
      },
    },
  })

  assert.equal(result.status, "succeeded")
  assert.deepEqual(callOrder.slice(0, 2), ["llm-1", "img-1"])
  assert.equal(result.nodeStates["img-1"]?.status, "succeeded")
  assert.equal(result.nodeStates["img-2"]?.status, "succeeded")
  assert.equal(result.nodeStates["llm-1"]?.output.text?.[0]?.includes("Launch brief"), true)
})

test("runWorkflowDefinition injects seed text into root text_input nodes without configured text", async () => {
  const result = await runWorkflowDefinition({
    enterpriseId: 1,
    ownerUserId: 1,
    nodes: [
      { nodeKey: "input-1", type: "text_input", title: "Input", positionX: 0, positionY: 0, config: {} },
      { nodeKey: "llm-1", type: "llm_generate", title: "LLM", positionX: 0, positionY: 0, config: {} },
    ],
    edges: [{ sourceNodeKey: "input-1", targetNodeKey: "llm-1", inputName: "text" }],
    seedInput: {
      text: ["Workflow-backed launch brief"],
    },
    executorContext: {
      capabilityInvoker: async ({ input }) => ({
        output: {
          text: [`Seen: ${input.text.join(" ")}`],
        },
      }),
    },
  })

  assert.equal(result.status, "succeeded")
  assert.deepEqual(result.nodeStates["input-1"]?.output.text, ["Workflow-backed launch brief"])
  assert.match(result.nodeStates["llm-1"]?.output.text?.[0] || "", /Workflow-backed launch brief/)
})

test("retryWorkflowNodeExecution reruns only the selected failed branch", async () => {
  const nodes: WorkflowDefinitionNode[] = [
    { nodeKey: "input-1", type: "text_input", title: "Input", positionX: 0, positionY: 0, config: { text: "Prompt" } },
    { nodeKey: "llm-1", type: "llm_generate", title: "LLM", positionX: 0, positionY: 0, config: {} },
    { nodeKey: "img-1", type: "image_generate", title: "Image 1", positionX: 0, positionY: 0, config: {} },
    { nodeKey: "img-2", type: "image_generate", title: "Image 2", positionX: 0, positionY: 0, config: {} },
  ]
  const edges: WorkflowDefinitionEdge[] = [
    { sourceNodeKey: "input-1", targetNodeKey: "llm-1" },
    { sourceNodeKey: "llm-1", targetNodeKey: "img-1" },
    { sourceNodeKey: "llm-1", targetNodeKey: "img-2" },
  ]

  let shouldFailImg2 = true
  const firstRun = await runWorkflowDefinition({
    enterpriseId: 1,
    ownerUserId: 1,
    nodes,
    edges,
    executorContext: {
      capabilityInvoker: async ({ node, nodeType }) => {
        if (nodeType === "llm_generate") {
          return { output: { text: ["Generated prompt"] } }
        }
        if (node.nodeKey === "img-2" && shouldFailImg2) {
          throw new Error("provider_timeout")
        }
        return { output: { image: [{ url: `https://example.com/${node.nodeKey}.png` }] } }
      },
    },
  })

  assert.equal(firstRun.status, "failed")
  assert.equal(firstRun.nodeStates["img-1"]?.status, "succeeded")
  assert.equal(firstRun.nodeStates["img-2"]?.status, "failed")

  shouldFailImg2 = false
  const retried = await retryWorkflowNodeExecution({
    enterpriseId: 1,
    ownerUserId: 1,
    nodes,
    edges,
    nodeStates: firstRun.nodeStates,
    nodeKey: "img-2",
    mode: "branch",
    executorContext: {
      capabilityInvoker: async ({ node, nodeType }) => {
        if (nodeType === "llm_generate") {
          return { output: { text: ["Generated prompt"] } }
        }
        return { output: { image: [{ url: `https://example.com/${node.nodeKey}.png` }] } }
      },
    },
  })

  assert.equal(retried.status, "succeeded")
  assert.equal(retried.nodeStates["img-1"]?.attemptCount, 1)
  assert.equal(retried.nodeStates["img-2"]?.attemptCount, 2)
  assert.equal(retried.nodeStates["img-2"]?.status, "succeeded")
})

test("retryWorkflowNodeExecution emits running updates for retried nodes", async () => {
  const nodes: WorkflowDefinitionNode[] = [
    { nodeKey: "input-1", type: "text_input", title: "Input", positionX: 0, positionY: 0, config: { text: "Prompt" } },
    { nodeKey: "img-1", type: "image_generate", title: "Image", positionX: 0, positionY: 0, config: {} },
  ]
  const edges: WorkflowDefinitionEdge[] = [
    { sourceNodeKey: "input-1", targetNodeKey: "img-1" },
  ]
  const now = new Date()
  const updates: string[] = []

  const retried = await retryWorkflowNodeExecution({
    enterpriseId: 1,
    ownerUserId: 1,
    nodes,
    edges,
    nodeKey: "img-1",
    mode: "branch",
    nodeStates: {
      "input-1": {
        nodeKey: "input-1",
        status: "succeeded",
        attemptCount: 1,
        output: { text: ["Prompt"] },
        startedAt: now,
        finishedAt: now,
        creditsConsumed: 0,
      },
      "img-1": {
        nodeKey: "img-1",
        status: "failed",
        attemptCount: 1,
        output: {},
        startedAt: now,
        finishedAt: now,
        creditsConsumed: 0,
      },
    },
    executorContext: {
      capabilityInvoker: async () => ({ output: { image: [{ url: "https://example.com/image.png" }] } }),
    },
    onNodeStateChange: (state) => {
      updates.push(`${state.nodeKey}:${state.status}`)
    },
  })

  assert.equal(retried.status, "succeeded")
  assert.deepEqual(updates, ["img-1:running", "img-1:succeeded"])
})

test("retryWorkflowNodeExecution cancels queued descendants when a non-retried parent is already cancelled", async () => {
  const nodes: WorkflowDefinitionNode[] = [
    { nodeKey: "text-1", type: "text_input", title: "Input", positionX: 0, positionY: 0, config: { text: "Prompt" } },
    { nodeKey: "fail-1", type: "image_generate", title: "Fail branch", positionX: 0, positionY: 0, config: {} },
    { nodeKey: "cancelled-mid", type: "image_generate", title: "Cancelled mid", positionX: 0, positionY: 0, config: {} },
    { nodeKey: "retry-1", type: "image_generate", title: "Retry branch", positionX: 0, positionY: 0, config: {} },
    { nodeKey: "join-1", type: "image_generate", title: "Join", positionX: 0, positionY: 0, config: {} },
  ]
  const edges: WorkflowDefinitionEdge[] = [
    { sourceNodeKey: "text-1", targetNodeKey: "fail-1", inputName: "text" },
    { sourceNodeKey: "text-1", targetNodeKey: "retry-1", inputName: "text" },
    { sourceNodeKey: "fail-1", targetNodeKey: "cancelled-mid", inputName: "images" },
    { sourceNodeKey: "cancelled-mid", targetNodeKey: "join-1", inputName: "images" },
    { sourceNodeKey: "retry-1", targetNodeKey: "join-1", inputName: "images" },
  ]

  let shouldFailRetryBranch = true
  const firstRun = await runWorkflowDefinition({
    enterpriseId: 1,
    ownerUserId: 1,
    nodes,
    edges,
    executorContext: {
      capabilityInvoker: async ({ node, nodeType }) => {
        if (nodeType !== "image_generate") {
          return { output: {} }
        }
        if (node.nodeKey === "fail-1") {
          throw new Error("upstream_provider_timeout")
        }
        if (node.nodeKey === "retry-1" && shouldFailRetryBranch) {
          throw new Error("branch_provider_timeout")
        }
        return { output: { image: [{ url: `https://example.com/${node.nodeKey}.png` }] } }
      },
    },
  })

  assert.equal(firstRun.status, "failed")
  assert.equal(firstRun.nodeStates["cancelled-mid"]?.status, "cancelled")
  assert.equal(firstRun.nodeStates["join-1"]?.status, "cancelled")

  shouldFailRetryBranch = false
  const retried = await retryWorkflowNodeExecution({
    enterpriseId: 1,
    ownerUserId: 1,
    nodes,
    edges,
    nodeStates: firstRun.nodeStates,
    nodeKey: "retry-1",
    mode: "branch",
    executorContext: {
      capabilityInvoker: async ({ node, nodeType }) => {
        if (nodeType !== "image_generate") {
          return { output: {} }
        }
        return { output: { image: [{ url: `https://example.com/${node.nodeKey}.png` }] } }
      },
    },
  })

  assert.equal(retried.status, "failed")
  assert.equal(retried.nodeStates["retry-1"]?.status, "succeeded")
  assert.equal(retried.nodeStates["cancelled-mid"]?.status, "cancelled")
  assert.equal(retried.nodeStates["join-1"]?.status, "cancelled")
  assert.equal(retried.nodeStates["join-1"]?.errorMessage, "workflow_upstream_failed")
})

test("collectWorkflowRetryNodeKeys includes unsucceeded blocking parents for branch retries", () => {
  const nodes: WorkflowDefinitionNode[] = [
    { nodeKey: "text-1", type: "text_input", title: "Input", positionX: 0, positionY: 0, config: { text: "Prompt" } },
    { nodeKey: "image-2", type: "image_generate", title: "Image 2", positionX: 0, positionY: 0, config: {} },
    { nodeKey: "image-3", type: "image_generate", title: "Image 3", positionX: 0, positionY: 0, config: {} },
    { nodeKey: "image-4", type: "image_generate", title: "Image 4", positionX: 0, positionY: 0, config: {} },
  ]
  const edges: WorkflowDefinitionEdge[] = [
    { sourceNodeKey: "text-1", targetNodeKey: "image-2", inputName: "text" },
    { sourceNodeKey: "text-1", targetNodeKey: "image-3", inputName: "text" },
    { sourceNodeKey: "image-2", targetNodeKey: "image-4", inputName: "images" },
    { sourceNodeKey: "image-3", targetNodeKey: "image-4", inputName: "images" },
  ]

  const rerunNodeKeys = collectWorkflowRetryNodeKeys({
    mode: "branch",
    nodeKey: "image-3",
    nodes,
    edges,
    nodeStates: {
      "text-1": { status: "succeeded" },
      "image-2": { status: "running" },
      "image-3": { status: "failed" },
      "image-4": { status: "queued" },
    },
  })

  assert.deepEqual(new Set(rerunNodeKeys), new Set(["image-2", "image-3", "image-4"]))
})

test("runWorkflowDefinition emits node state updates for running and completed phases", async () => {
  const updates: string[] = []
  const nodes: WorkflowDefinitionNode[] = [
    { nodeKey: "text-1", type: "text_input", title: "Input", positionX: 0, positionY: 0, config: { text: "hero prompt" } },
    { nodeKey: "img-1", type: "image_generate", title: "Image", positionX: 0, positionY: 0, config: {} },
  ]
  const edges: WorkflowDefinitionEdge[] = [
    { sourceNodeKey: "text-1", targetNodeKey: "img-1" },
  ]

  const result = await runWorkflowDefinition({
    enterpriseId: 1,
    ownerUserId: 1,
    nodes,
    edges,
    executorContext: {
      capabilityInvoker: async ({ nodeType }) =>
        nodeType === "image_generate"
          ? { output: { image: [{ url: "https://example.com/hero.png" }] } }
          : { output: {} },
    },
    onNodeStateChange: (state) => {
      updates.push(`${state.nodeKey}:${state.status}`)
    },
  })

  assert.equal(result.status, "succeeded")
  assert.deepEqual(updates, [
    "text-1:running",
    "text-1:succeeded",
    "img-1:running",
    "img-1:succeeded",
  ])
})

test("runWorkflowDefinition scopes upstream inputs by edge inputName", async () => {
  const nodes: WorkflowDefinitionNode[] = [
    { nodeKey: "text-1", type: "text_input", title: "Prompt", positionX: 0, positionY: 0, config: { text: "Use this prompt only" } },
    { nodeKey: "image-2", type: "image_generate", title: "Source image", positionX: 0, positionY: 0, config: {} },
    { nodeKey: "image-4", type: "image_generate", title: "Target image", positionX: 0, positionY: 0, config: {} },
  ]
  const edges: WorkflowDefinitionEdge[] = [
    { sourceNodeKey: "text-1", targetNodeKey: "image-2", inputName: "text" },
    { sourceNodeKey: "text-1", targetNodeKey: "image-4", inputName: "text" },
    { sourceNodeKey: "image-2", targetNodeKey: "image-4", inputName: "images" },
  ]

  const seenInputs = new Map<string, { text: string[]; imageCount: number }>()

  const result = await runWorkflowDefinition({
    enterpriseId: 1,
    ownerUserId: 1,
    nodes,
    edges,
    executorContext: {
      capabilityInvoker: async ({ node, nodeType, input }) => {
        if (nodeType !== "image_generate") {
          return { output: {} }
        }

        seenInputs.set(node.nodeKey, {
          text: [...input.text],
          imageCount: input.image.length,
        })

        return {
          output: {
            image: [{ url: `https://example.com/${node.nodeKey}.png`, title: node.title }],
          },
        }
      },
    },
  })

  assert.equal(result.status, "succeeded")
  assert.deepEqual(seenInputs.get("image-2"), {
    text: ["Use this prompt only"],
    imageCount: 0,
  })
  assert.deepEqual(seenInputs.get("image-4"), {
    text: ["Use this prompt only"],
    imageCount: 1,
  })
})

test("runWorkflowDefinition preserves source node keys on typed image inputs", async () => {
  const nodes: WorkflowDefinitionNode[] = [
    { nodeKey: "text-1", type: "text_input", title: "Prompt", positionX: 0, positionY: 0, config: { text: "Use this prompt only" } },
    { nodeKey: "image-2", type: "image_generate", title: "Source image 2", positionX: 0, positionY: 0, config: {} },
    { nodeKey: "image-3", type: "image_generate", title: "Source image 3", positionX: 0, positionY: 0, config: {} },
    { nodeKey: "image-4", type: "image_generate", title: "Target image", positionX: 0, positionY: 0, config: {} },
  ]
  const edges: WorkflowDefinitionEdge[] = [
    { sourceNodeKey: "text-1", targetNodeKey: "image-2", inputName: "text" },
    { sourceNodeKey: "text-1", targetNodeKey: "image-3", inputName: "text" },
    { sourceNodeKey: "image-2", targetNodeKey: "image-4", inputName: "images" },
    { sourceNodeKey: "image-3", targetNodeKey: "image-4", inputName: "images" },
  ]

  let capturedSourceNodeKeys: Array<string | null | undefined> = []

  const result = await runWorkflowDefinition({
    enterpriseId: 1,
    ownerUserId: 1,
    nodes,
    edges,
    executorContext: {
      capabilityInvoker: async ({ node, nodeType, input }) => {
        if (nodeType !== "image_generate") {
          return { output: {} }
        }

        if (node.nodeKey === "image-4") {
          capturedSourceNodeKeys = input.image.map((item) => item.sourceNodeKey)
        }

        return {
          output: {
            image: [{ url: `https://example.com/${node.nodeKey}.png`, title: node.title }],
          },
        }
      },
    },
  })

  assert.equal(result.status, "succeeded")
  assert.deepEqual(capturedSourceNodeKeys, ["image-2", "image-3"])
})

test("runWorkflowDefinition maps upload assets into typed image inputs by mime type", async () => {
  const nodes: WorkflowDefinitionNode[] = [
    {
      nodeKey: "upload-1",
      type: "upload",
      title: "Upload",
      positionX: 0,
      positionY: 0,
      config: {
        uploadedFiles: [{ fileName: "hero.png", mimeType: "image/png", storageKey: "tmp/hero.png", url: "https://example.com/hero.png" }],
      },
    },
    { nodeKey: "image-1", type: "image_generate", title: "Image", positionX: 0, positionY: 0, config: {} },
  ]
  const edges: WorkflowDefinitionEdge[] = [
    { sourceNodeKey: "upload-1", targetNodeKey: "image-1", inputName: "images" },
  ]

  let seenImageUrls: string[] = []
  const result = await runWorkflowDefinition({
    enterpriseId: 1,
    ownerUserId: 1,
    nodes,
    edges,
    executorContext: {
      capabilityInvoker: async ({ input, nodeType }) => {
        if (nodeType === "image_generate") {
          seenImageUrls = input.image.map((item) => item.url || "")
          return { output: { image: [{ url: "https://example.com/output.png" }] } }
        }
        return { output: {} }
      },
    },
  })

  assert.equal(result.status, "succeeded")
  assert.deepEqual(seenImageUrls, ["https://example.com/hero.png"])
})

test("runWorkflowDefinition fails when upload asset mime type does not match target input kind", async () => {
  const nodes: WorkflowDefinitionNode[] = [
    {
      nodeKey: "upload-1",
      type: "upload",
      title: "Upload",
      positionX: 0,
      positionY: 0,
      config: {
        uploadedFiles: [{ fileName: "theme.mp3", mimeType: "audio/mpeg", storageKey: "tmp/theme.mp3", url: "https://example.com/theme.mp3" }],
      },
    },
    { nodeKey: "image-1", type: "image_generate", title: "Image", positionX: 0, positionY: 0, config: {} },
  ]
  const edges: WorkflowDefinitionEdge[] = [
    { sourceNodeKey: "upload-1", targetNodeKey: "image-1", inputName: "images" },
  ]

  const result = await runWorkflowDefinition({
    enterpriseId: 1,
    ownerUserId: 1,
    nodes,
    edges,
    executorContext: {
      capabilityInvoker: async ({ nodeType }) =>
        nodeType === "image_generate"
          ? { output: { image: [{ url: "https://example.com/output.png" }] } }
          : { output: {} },
    },
  })

  assert.equal(result.status, "failed")
  assert.equal(result.nodeStates["image-1"]?.status, "failed")
  assert.equal(result.nodeStates["image-1"]?.errorMessage, "workflow_edge_asset_type_mismatch:image-1:image")
})

test("product_store echoes upstream outputs for preview rendering", async () => {
  const nodes: WorkflowDefinitionNode[] = [
    { nodeKey: "text-1", type: "text_input", title: "Prompt", positionX: 0, positionY: 0, config: { text: "Stored text" } },
    { nodeKey: "file-1", type: "file_create", title: "File", positionX: 0, positionY: 0, config: { fileFormat: "md" } },
    { nodeKey: "store-1", type: "product_store", title: "Store", positionX: 0, positionY: 0, config: {} },
  ]
  const edges: WorkflowDefinitionEdge[] = [
    { sourceNodeKey: "text-1", targetNodeKey: "file-1", inputName: "text" },
    { sourceNodeKey: "file-1", targetNodeKey: "store-1", inputName: "assets" },
  ]

  const result = await runWorkflowDefinition({
    enterpriseId: 1,
    ownerUserId: 1,
    nodes,
    edges,
  })

  assert.equal(result.status, "succeeded")
  assert.equal(result.nodeStates["store-1"]?.output.asset?.[0]?.fileName, "File.md")
  assert.equal(result.nodeStates["store-1"]?.metadata?.persistenceTarget, "asset_library")
})
