import assert from "node:assert/strict"
import test from "node:test"

import { applySseEvent } from "./reducer"
import type {
  ArtifactPart,
  ReportPart,
  TaskProgressPart,
  ToolCallPart,
  ValidationPart,
} from "./types"

// --- Task 2: reasoning + task-progress + freeze ---

test("message delta 不产生 part（正文由 content 承载）", () => {
  const parts = applySseEvent([], { event: "message", answer: "Hello" })
  assert.deepEqual(parts, [])
})

test("reasoning delta 累积为 running reasoning part", () => {
  let parts = applySseEvent([], { event: "reasoning", answer: "think" })
  parts = applySseEvent(parts, { event: "reasoning", answer: "ing" })
  assert.deepEqual(parts, [
    { type: "reasoning", id: "reasoning", text: "thinking", status: "running" },
  ])
})

test("reasoning_end 冻结 reasoning part 为 done", () => {
  let parts = applySseEvent([], { event: "reasoning", answer: "think" })
  parts = applySseEvent(parts, { event: "reasoning_end" })
  assert.equal(parts[0].type, "reasoning")
  assert.equal((parts[0] as { status: string }).status, "done")
})

test("provider_selected 产生 running task-progress step", () => {
  const parts = applySseEvent([], { event: "provider_selected", provider: "pptoken", provider_model: "gpt-4o" })
  assert.equal(parts[0].type, "task-progress")
  const step = (parts[0] as { steps: { type: string; status: string; detail?: string }[] }).steps[0]
  assert.equal(step.type, "provider")
  assert.equal(step.status, "running")
  assert.equal(step.detail, "pptoken / gpt-4o")
})

test("knowledge_query_result 映射为 completed/failed/info step", () => {
  const parts = applySseEvent([], {
    event: "knowledge_query_result",
    data: { status: "hit", snippetCount: 3, datasetCount: 1 },
  })
  const step = (parts[0] as { steps: { status: string; detail: string }[] }).steps[0]
  assert.equal(step.status, "completed")
  assert.equal(step.detail, "3 snippets / 1 datasets")
})

test("message_end 冻结 reasoning 为 done", () => {
  let parts = applySseEvent([], { event: "reasoning", answer: "think" })
  parts = applySseEvent(parts, { event: "message_end", answer: "done" })
  assert.equal((parts[0] as { status: string }).status, "done")
})

// --- Task 3: tool-call parts ---

test("tool_call 产生 input-streaming tool-call part + running step", () => {
  const parts = applySseEvent([], {
    event: "tool_call",
    data: { toolName: "web_search", toolCallId: "tc1", args: { query: "ai marketing" } },
  })
  const tc = parts.find((p) => p.type === "tool-call") as ToolCallPart | undefined
  assert.ok(tc)
  assert.equal(tc?.state, "input-streaming")
  assert.equal(tc?.toolName, "web_search")
  const tp = parts.find((p) => p.type === "task-progress") as TaskProgressPart | undefined
  assert.equal(tp?.steps[0].type, "tool:tc1")
  assert.equal(tp?.steps[0].status, "running")
})

test("tool_result 把 tool-call 置为 output-available", () => {
  const parts = applySseEvent(
    [{ type: "tool-call", id: "tc1", toolName: "web_search", toolCallId: "tc1", args: {}, state: "input-streaming" } as ToolCallPart],
    { event: "tool_result", data: { toolName: "web_search", toolCallId: "tc1", result: { ok: true } } },
  )
  const tc = parts.find((p) => p.type === "tool-call") as ToolCallPart
  assert.equal(tc.state, "output-available")
})

test("tool_result with ok:false 置 output-error", () => {
  const parts = applySseEvent([], {
    event: "tool_result",
    data: { toolName: "x", toolCallId: "tc2", result: { ok: false, error: { code: "e", message: "bad" } } },
  })
  const tc = parts.find((p) => p.type === "tool-call") as ToolCallPart
  assert.equal(tc.state, "output-error")
})

// --- Task 4: source parts (web_search) ---

test("web_search tool_result 产生 source parts", () => {
  const parts = applySseEvent([], {
    event: "tool_result",
    data: {
      toolName: "web_search",
      toolCallId: "tc3",
      result: {
        ok: true,
        results: [
          { title: "A", url: "https://a.com", snippet: "sa" },
          { title: "B", url: "https://b.com" },
          { title: "no-url", url: "" },
        ],
      },
    },
  })
  const sources = parts.filter((p) => p.type === "source")
  assert.equal(sources.length, 2)
  assert.equal((sources[0] as { url: string | null }).url, "https://a.com")
})

// --- Task 5: artifact / report / validation ---

test("export_ppt_deck tool_result 产生 artifact part", () => {
  const parts = applySseEvent([], {
    event: "tool_result",
    data: {
      toolName: "export_ppt_deck",
      toolCallId: "tc4",
      result: {
        ok: true,
        title: "Deck",
        fileName: "deck.pptx",
        artifactId: 118,
        workLibraryHref: "/dashboard/works",
        previewUrl: "/api/platform/artifacts/118/download",
        downloadUrl: "/api/platform/artifacts/118/download?download=1",
      },
    },
  })
  const ap = parts.find((p) => p.type === "artifact") as ArtifactPart | undefined
  assert.ok(ap)
  assert.equal(ap?.artifactType, "pptx")
  assert.equal(ap?.workHref, "/dashboard/works")
  assert.equal(ap?.artifactId, 118)
})

test("preview_ppt_deck tool_result 产生 ppt-preview report part", () => {
  const parts = applySseEvent([], {
    event: "tool_result",
    data: {
      toolName: "preview_ppt_deck",
      toolCallId: "tc5",
      result: { ok: true, previewSessionId: "ps1", title: "T", variants: [{ key: "a", name: "A" }, { key: "b", name: "B" }] },
    },
  })
  const rp = parts.find((p) => p.type === "report") as ReportPart | undefined
  assert.ok(rp)
  assert.equal(rp?.reportType, "ppt-preview")
  assert.equal(rp?.variants.length, 2)
})

test("artifact_created 事件 upsert artifact part 并保留已存在 workHref", () => {
  let parts = applySseEvent([], {
    event: "tool_result",
    data: { toolName: "export_ppt_deck", toolCallId: "tc4", result: { ok: true, fileName: "deck.pptx", artifactId: 118, workLibraryHref: "/dashboard/works" } },
  })
  parts = applySseEvent(parts, {
    event: "artifact_created",
    artifact: { kind: "pptx", title: "Deck", fileName: "deck.pptx", artifactId: 118, previewUrl: "/p", downloadUrl: "/d" },
  })
  const ap = parts.find((p) => p.type === "artifact") as ArtifactPart
  assert.equal(ap.workHref, "/dashboard/works")
  assert.equal(ap.previewUrl, "/p")
})

test("validation_result 产生 validation part", () => {
  const parts = applySseEvent([], {
    event: "validation_result",
    data: { toolCallId: "tc4", validation: { ok: false, checks: [{ code: "c1", ok: false, message: "bad" }] } },
  })
  const vp = parts.find((p) => p.type === "validation") as ValidationPart | undefined
  assert.ok(vp)
  assert.equal(vp?.status, "failed")
  assert.equal(vp?.checks[0].code, "c1")
})
