import assert from "node:assert/strict"
import test from "node:test"

import type { WriterAsset } from "@/lib/writer/assets"
import {
  buildWriterManualSavePayload,
  listWriterRevisionHistory,
  mergeWriterAssetProgress,
  resolveWriterDraftForDisplay,
  resolveWriterTaskFailureState,
} from "./writer-workspace-state"

const asset = (id: string, status: WriterAsset["status"], url = ""): WriterAsset => ({
  id,
  label: id === "cover" ? "Cover" : id,
  title: id === "cover" ? "Cover image" : id,
  prompt: `${id} prompt`,
  url,
  status,
  provider: status === "ready" ? "aiberm" : status === "failed" ? "error" : "loading",
})

test("pending Writer revision keeps the last validated article visible", () => {
  const messages = [
    { id: "assistant-1", role: "assistant" as const, content: "# Validated article", revision: 1 },
    { id: "user-2", role: "user" as const, content: "Please revise it" },
    { id: "assistant-2", role: "assistant" as const, content: "Generating…" },
  ]

  assert.equal(resolveWriterDraftForDisplay(messages, 1, "Generating…"), "# Validated article")
})

test("a first pending Writer turn does not become an empty draft", () => {
  const messages = [{ id: "assistant-1", role: "assistant" as const, content: "Generating…" }]
  assert.equal(resolveWriterDraftForDisplay(messages, 0, "Generating…"), "")
})

test("revision history excludes optimistic pending messages and preserves active selection", () => {
  const messages = [
    { id: "assistant-1", role: "assistant" as const, content: "Revision one", revision: 1 },
    { id: "assistant-2", role: "assistant" as const, content: "Revision two", revision: 2, is_active_draft: true },
    { id: "assistant-pending", role: "assistant" as const, content: "Generating…" },
  ]

  assert.deepEqual(listWriterRevisionHistory(messages).map((item) => item.revision), [1, 2])
  assert.equal(resolveWriterDraftForDisplay(messages, 1, "Generating…"), "Revision one")
})

test("manual edit payload carries the expected revision for continuation", () => {
  assert.deepEqual(
    buildWriterManualSavePayload({
      conversationId: "conversation-1",
      content: "Edited article",
      expectedRevision: 4,
      imagesRequested: false,
    }),
    {
      conversation_id: "conversation-1",
      content: "Edited article",
      expectedRevision: 4,
      status: "text_ready",
      imagesRequested: false,
    },
  )
})

test("image task failure preserves independent asset records as failed", () => {
  const current = [asset("cover", "ready", "https://cdn.example.com/cover.png"), asset("inline-1", "loading")]
  const failure = resolveWriterTaskFailureState(current, "provider timeout")

  assert.equal(failure.conversationStatus, "failed")
  assert.equal(failure.assetsLoading, false)
  assert.equal(failure.assetsError, "provider timeout")
  assert.deepEqual(failure.assets.map((item) => [item.id, item.status, item.error]), [
    ["cover", "failed", "provider timeout"],
    ["inline-1", "failed", "provider timeout"],
  ])
  assert.equal(current[0]?.status, "ready")
})

test("independent image progress merges one asset without dropping ready siblings", () => {
  const current = [asset("inline-1", "ready", "https://cdn.example.com/inline-1.png"), asset("cover", "ready", "https://cdn.example.com/cover.png")]
  const next = mergeWriterAssetProgress(current, asset("inline-2", "ready", "https://cdn.example.com/inline-2.png"), "wechat", "article")

  assert.deepEqual(next.map((item) => item.id), ["cover", "inline-1", "inline-2"])
  assert.equal(next[0]?.url, "https://cdn.example.com/cover.png")
  assert.equal(current.length, 2)
})
