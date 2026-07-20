import assert from "node:assert/strict"
import test from "node:test"

import {
  applyAiEntryConversationStateDelta,
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
