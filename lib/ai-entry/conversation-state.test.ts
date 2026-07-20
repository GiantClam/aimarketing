import assert from "node:assert/strict"
import test from "node:test"

import {
  applyAiEntryConversationStateDelta,
  appendAiEntryRuntimeArtifactContext,
  mergeAiEntryConversationState,
  normalizeAiEntryConversationState,
  resolveAiEntryConversationStateFromContents,
} from "./conversation-state"

test("conversation state resolver surfaces ppt preview and export phases from message contents", () => {
  assert.deepEqual(resolveAiEntryConversationStateFromContents([]), {
    ppt: {
      latestPreview: null,
      latestExport: null,
      phase: "idle",
    },
  })

  assert.deepEqual(
    resolveAiEntryConversationStateFromContents([
      "已生成 PPT 预览：\n<!-- ai-entry-ppt-preview-context:{\"previewSessionId\":\"preview-session-1\",\"defaultVariantKey\":\"variant-a\",\"variantKeys\":[\"variant-a\"]} -->",
    ]),
    {
      ppt: {
        latestPreview: {
          previewSessionId: "preview-session-1",
          defaultVariantKey: "variant-a",
          variantKeys: ["variant-a"],
        },
        latestExport: null,
        phase: "preview-ready",
      },
    },
  )

  assert.deepEqual(
    resolveAiEntryConversationStateFromContents([
      "已生成 PPT 预览：\n<!-- ai-entry-ppt-preview-context:{\"previewSessionId\":\"preview-session-1\",\"defaultVariantKey\":\"variant-a\",\"variantKeys\":[\"variant-a\"]} -->",
      "已生成 PPT 成品：\n<!-- ai-entry-ppt-export-context:{\"previewSessionId\":\"preview-session-1\",\"selectedVariantKey\":\"variant-a\",\"artifactId\":118} -->",
    ]),
    {
      ppt: {
        latestPreview: {
          previewSessionId: "preview-session-1",
          defaultVariantKey: "variant-a",
          variantKeys: ["variant-a"],
        },
        latestExport: {
          previewSessionId: "preview-session-1",
          selectedVariantKey: "variant-a",
          artifactId: 118,
        },
        phase: "exported",
      },
    },
  )
})

test("conversation state merge prefers stored state once persisted", () => {
  assert.deepEqual(
    mergeAiEntryConversationState({
      storedState: {
        ppt: {
          latestPreview: {
            previewSessionId: "preview-session-1",
            defaultVariantKey: "variant-a",
            variantKeys: ["variant-a"],
          },
          latestExport: {
            previewSessionId: "preview-session-1",
            selectedVariantKey: "variant-a",
            artifactId: 118,
          },
          phase: "exported",
        },
      },
      messageContents: [
        "已生成 PPT 预览：\n<!-- ai-entry-ppt-preview-context:{\"previewSessionId\":\"preview-session-1\",\"defaultVariantKey\":\"variant-a\",\"variantKeys\":[\"variant-a\"]} -->",
      ],
    }),
    {
      ppt: {
        latestPreview: {
          previewSessionId: "preview-session-1",
          defaultVariantKey: "variant-a",
          variantKeys: ["variant-a"],
        },
        latestExport: {
          previewSessionId: "preview-session-1",
          selectedVariantKey: "variant-a",
          artifactId: 118,
        },
        phase: "exported",
      },
    },
  )
})

test("conversation state delta clears stale ppt preview state after invalidation marker", () => {
  assert.deepEqual(
    applyAiEntryConversationStateDelta({
      previousState: {
        ppt: {
          latestPreview: {
            previewSessionId: "preview-session-stale",
            defaultVariantKey: "variant-a",
            variantKeys: ["variant-a"],
          },
          latestExport: null,
          phase: "preview-ready",
        },
      },
      messageContent:
        "当前 PPT 预览已失效：\n<!-- ai-entry-ppt-preview-invalidated:{\"previewSessionId\":\"preview-session-stale\"} -->",
    }),
    {
      ppt: {
        latestPreview: null,
        latestExport: null,
        phase: "preview-invalidated",
      },
    },
  )
})

test("conversation state preserves a valid ppt-master snapshot and rejects oversized or malformed state", () => {
  const snapshot = {
    schemaVersion: 1 as const,
    projectKind: "ppt-master" as const,
    state: { title: "Quarterly plan", slideCount: 6, selectedTemplateId: "boardroom" },
  }
  assert.deepEqual(normalizeAiEntryConversationState({
    ppt: { latestPreview: null, latestExport: null, phase: "idle" },
    projectSnapshot: snapshot,
  }).projectSnapshot, snapshot)
  assert.equal(normalizeAiEntryConversationState({
    ppt: { latestPreview: null, latestExport: null, phase: "idle" },
    projectSnapshot: { schemaVersion: 2, projectKind: "ppt-master", state: {} },
  }).projectSnapshot, undefined)
  assert.equal(normalizeAiEntryConversationState({
    ppt: { latestPreview: null, latestExport: null, phase: "idle" },
    projectSnapshot: { schemaVersion: 1, projectKind: "ppt-master", state: { content: "x".repeat(128 * 1024) } },
  }).projectSnapshot, undefined)
})

test("runtime artifact context keeps PPTX artifacts ahead of internal files", () => {
  const state = Array.from({ length: 9 }, (_, index) => ({
    artifactId: index + 1,
    title: `internal-${index}.json`,
    kind: "report",
    summary: "internal runtime file",
  }))
  const next = appendAiEntryRuntimeArtifactContext({
    previousState: {
      ppt: { latestPreview: null, latestExport: null, phase: "idle" },
      artifacts: state,
    },
    artifact: {
      artifactId: 10,
      title: "AI-营销工作台.pptx",
      kind: "pptx",
      summary: "AI-营销工作台.pptx (application/vnd.openxmlformats-officedocument.presentationml.presentation)",
    },
  })

  assert.equal(next.artifacts?.length, 10)
  assert.equal(next.artifacts?.at(-1)?.artifactId, 10)
  assert.equal(next.artifacts?.at(-1)?.kind, "pptx")
})

test("runtime PPTX publication marks the conversation as exported", () => {
  const next = appendAiEntryRuntimeArtifactContext({
    previousState: { ppt: { latestPreview: null, latestExport: null, phase: "idle" } },
    artifact: { artifactId: 42, title: "deck.pptx", kind: "pptx", summary: "deck.pptx" },
    exportContext: { previewSessionId: "runtime-run-42" },
  })

  assert.deepEqual(next.ppt, {
    latestPreview: null,
    latestExport: {
      previewSessionId: "runtime-run-42",
      selectedVariantKey: null,
      artifactId: 42,
    },
    phase: "exported",
  })
})

test("runtime artifact context deduplicates files by basename", () => {
  const next = appendAiEntryRuntimeArtifactContext({
    previousState: {
      ppt: { latestPreview: null, latestExport: null, phase: "idle" },
      artifacts: [
        { artifactId: 1, title: "workspace/deck/index.html", kind: "html", summary: "index.html (text/html)" },
        { artifactId: 2, title: "old/deck.pptx", kind: "pptx", summary: "deck.pptx (application/vnd.openxmlformats-officedocument.presentationml.presentation)" },
      ],
    },
    artifact: {
      artifactId: 3,
      title: "workspace/final/deck.pptx",
      kind: "pptx",
      summary: "deck.pptx (application/vnd.openxmlformats-officedocument.presentationml.presentation)",
    },
  })

  assert.deepEqual(next.artifacts?.map((item) => item.artifactId), [1, 3])
})
