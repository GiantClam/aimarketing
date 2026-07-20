import assert from "node:assert/strict"
import test from "node:test"

import { applySseEvent } from "./reducer"
import type { ArtifactPart, MessagePart, ReportPart, SourcePart, TaskProgressPart, ToolCallPart, ValidationPart } from "./types"

function findPart<T extends MessagePart["type"]>(
  parts: MessagePart[],
  type: T,
): Extract<MessagePart, { type: T }> | undefined {
  return parts.find((part): part is Extract<MessagePart, { type: T }> => part.type === type)
}

function findTaskStep(parts: MessagePart[], stepType: string) {
  return findPart(parts, "task-progress")?.steps.find((step) => step.type === stepType)
}

test("message delta 不产生 part（正文由 content 承载）", () => {
  const parts = applySseEvent([], { event: "message", answer: "Hello" })
  assert.deepEqual(parts, [])
})

test("reasoning delta 累积，reasoning_end 冻结为 done", () => {
  let parts = applySseEvent([], { event: "reasoning", answer: "think" })
  parts = applySseEvent(parts, { event: "reasoning", answer: "ing" })
  parts = applySseEvent(parts, { event: "reasoning_end" })

  const reasoning = findPart(parts, "reasoning")
  assert.equal(reasoning?.text, "thinking")
  assert.equal(reasoning?.status, "done")
})

test("task-progress 会 upsert 同类型 step，message_end 会冻结 parts", () => {
  let parts = applySseEvent([], { event: "conversation_init" })
  parts = applySseEvent(parts, { event: "provider_selected", provider: "pptoken", provider_model: "gpt-4o" })
  parts = applySseEvent(parts, { event: "provider_selected", provider: "fallback", provider_model: "gpt-4o-mini" })
  parts = applySseEvent(parts, { event: "message_end" })

  const taskProgress = findPart(parts, "task-progress") as TaskProgressPart | undefined
  assert.ok(taskProgress)
  assert.equal(taskProgress?.status, "done")
  assert.equal(taskProgress?.steps.length, 2)
  assert.equal(taskProgress?.steps[0].type, "conversation_init")
  assert.equal(taskProgress?.steps[0].status, "completed")
  assert.equal(taskProgress?.steps[1].type, "provider")
  assert.equal(taskProgress?.steps[1].detail, "fallback / gpt-4o-mini")
  assert.equal(taskProgress?.steps[1].status, "completed")
})

test("tool_call_start / tool_call_done / tool_call_error 会更新 tool-call 和 progress", () => {
  let parts = applySseEvent([], {
    event: "tool_call_start",
    data: { toolName: "web_search", toolCallId: "tc1", args: { query: "ai marketing" } },
  })

  let toolCall = findPart(parts, "tool-call") as ToolCallPart | undefined
  assert.ok(toolCall)
  assert.equal(toolCall?.state, "input-streaming")
  assert.deepEqual(toolCall?.args, { query: "ai marketing" })
  assert.equal(findTaskStep(parts, "tool:tc1")?.status, "running")

  parts = applySseEvent(parts, { event: "tool_call_done", data: { toolName: "web_search", toolCallId: "tc1" } })
  toolCall = findPart(parts, "tool-call") as ToolCallPart | undefined
  assert.equal(toolCall?.state, "output-available")
  assert.equal(findTaskStep(parts, "tool:tc1")?.status, "completed")

  parts = applySseEvent(parts, { event: "tool_call_error", data: { toolName: "web_search", toolCallId: "tc1" } })
  toolCall = findPart(parts, "tool-call") as ToolCallPart | undefined
  assert.equal(toolCall?.state, "output-error")
  assert.equal(findTaskStep(parts, "tool:tc1")?.status, "failed")
})

test("web_search tool_result 产生 url source parts", () => {
  const parts = applySseEvent([], {
    event: "tool_result",
    data: {
      toolName: "web_search",
      toolCallId: "tc2",
      result: {
        ok: true,
        results: [
          { title: "A", url: "https://a.example", snippet: "sa" },
          { title: "B", url: "https://b.example", snippet: "sb" },
        ],
      },
    },
  })

  const toolCall = findPart(parts, "tool-call") as ToolCallPart | undefined
  const sources = parts.filter((part): part is SourcePart => part.type === "source")
  assert.equal(toolCall?.state, "output-available")
  assert.equal(sources.length, 2)
  assert.equal(sources[0].sourceType, "url")
  assert.equal(sources[0].url, "https://a.example")
  assert.equal(findTaskStep(parts, "tool:tc2")?.status, "completed")
  assert.match(findTaskStep(parts, "tool:tc2")?.detail ?? "", /2 sources/)
})

test("knowledge_query_result 产生 document/url source parts", () => {
  const parts = applySseEvent([], {
    event: "knowledge_query_result",
    data: {
      toolName: "knowledge_query",
      toolCallId: "k1",
      status: "hit",
      snippetCount: 1,
      datasetCount: 1,
      result: {
        ok: true,
        results: [
          { title: "Doc A", snippet: "doc snippet" },
          { title: "Doc B", url: "https://doc.example", snippet: "linked snippet" },
        ],
      },
    },
  })

  const sources = parts.filter((part): part is SourcePart => part.type === "source")
  const taskProgress = findPart(parts, "task-progress") as TaskProgressPart | undefined
  assert.equal(sources.length, 2)
  assert.equal(sources[0].sourceType, "document")
  assert.equal(sources[0].title, "Doc A")
  assert.equal(sources[1].sourceType, "url")
  assert.equal(taskProgress?.steps[0].status, "completed")
  assert.equal(taskProgress?.steps[0].detail, "2 sources: Doc A / Doc B")
})

test("preview_ppt_deck tool_result 产生 report part", () => {
  const parts = applySseEvent([], {
    event: "tool_result",
    data: {
      toolName: "preview_ppt_deck",
      toolCallId: "tc3",
      result: {
        ok: true,
        previewSessionId: "ps1",
        title: "Deck preview",
        variants: [
          { key: "a", name: "Variant A", summary: "first" },
          { key: "b", name: "Variant B", summary: null },
        ],
      },
    },
  })

  const report = findPart(parts, "report") as ReportPart | undefined
  assert.ok(report)
  assert.equal(report?.reportType, "ppt-preview")
  assert.equal(report?.title, "Deck preview")
  assert.deepEqual(report?.variants, [
    { key: "a", name: "Variant A", summary: "first" },
    { key: "b", name: "Variant B", summary: null },
  ])
})

test("preview_ppt_deck 需要选择模板时产生 template-recommendation part", () => {
  const parts = applySseEvent([], {
    event: "tool_result",
    data: {
      toolName: "preview_ppt_deck",
      toolCallId: "tc-template",
      result: {
        ok: false,
        error: {
          code: "ppt_template_selection_required",
          message: "Select one recommended template before generating the editable PPT preview.",
        },
        recommendedTemplates: [
          {
            templateId: "anthropic-brand",
            templateLabel: "Anthropic 品牌",
            styleName: "Long Table",
          },
          {
            templateId: "academic-defense",
            templateLabel: "学术答辩",
            styleName: "Attention Research",
          },
        ],
      },
    },
  })

  const recommendation = findPart(parts, "template-recommendation")
  assert.ok(recommendation)
  assert.equal(recommendation?.defaultTemplateId, "anthropic-brand")
  assert.deepEqual(recommendation?.templates, [
    { templateId: "anthropic-brand", labels: ["Anthropic 品牌", "Long Table", "anthropic-brand"] },
    { templateId: "academic-defense", labels: ["学术答辩", "Attention Research", "academic-defense"] },
  ])
  const toolCall = findPart(parts, "tool-call") as ToolCallPart | undefined
  assert.equal(toolCall?.state, "output-blocked")
  assert.equal(findTaskStep(parts, "tool:tc-template")?.status, "waiting")
})

test("export_ppt_deck tool_result + artifact_created 会 upsert artifact part", () => {
  let parts = applySseEvent([], {
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

  parts = applySseEvent(parts, {
    event: "artifact_created",
    artifact: {
      kind: "pptx",
      title: "Deck Updated",
      fileName: "deck.pptx",
      artifactId: 118,
      previewUrl: "/api/platform/artifacts/118/download?preview=1",
      downloadUrl: "/api/platform/artifacts/118/download?download=1",
    },
  })

  const artifact = findPart(parts, "artifact") as ArtifactPart | undefined
  assert.ok(artifact)
  assert.equal(artifact?.artifactType, "pptx")
  assert.equal(artifact?.artifactId, 118)
  assert.equal(artifact?.title, "Deck Updated")
  assert.equal(artifact?.previewUrl, "/api/platform/artifacts/118/download?preview=1")
  assert.equal(artifact?.workHref, "/dashboard/works")
})

test("validation_result 产生 validation part（passed）和 progress step", () => {
  const parts = applySseEvent([], {
    event: "validation_result",
    data: {
      toolCallId: "tc5",
      validation: {
        ok: true,
        checks: [{ code: "c1", ok: true, message: "good" }],
      },
    },
  })

  const validation = findPart(parts, "validation") as ValidationPart | undefined
  assert.ok(validation)
  assert.equal(validation?.status, "passed")
  assert.deepEqual(validation?.checks, [{ code: "c1", ok: true, message: "good" }])
  assert.equal(findTaskStep(parts, "validation:tc5")?.status, "completed")
})

test("validation_result 失败时会标记 failed 并保留检查信息", () => {
  const parts = applySseEvent([], {
    event: "validation_result",
    data: {
      toolCallId: "tc6",
      validation: {
        ok: false,
        checks: [
          { code: "c1", ok: true, message: "fine" },
          { code: "c2", ok: false, message: "bad" },
        ],
      },
    },
  })

  const validation = findPart(parts, "validation") as ValidationPart | undefined
  assert.equal(validation?.status, "failed")
  assert.equal(validation?.checks.length, 2)
  assert.equal(findTaskStep(parts, "validation:tc6")?.status, "failed")
  assert.equal(findTaskStep(parts, "validation:tc6")?.detail, "bad")
})

test("persists resolved Skills separately from actual Skill invocation", () => {
  let parts = applySseEvent([], { event: "agent_resolved", agent_id: "business-content-growth" })
  parts = applySseEvent(parts, { event: "skill_selected", skill_id: "longform-writing" })
  parts = applySseEvent(parts, { event: "skill_activated", skill_id: "longform-writing" })
  parts = applySseEvent(parts, { event: "skill_completed", skill_id: "longform-writing" })
  assert.equal(findTaskStep(parts, "agent_resolved")?.detail, "business-content-growth")
  assert.equal(findTaskStep(parts, "skill-resolved:longform-writing")?.status, "info")
  assert.equal(findTaskStep(parts, "skill-invocation:longform-writing")?.status, "completed")
})
