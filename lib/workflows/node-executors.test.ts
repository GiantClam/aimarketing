import assert from "node:assert/strict"
import test from "node:test"

import {
  createWorkflowNodeInputBundle,
  mergeWorkflowNodeOutputBundles,
  resolveWorkflowNodeExecutor,
  resolveKnowledgeRetrieveEnterpriseDatasetSelection,
} from "@/lib/workflows/node-executors"

test("image_generate resolves to the existing image capability executor", () => {
  const executor = resolveWorkflowNodeExecutor("image_generate")
  assert.equal(executor.capabilitySlug, "ai-image")
  assert.equal(executor.action, "generate")
})

test("writer resolves to the existing writer capability executor", () => {
  const executor = resolveWorkflowNodeExecutor("writer")
  assert.equal(executor.capabilitySlug, "content-repurpose")
  assert.equal(executor.action, "chat")
})

test("agent_execute resolves to the custom agent capability executor", () => {
  const executor = resolveWorkflowNodeExecutor("agent_execute")
  assert.equal(executor.capabilitySlug, "agent-platform")
  assert.equal(executor.action, "chat")
  assert.deepEqual(executor.outputKinds, ["text"])
})

test("music_generate resolves to the music capability executor", () => {
  const executor = resolveWorkflowNodeExecutor("music_generate")
  assert.equal(executor.capabilitySlug, "ai-music")
  assert.equal(executor.action, "generate")
})

test("knowledge nodes resolve to explicit knowledge executors", () => {
  const retrieveExecutor = resolveWorkflowNodeExecutor("knowledge_retrieve")
  const writeExecutor = resolveWorkflowNodeExecutor("knowledge_write")

  assert.equal(retrieveExecutor.action, "knowledge-retrieve")
  assert.deepEqual(retrieveExecutor.outputKinds, ["text"])
  assert.equal(writeExecutor.action, "knowledge-write")
  assert.deepEqual(writeExecutor.outputKinds, ["text", "asset", "image", "video", "audio", "ppt"])
})

test("knowledge_write produces a draft that requires manual confirmation", async () => {
  const executor = resolveWorkflowNodeExecutor("knowledge_write")
  const result = await executor.execute({
    enterpriseId: 1,
    ownerUserId: 7,
    node: {
      nodeKey: "write-1",
      type: "knowledge_write",
      title: "Knowledge write",
      positionX: 0,
      positionY: 0,
      config: {
        datasetId: 42,
        datasetScope: "enterprise",
        knowledgeCategory: "campaign",
        documentTitle: "Launch recap",
      },
    },
    input: {
      ...createWorkflowNodeInputBundle(),
      text: ["Approved launch summary"],
    },
  })

  assert.deepEqual(result.output.text, ["Approved launch summary"])
  assert.equal(result.metadata?.persistenceTarget, "knowledge_write")
  assert.equal(result.metadata?.manualConfirmationRequired, true)
  assert.equal(result.metadata?.knowledgeDocumentTitle, "Launch recap")
  assert.equal(result.metadata?.datasetId, 42)
  assert.equal(result.metadata?.datasetScope, "enterprise")
  assert.equal(result.metadata?.knowledgeCategory, "campaign")
  assert.equal(typeof result.metadata?.knowledgeDraftContent, "string")
  assert.match(String(result.metadata?.knowledgeDraftContent), /Approved launch summary/)
})

test("knowledge retrieval dataset selection falls back to preset-allowed enterprise datasets", () => {
  const selection = resolveKnowledgeRetrieveEnterpriseDatasetSelection({
    selectedDatasetIds: [],
    workflowMetadata: {
      enterprisePresets: [
        {
          id: "preset-1",
          name: "Default preset",
          allowedKnowledgeDatasetIds: [12, 18],
          isDefault: true,
        },
      ],
    },
  })

  assert.deepEqual(selection, {
    datasetIds: [12, 18],
    restrictedByPreset: true,
  })
})

test("knowledge retrieval dataset selection intersects explicit selection with preset allowlist", () => {
  const selection = resolveKnowledgeRetrieveEnterpriseDatasetSelection({
    selectedDatasetIds: [12, 22, 34],
    workflowMetadata: {
      enterprisePresets: [
        {
          id: "preset-1",
          name: "Default preset",
          allowedKnowledgeDatasetIds: [12, 34],
          isDefault: true,
        },
      ],
    },
  })

  assert.deepEqual(selection, {
    datasetIds: [12, 34],
    restrictedByPreset: true,
  })
})

test("digital_human resolves to the video capability executor", () => {
  const executor = resolveWorkflowNodeExecutor("digital_human")
  assert.equal(executor.capabilitySlug, "ai-video")
  assert.equal(executor.action, "generate")
  assert.deepEqual(executor.outputKinds, ["video"])
})

test("voice_synthesis resolves to the speech synthesis capability executor", () => {
  const executor = resolveWorkflowNodeExecutor("voice_synthesis")
  assert.equal(executor.capabilitySlug, "ai-music")
  assert.equal(executor.action, "voice-synthesis")
})

test("audio_generate stays available as the legacy audio capability executor", () => {
  const executor = resolveWorkflowNodeExecutor("audio_generate")
  assert.equal(executor.capabilitySlug, "ai-music")
  assert.equal(executor.action, "generate")
})

test("product_store echoes upstream output for preview and marks asset library persistence", async () => {
  const executor = resolveWorkflowNodeExecutor("product_store")
  assert.equal(executor.action, "store-output")

  const result = await executor.execute({
    enterpriseId: 1,
    ownerUserId: 1,
    node: {
      nodeKey: "product-store-1",
      type: "product_store",
      title: "Asset Library",
      positionX: 0,
      positionY: 0,
      config: {
        persistToWorkLibrary: true,
        persistToKnowledgeBase: true,
      },
    },
    input: {
      text: [],
      asset: [{
        source: "upload",
        fileName: "Stored text.md",
        mimeType: "text/markdown",
        embeddedContentBase64: "IyBTdG9yZWQgdGV4dA==",
        inlinePreviewText: "# Stored text",
      }],
      image: [{ url: "https://example.com/result.png", title: "Result image" }],
      video: [],
      audio: [],
      ppt: [],
    },
  })

  assert.deepEqual(result.output, {
    asset: [{
      source: "upload",
      fileName: "Stored text.md",
      mimeType: "text/markdown",
      embeddedContentBase64: "IyBTdG9yZWQgdGV4dA==",
      inlinePreviewText: "# Stored text",
    }],
    image: [{ url: "https://example.com/result.png", title: "Result image" }],
    video: [],
    audio: [],
    ppt: [],
  })
  assert.equal(result.metadata?.persistenceTarget, "asset_library")
  assert.equal(result.metadata?.persistToWorkLibrary, true)
  assert.equal(result.metadata?.persistToKnowledgeBase, true)
})

test("file_create materializes text into a markdown asset", async () => {
  const executor = resolveWorkflowNodeExecutor("file_create")
  const result = await executor.execute({
    enterpriseId: 1,
    ownerUserId: 1,
    node: {
      nodeKey: "file-1",
      type: "file_create",
      title: "Brief File",
      positionX: 0,
      positionY: 0,
      config: {
        fileFormat: "md",
        fileName: "launch-brief",
      },
    },
    input: {
      text: ["# Launch brief\n\nHello world"],
      asset: [],
      image: [],
      video: [],
      audio: [],
      ppt: [],
    },
  })

  assert.equal(result.output.asset?.length, 1)
  assert.equal(result.output.asset?.[0]?.fileName, "launch-brief.md")
  assert.equal(result.output.asset?.[0]?.mimeType, "text/markdown")
  assert.equal(result.metadata?.fileFormat, "md")
})

test("upload executor returns canonical asset output", async () => {
  const executor = resolveWorkflowNodeExecutor("upload")
  const result = await executor.execute({
    enterpriseId: 1,
    ownerUserId: 1,
    node: {
      nodeKey: "upload-1",
      type: "upload",
      title: "Upload",
      positionX: 0,
      positionY: 0,
      config: {
        uploadedFiles: [{ fileName: "brand.png", mimeType: "image/png", storageKey: "tmp/brand.png" }],
      },
    },
    input: createWorkflowNodeInputBundle(),
  })

  assert.equal(result.output.asset?.length, 1)
  assert.equal(result.output.asset?.[0]?.storageKey, "tmp/brand.png")
})

test("text_input emits configured text and merged bundles append by kind", async () => {
  const executor = resolveWorkflowNodeExecutor("text_input")
  const result = await executor.execute({
    enterpriseId: 1,
    ownerUserId: 1,
    node: {
      nodeKey: "text-1",
      type: "text_input",
      title: "Text input",
      positionX: 0,
      positionY: 0,
      config: {
        text: "Generate a launch visual",
      },
    },
    input: createWorkflowNodeInputBundle(),
  })

  assert.deepEqual(result.output.text, ["Generate a launch visual"])

  const merged = mergeWorkflowNodeOutputBundles(createWorkflowNodeInputBundle(), result.output)
  assert.deepEqual(merged.text, ["Generate a launch visual"])
})

test("merged bundles preserve audio outputs", () => {
  const merged = mergeWorkflowNodeOutputBundles(createWorkflowNodeInputBundle(), {
    audio: [{ url: "https://example.com/theme.mp3", title: "Theme" }],
  })

  assert.equal(merged.audio.length, 1)
  assert.equal(merged.audio[0]?.url, "https://example.com/theme.mp3")
})
