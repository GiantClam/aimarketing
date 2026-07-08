import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

import { buildResearchBriefContextMarker } from "./research-brief-context"
import { buildPptTemplateRecommendationMessage } from "./ppt-tool-result-message"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load
let previewInput: Record<string, unknown> | null = null
let exportInput: Record<string, unknown> | null = null
let webSearchResult: Record<string, unknown> = { ok: true }
let previewToolResult: Record<string, unknown> = {
  ok: true,
  previewSessionId: "preview-session-1",
  recommendedVariantKey: "variant-a",
  variants: [{ key: "variant-a", name: "Variant A" }],
}
let exportToolResult: Record<string, unknown> = { ok: true }
const enqueuedTasks: Array<{ userId: number; workflowName: string; payload: Record<string, unknown> }> = []

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "server-only") {
    return {}
  }

  if (request === "ai") {
    return {
      tool: (definition: Record<string, unknown>) => definition,
    }
  }

  if (request === "@/lib/ai-entry/ppt-tools") {
    return {
      buildAiEntryPptTools: () => ({
        preview_ppt_deck: {
          description: "Preview deck",
          inputSchema: {},
          execute: async (input: Record<string, unknown>) => {
            previewInput = input
            return previewToolResult
          },
        },
        export_ppt_deck: {
          description: "Export deck",
          inputSchema: {},
          execute: async (input: Record<string, unknown>) => {
            exportInput = input
            return exportToolResult
          },
        },
      }),
    }
  }

  if (request === "@/lib/assistant-async") {
    return {
      enqueueAssistantTask: async (input: {
        userId: number
        workflowName: string
        payload: Record<string, unknown>
      }) => {
        enqueuedTasks.push(input)
        return { id: 901 }
      },
    }
  }

  if (request === "@/lib/ai-entry/web-search-tool") {
    return {
      buildAiEntryWebSearchTools: () => ({
        web_search: {
          description: "Search",
          inputSchema: {},
          execute: async () => webSearchResult,
        },
      }),
    }
  }

  if (request === "@/lib/ai-entry/mcp-tools") {
    return {
      getAiEntryMcpServerDefinitions: () => [],
      loadAiEntryMcpTools: async () => ({
        skills: [],
        tools: {},
        close: async () => {},
        loadedServerIds: [],
        warnings: [],
      }),
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let buildAiEntryToolRegistry: typeof import("./tool-registry").buildAiEntryToolRegistry

test.before(async () => {
  const mod = await import("./tool-registry")
  buildAiEntryToolRegistry = mod.buildAiEntryToolRegistry
})

test.beforeEach(() => {
  previewInput = null
  exportInput = null
  webSearchResult = { ok: true }
  previewToolResult = {
    ok: true,
    previewSessionId: "preview-session-1",
    recommendedVariantKey: "variant-a",
    variants: [{ key: "variant-a", name: "Variant A" }],
  }
  exportToolResult = { ok: true }
  enqueuedTasks.length = 0
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("tool registry only exposes tools that survive the allowlist", async () => {
  const result = await buildAiEntryToolRegistry({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
    policy: {
      agentId: "general",
      allowedSkillIds: ["ppt-master"],
      allowedToolIds: ["preview_ppt_deck"],
      allowedMcpServerIds: [],
      maxToolCalls: 4,
      maxRuntimeMs: 30_000,
      canCreateArtifacts: true,
      approvalRequiredToolIds: [],
    },
    selectedSkills: [
      {
        id: "ppt-master",
        name: "PPT Master",
        description: "PPT",
        type: "tool",
        triggerHints: ["ppt"],
        instruction: "Use preview then export.",
        toolIds: ["preview_ppt_deck", "export_ppt_deck"],
        mcpServerIds: [],
        version: "1",
      },
    ],
    skillsEnabled: true,
    enabledToolNames: null,
    auditContext: {
      traceId: "trace-1",
      conversationId: "conv-1",
      agentId: "general",
    },
  })

  assert.deepEqual(result.selectedToolIds, ["preview_ppt_deck"])
})

test("tool registry includes web_search when ppt-master skill and policy both allow it", async () => {
  const result = await buildAiEntryToolRegistry({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
    policy: {
      agentId: "general",
      allowedSkillIds: ["ppt-master"],
      allowedToolIds: ["web_search", "preview_ppt_deck", "export_ppt_deck"],
      allowedMcpServerIds: [],
      maxToolCalls: 4,
      maxRuntimeMs: 30_000,
      canCreateArtifacts: true,
      approvalRequiredToolIds: [],
    },
    selectedSkills: [
      {
        id: "ppt-master",
        name: "PPT Master",
        description: "PPT",
        type: "tool",
        triggerHints: ["ppt"],
        instruction: "Use web_search before preview when facts matter, then preview and export.",
        toolIds: ["web_search", "preview_ppt_deck", "export_ppt_deck"],
        mcpServerIds: [],
        version: "1",
      },
    ],
    skillsEnabled: true,
    enabledToolNames: null,
    auditContext: {
      traceId: "trace-2",
      conversationId: "conv-2",
      agentId: "general",
    },
  })

  assert.deepEqual(result.selectedToolIds, ["web_search", "preview_ppt_deck", "export_ppt_deck"])
})

test("tool registry keeps ppt assistant in preview-only mode before export confirmation", async () => {
  const result = await buildAiEntryToolRegistry({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
    policy: {
      agentId: "executive-ppt",
      allowedSkillIds: ["ppt-master"],
      allowedToolIds: ["web_search", "preview_ppt_deck", "export_ppt_deck"],
      allowedMcpServerIds: [],
      maxToolCalls: 4,
      maxRuntimeMs: 30_000,
      canCreateArtifacts: true,
      approvalRequiredToolIds: [],
    },
    selectedSkills: [
      {
        id: "ppt-master",
        name: "PPT Master",
        description: "PPT",
        type: "tool",
        triggerHints: ["ppt"],
        instruction: "Use preview first, then wait for confirmation before export.",
        toolIds: ["web_search", "preview_ppt_deck", "export_ppt_deck"],
        mcpServerIds: [],
        version: "1",
      },
    ],
    skillsEnabled: true,
    enabledToolNames: null,
    latestUserPrompt: "请生成一份董事会汇报 PPT，并先给我看预览。",
    messageContents: ["请生成一份董事会汇报 PPT，并先给我看预览。"],
    auditContext: {
      traceId: "trace-ppt-preview-only",
      conversationId: "conv-ppt-preview-only",
      agentId: "executive-ppt",
    },
  })

  assert.deepEqual(result.selectedToolIds, ["web_search", "preview_ppt_deck"])
  assert.equal(result.toolChoice, undefined)
})

test("tool registry enables export for ppt assistant after preview context exists", async () => {
  const result = await buildAiEntryToolRegistry({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
    policy: {
      agentId: "executive-ppt",
      allowedSkillIds: ["ppt-master"],
      allowedToolIds: ["web_search", "preview_ppt_deck", "export_ppt_deck"],
      allowedMcpServerIds: [],
      maxToolCalls: 4,
      maxRuntimeMs: 30_000,
      canCreateArtifacts: true,
      approvalRequiredToolIds: [],
    },
    selectedSkills: [
      {
        id: "ppt-master",
        name: "PPT Master",
        description: "PPT",
        type: "tool",
        triggerHints: ["ppt"],
        instruction: "Use preview first, then wait for confirmation before export.",
        toolIds: ["web_search", "preview_ppt_deck", "export_ppt_deck"],
        mcpServerIds: [],
        version: "1",
      },
    ],
    skillsEnabled: true,
    enabledToolNames: null,
    latestUserPrompt: "这个版本不错。",
    messageContents: [
      "已生成 PPT 预览：\n<!-- ai-entry-ppt-preview-context:{\"previewSessionId\":\"preview-session-1\",\"defaultVariantKey\":\"variant-a\",\"variantKeys\":[\"variant-a\",\"variant-b\"]} -->",
    ],
    auditContext: {
      traceId: "trace-ppt-export-enabled",
      conversationId: "conv-ppt-export-enabled",
      agentId: "executive-ppt",
    },
  })

  assert.deepEqual(result.selectedToolIds, ["web_search", "preview_ppt_deck", "export_ppt_deck"])
  assert.equal(result.toolChoice, undefined)

  const tools = result.selectedTools as unknown as Record<
    string,
    { execute: (input: Record<string, unknown>) => Promise<unknown> }
  >
  await tools.export_ppt_deck.execute({})
  assert.deepEqual(exportInput, {
    previewSessionId: "preview-session-1",
    selectedVariantKey: "variant-a",
  })
})

test("tool registry disables export for ppt assistant after preview invalidation", async () => {
  const result = await buildAiEntryToolRegistry({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
    policy: {
      agentId: "executive-ppt",
      allowedSkillIds: ["ppt-master"],
      allowedToolIds: ["web_search", "preview_ppt_deck", "export_ppt_deck"],
      allowedMcpServerIds: [],
      maxToolCalls: 4,
      maxRuntimeMs: 30_000,
      canCreateArtifacts: true,
      approvalRequiredToolIds: [],
    },
    selectedSkills: [
      {
        id: "ppt-master",
        name: "PPT Master",
        description: "PPT",
        type: "tool",
        triggerHints: ["ppt"],
        instruction: "Use preview first, then wait for confirmation before export.",
        toolIds: ["web_search", "preview_ppt_deck", "export_ppt_deck"],
        mcpServerIds: [],
        version: "1",
      },
    ],
    skillsEnabled: true,
    enabledToolNames: null,
    latestUserPrompt: "继续导出。",
    messageContents: [
      "已生成 PPT 预览：\n<!-- ai-entry-ppt-preview-context:{\"previewSessionId\":\"preview-session-stale\",\"defaultVariantKey\":\"variant-a\",\"variantKeys\":[\"variant-a\"]} -->",
      "当前 PPT 预览已失效：\n<!-- ai-entry-ppt-preview-invalidated:{\"previewSessionId\":\"preview-session-stale\"} -->",
    ],
    auditContext: {
      traceId: "trace-ppt-export-disabled-after-invalidation",
      conversationId: "conv-ppt-export-disabled-after-invalidation",
      agentId: "executive-ppt",
    },
  })

  assert.deepEqual(result.selectedToolIds, ["web_search", "preview_ppt_deck"])
})

test("tool registry keeps export available for ppt assistant rebuild turns after a stale preview context exists", async () => {
  const result = await buildAiEntryToolRegistry({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
    policy: {
      agentId: "executive-ppt",
      allowedSkillIds: ["ppt-master"],
      allowedToolIds: ["web_search", "preview_ppt_deck", "export_ppt_deck"],
      allowedMcpServerIds: [],
      maxToolCalls: 4,
      maxRuntimeMs: 30_000,
      canCreateArtifacts: true,
      approvalRequiredToolIds: [],
    },
    selectedSkills: [
      {
        id: "ppt-master",
        name: "PPT Master",
        description: "PPT",
        type: "tool",
        triggerHints: ["ppt"],
        instruction: "Use preview first, then wait for confirmation before export.",
        toolIds: ["web_search", "preview_ppt_deck", "export_ppt_deck"],
        mcpServerIds: [],
        version: "1",
      },
    ],
    skillsEnabled: true,
    enabledToolNames: null,
    latestUserPrompt: "这个版本可以，直接继续。",
    messageContents: [
      "已生成 PPT 预览：\n<!-- ai-entry-ppt-preview-context:{\"previewSessionId\":\"preview-session-stale\",\"defaultVariantKey\":\"variant-a\",\"variantKeys\":[\"variant-a\"]} -->",
      "旧的预览会话已经失效，需要先重建。",
    ],
    auditContext: {
      traceId: "trace-ppt-export-rebuild",
      conversationId: "conv-ppt-export-rebuild",
      agentId: "executive-ppt",
    },
  })

  assert.deepEqual(result.selectedToolIds, ["web_search", "preview_ppt_deck", "export_ppt_deck"])
  assert.equal(result.toolChoice, undefined)
})

test("tool registry injects the fresh preview session into export after a rebuild turn", async () => {
  previewToolResult = {
    ok: true,
    previewSessionId: "preview-session-fresh",
    recommendedVariantKey: "variant-b",
    variants: [
      { key: "variant-a", name: "Variant A" },
      { key: "variant-b", name: "Variant B" },
    ],
  }

  const result = await buildAiEntryToolRegistry({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
    policy: {
      agentId: "executive-ppt",
      allowedSkillIds: ["ppt-master"],
      allowedToolIds: ["web_search", "preview_ppt_deck", "export_ppt_deck"],
      allowedMcpServerIds: [],
      maxToolCalls: 4,
      maxRuntimeMs: 30_000,
      canCreateArtifacts: true,
      approvalRequiredToolIds: [],
    },
    selectedSkills: [
      {
        id: "ppt-master",
        name: "PPT Master",
        description: "PPT",
        type: "tool",
        triggerHints: ["ppt"],
        instruction: "If preview is stale, rebuild it and then export in the same turn.",
        toolIds: ["web_search", "preview_ppt_deck", "export_ppt_deck"],
        mcpServerIds: [],
        version: "1",
      },
    ],
    skillsEnabled: true,
    enabledToolNames: null,
    executionContext: "workflow",
    latestUserPrompt: "可以，直接继续导出。",
    messageContents: [
      "已生成 PPT 预览：\n<!-- ai-entry-ppt-preview-context:{\"previewSessionId\":\"preview-session-stale\",\"defaultVariantKey\":\"variant-a\",\"variantKeys\":[\"variant-a\"]} -->",
      "当前 PPT 预览已失效：\n<!-- ai-entry-ppt-preview-invalidated:{\"previewSessionId\":\"preview-session-stale\"} -->",
    ],
    auditContext: {
      traceId: "trace-ppt-rebuild-fresh-export",
      conversationId: "conv-ppt-rebuild-fresh-export",
      agentId: "executive-ppt",
    },
  })

  const tools = result.selectedTools as unknown as Record<
    string,
    { execute: (input: Record<string, unknown>) => Promise<unknown> }
  >
  await tools.preview_ppt_deck.execute({
    prompt: "请重建董事会汇报 PPT 预览",
    audience: "管理层",
    goal: "经营决策同步",
    scenario: "marketing-campaign",
    language: "zh-CN",
  })
  await tools.export_ppt_deck.execute({})

  assert.deepEqual(exportInput, {
    previewSessionId: "preview-session-fresh",
    selectedVariantKey: "variant-b",
  })
})

test("tool registry queues executive-ppt preview in the background for chat turns", async () => {
  const result = await buildAiEntryToolRegistry({
    currentUser: {
      id: 42,
      enterpriseId: 3,
    } as never,
    policy: {
      agentId: "executive-ppt",
      allowedSkillIds: ["ppt-master"],
      allowedToolIds: ["preview_ppt_deck"],
      allowedMcpServerIds: [],
      maxToolCalls: 4,
      maxRuntimeMs: 30_000,
      canCreateArtifacts: true,
      approvalRequiredToolIds: [],
    },
    selectedSkills: [
      {
        id: "ppt-master",
        name: "PPT Master",
        description: "PPT",
        type: "tool",
        triggerHints: ["ppt"],
        instruction: "Preview deck in background.",
        toolIds: ["preview_ppt_deck"],
        mcpServerIds: [],
        version: "1",
      },
    ],
    skillsEnabled: true,
    enabledToolNames: null,
    conversationScope: "consulting",
    latestUserPrompt: "用第一个模板开始生成",
    messageContents: [
      "<!-- ai-entry-ppt-template-recommendations:{\"defaultTemplateId\":\"long-table\",\"templateIds\":[\"long-table\",\"neo-grid-bold\",\"broadside\",\"playful\"]} -->",
    ],
    auditContext: {
      traceId: "trace-background-preview",
      conversationId: "conv-background-preview",
      agentId: "executive-ppt",
    },
  })

  const tools = result.selectedTools as unknown as Record<
    string,
    { execute: (input: Record<string, unknown>) => Promise<Record<string, unknown>> }
  >
  const queued = await tools.preview_ppt_deck.execute({
    prompt: "请生成董事会汇报 PPT",
    audience: "管理层",
    goal: "经营同步",
    scenario: "marketing-campaign",
    language: "zh-CN",
    templateMode: "single-template",
    templateId: "long-table",
  })

  assert.equal(previewInput, null)
  assert.equal(enqueuedTasks.length, 1)
  assert.deepEqual(enqueuedTasks[0], {
    userId: 42,
    workflowName: "ai_entry_ppt_preview",
    payload: {
      kind: "ai_entry_ppt_preview",
      userId: 42,
      conversationId: "conv-background-preview",
      conversationScope: "consulting",
      agentId: "executive-ppt",
      toolCallId: "preview_ppt_deck",
      input: {
        prompt: [
          "请生成董事会汇报 PPT",
          "Structured brief:",
          "Audience: 管理层",
          "Goal: 经营同步",
          "Scenario: marketing-campaign",
          "Language: zh-CN",
        ].join("\n"),
        sourcePrompt: "用第一个模板开始生成",
        audience: "管理层",
        goal: "经营同步",
        scenario: "marketing-campaign",
        language: "zh-CN",
        templateMode: "single-template",
        templateId: "long-table",
      },
      isZh: true,
    },
  })
  assert.equal(queued.status, "queued")
  assert.equal((queued.backgroundTask as { taskId?: string } | undefined)?.taskId, "901")
})

test("tool registry reads structured export state instead of natural-language export wording", async () => {
  const result = await buildAiEntryToolRegistry({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
    policy: {
      agentId: "executive-ppt",
      allowedSkillIds: ["ppt-master"],
      allowedToolIds: ["web_search", "preview_ppt_deck", "export_ppt_deck"],
      allowedMcpServerIds: [],
      maxToolCalls: 4,
      maxRuntimeMs: 30_000,
      canCreateArtifacts: true,
      approvalRequiredToolIds: [],
    },
    selectedSkills: [
      {
        id: "ppt-master",
        name: "PPT Master",
        description: "PPT",
        type: "tool",
        triggerHints: ["ppt"],
        instruction: "Use preview first, then wait for confirmation before export.",
        toolIds: ["web_search", "preview_ppt_deck", "export_ppt_deck"],
        mcpServerIds: [],
        version: "1",
      },
    ],
    skillsEnabled: true,
    enabledToolNames: null,
    latestUserPrompt: "继续。",
    messageContents: [
      [
        "已生成 PPT 预览：",
        "<!-- ai-entry-ppt-preview-context:{\"previewSessionId\":\"preview-session-1\",\"defaultVariantKey\":\"variant-a\",\"variantKeys\":[\"variant-a\",\"variant-b\"]} -->",
      ].join("\n"),
      [
        "已生成 PPT 成品：",
        "<!-- ai-entry-ppt-export-context:{\"previewSessionId\":\"preview-session-1\",\"selectedVariantKey\":\"variant-a\",\"artifactId\":118} -->",
      ].join("\n"),
    ],
    auditContext: {
      traceId: "trace-ppt-export-state",
      conversationId: "conv-ppt-export-state",
      agentId: "executive-ppt",
    },
  })

  assert.deepEqual(result.selectedToolIds, ["web_search", "preview_ppt_deck", "export_ppt_deck"])
  assert.equal(result.toolChoice, undefined)
})

test("tool registry keeps export enabled for workflow ppt execution without chat confirmation", async () => {
  const result = await buildAiEntryToolRegistry({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
    policy: {
      agentId: "executive-ppt",
      allowedSkillIds: ["ppt-master"],
      allowedToolIds: ["web_search", "preview_ppt_deck", "export_ppt_deck"],
      allowedMcpServerIds: [],
      maxToolCalls: 4,
      maxRuntimeMs: 30_000,
      canCreateArtifacts: true,
      approvalRequiredToolIds: [],
    },
    selectedSkills: [
      {
        id: "ppt-master",
        name: "PPT Master",
        description: "PPT",
        type: "tool",
        triggerHints: ["ppt"],
        instruction: "Use preview then export for workflow execution.",
        toolIds: ["web_search", "preview_ppt_deck", "export_ppt_deck"],
        mcpServerIds: [],
        version: "1",
      },
    ],
    skillsEnabled: true,
    enabledToolNames: null,
    executionContext: "workflow",
    latestUserPrompt: "做一份董事会汇报 PPT",
    messageContents: ["做一份董事会汇报 PPT"],
    auditContext: {
      traceId: "trace-ppt-workflow-export",
      conversationId: "conv-ppt-workflow-export",
      agentId: "executive-ppt",
    },
  })

  assert.deepEqual(result.selectedToolIds, ["web_search", "preview_ppt_deck", "export_ppt_deck"])
})

test("tool registry injects a research brief from web_search into preview_ppt_deck", async () => {
  webSearchResult = {
    query: "Hormuz Strait shipping risk 2026",
    intent: "Need fresh evidence for a geopolitical shipping deck",
    results: [
      {
        title: "Shipping insurers reprice Gulf exposure",
        url: "https://example.com/insurers",
        snippet: "War-risk premiums rose and tanker routing assumptions shifted across Gulf lanes.",
      },
    ],
  }

  const result = await buildAiEntryToolRegistry({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
    policy: {
      agentId: "general",
      allowedSkillIds: ["ppt-master"],
      allowedToolIds: ["web_search", "preview_ppt_deck", "export_ppt_deck"],
      allowedMcpServerIds: [],
      maxToolCalls: 4,
      maxRuntimeMs: 30_000,
      canCreateArtifacts: true,
      approvalRequiredToolIds: [],
    },
    selectedSkills: [
      {
        id: "ppt-master",
        name: "PPT Master",
        description: "PPT",
        type: "tool",
        triggerHints: ["ppt"],
        instruction: "Use web_search before preview when facts matter, then preview and export.",
        toolIds: ["web_search", "preview_ppt_deck", "export_ppt_deck"],
        mcpServerIds: [],
        version: "1",
      },
    ],
    skillsEnabled: true,
    enabledToolNames: null,
    auditContext: {
      traceId: "trace-3",
      conversationId: "conv-3",
      agentId: "general",
    },
  })

  const tools = result.selectedTools as unknown as Record<
    string,
    { execute: (input: Record<string, unknown>) => Promise<unknown> }
  >
  await tools.web_search.execute({
    query: "Hormuz Strait shipping risk 2026",
    intent: "Need fresh evidence for a geopolitical shipping deck",
  })
  await tools.preview_ppt_deck.execute({
    prompt: "做一份霍尔木兹海峡现状汇报 PPT",
    audience: "管理层汇报",
    goal: "经营汇报与决策同步",
    scenario: "marketing-campaign",
    language: "zh-CN",
  })

  assert.ok(previewInput)
  assert.equal(typeof previewInput?.researchBrief, "object")
  assert.deepEqual(previewInput?.researchBrief, {
    topic: "Hormuz Strait shipping risk 2026",
    keyFacts: ["War-risk premiums rose and tanker routing assumptions shifted across Gulf lanes."],
    sourceNotes: ["Shipping insurers reprice Gulf exposure - https://example.com/insurers"],
    implications: ["Need fresh evidence for a geopolitical shipping deck"],
    rawSummary: [
      "Topic: Hormuz Strait shipping risk 2026",
      "Key facts:",
      "- War-risk premiums rose and tanker routing assumptions shifted across Gulf lanes.",
      "Implications:",
      "- Need fresh evidence for a geopolitical shipping deck",
      "Source notes:",
      "- Shipping insurers reprice Gulf exposure - https://example.com/insurers",
    ].join("\n"),
  })
})

test("tool registry restores a persisted research brief marker from message history", async () => {
  const result = await buildAiEntryToolRegistry({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
    policy: {
      agentId: "executive-ppt",
      allowedSkillIds: ["ppt-master"],
      allowedToolIds: ["preview_ppt_deck"],
      allowedMcpServerIds: [],
      maxToolCalls: 4,
      maxRuntimeMs: 30_000,
      canCreateArtifacts: true,
      approvalRequiredToolIds: [],
    },
    selectedSkills: [
      {
        id: "ppt-master",
        name: "PPT Master",
        description: "PPT",
        type: "tool",
        triggerHints: ["ppt"],
        instruction: "Restore research context from history before preview.",
        toolIds: ["preview_ppt_deck"],
        mcpServerIds: [],
        version: "1",
      },
    ],
    skillsEnabled: true,
    enabledToolNames: null,
    messageContents: [
      [
        "历史消息",
        buildResearchBriefContextMarker({
          topic: "Crimea military posture 2026",
          keyFacts: ["Russia dispersed Black Sea Fleet assets after repeated strikes on Crimea bases."],
          sourceNotes: ["Fleet posture update - https://example.com/fleet"],
          implications: ["Need current evidence before generating a geopolitical PPT."],
          rawSummary: [
            "Topic: Crimea military posture 2026",
            "Key facts:",
            "- Russia dispersed Black Sea Fleet assets after repeated strikes on Crimea bases.",
            "Implications:",
            "- Need current evidence before generating a geopolitical PPT.",
            "Source notes:",
            "- Fleet posture update - https://example.com/fleet",
          ].join("\n"),
        }),
        buildPptTemplateRecommendationMessage({
          isZh: true,
          selectedTemplateId: "swiss-grid",
          recommendedTemplates: [
            { rank: 1, templateId: "swiss-grid", templateLabel: "瑞士网格", styleName: "Neo-Grid Bold" },
            { rank: 2, templateId: "government-blue", templateLabel: "政务蓝", styleName: "Long Table" },
          ],
        }) || "",
      ].join("\n"),
    ],
    pptBriefState: {
      topic: "克里米亚现状军事分析",
      audience: "初级军事爱好者",
      goal: "课堂讲解",
      scenario: "training",
      language: "zh-CN",
      pageCount: 12,
      tone: "简洁、专业、结构化",
      mustInclude: [],
      missingFields: [],
      readyForPreview: true,
      suggestedValues: {
        audience: "初级军事爱好者",
        goal: "课堂讲解",
        scenario: "training",
        language: "zh-CN",
        pageCount: 12,
        tone: "简洁、专业、结构化",
      },
    },
    auditContext: {
      traceId: "trace-history-research",
      conversationId: "conv-history-research",
      agentId: "executive-ppt",
    },
  })

  const tools = result.selectedTools as unknown as Record<
    string,
    { execute: (input: Record<string, unknown>) => Promise<unknown> }
  >
  await tools.preview_ppt_deck.execute({
    prompt: "按推荐模板继续生成克里米亚课堂 PPT 预览。",
    templateMode: "single-template",
    templateId: "swiss-grid",
  })

  const queuedInput = enqueuedTasks.at(-1)?.payload?.input as Record<string, unknown> | undefined
  assert.ok(queuedInput)
  assert.deepEqual(queuedInput?.researchBrief, {
    topic: "Crimea military posture 2026",
    keyFacts: ["Russia dispersed Black Sea Fleet assets after repeated strikes on Crimea bases."],
    sourceNotes: ["Fleet posture update - https://example.com/fleet"],
    implications: ["Need current evidence before generating a geopolitical PPT."],
    rawSummary: [
      "Topic: Crimea military posture 2026",
      "Key facts:",
      "- Russia dispersed Black Sea Fleet assets after repeated strikes on Crimea bases.",
      "Implications:",
      "- Need current evidence before generating a geopolitical PPT.",
      "Source notes:",
      "- Fleet posture update - https://example.com/fleet",
    ].join("\n"),
  })
})

test("tool registry blocks preview_ppt_deck when the ppt brief is incomplete", async () => {
  const result = await buildAiEntryToolRegistry({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
    policy: {
      agentId: "executive-ppt",
      allowedSkillIds: ["ppt-master"],
      allowedToolIds: ["preview_ppt_deck", "export_ppt_deck"],
      allowedMcpServerIds: [],
      maxToolCalls: 4,
      maxRuntimeMs: 30_000,
      canCreateArtifacts: true,
      approvalRequiredToolIds: [],
    },
    selectedSkills: [
      {
        id: "ppt-master",
        name: "PPT Master",
        description: "PPT",
        type: "tool",
        triggerHints: ["ppt"],
        instruction: "Use preview then export.",
        toolIds: ["preview_ppt_deck", "export_ppt_deck"],
        mcpServerIds: [],
        version: "1",
      },
    ],
    skillsEnabled: true,
    enabledToolNames: null,
    pptBriefState: {
      topic: "帮我做一个 PPT",
      audience: null,
      goal: null,
      scenario: null,
      language: "zh-CN",
      pageCount: null,
      tone: null,
      mustInclude: [],
      missingFields: ["audience", "goal", "scenario"],
      readyForPreview: false,
      suggestedValues: {
        audience: "管理层汇报",
        goal: "业务表达与结构化汇报",
        scenario: "marketing-campaign",
        language: "zh-CN",
        pageCount: 10,
        tone: "简洁、专业、决策导向",
      },
    },
    auditContext: {
      traceId: "trace-5",
      conversationId: "conv-5",
      agentId: "executive-ppt",
    },
  })

  const tools = result.selectedTools as unknown as Record<
    string,
    { execute: (input: Record<string, unknown>) => Promise<Record<string, unknown>> }
  >
  const previewResult = await tools.preview_ppt_deck.execute({
    prompt: "帮我做一个 PPT",
  })

  assert.equal(previewInput, null)
  assert.equal(previewResult.ok, false)
  assert.deepEqual(previewResult.error, {
    code: "ppt_brief_incomplete",
    message: "PPT brief is incomplete. Confirm the missing brief fields before generating the deck.",
  })
})

test("tool registry auto-selects the top recommended template for executive-ppt background previews", async () => {
  const result = await buildAiEntryToolRegistry({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
    policy: {
      agentId: "executive-ppt",
      allowedSkillIds: ["ppt-master"],
      allowedToolIds: ["preview_ppt_deck"],
      allowedMcpServerIds: [],
      maxToolCalls: 4,
      maxRuntimeMs: 30_000,
      canCreateArtifacts: true,
      approvalRequiredToolIds: [],
    },
    selectedSkills: [
      {
        id: "ppt-master",
        name: "PPT Master",
        description: "PPT",
        type: "tool",
        triggerHints: ["ppt"],
        instruction: "Preview directly unless the user explicitly selects a template.",
        toolIds: ["preview_ppt_deck"],
        mcpServerIds: [],
        version: "1",
      },
    ],
    skillsEnabled: true,
    enabledToolNames: null,
    latestUserPrompt: "继续，生成可编辑 PPT 预览。",
    pptBriefState: {
      topic: "董事会经营复盘",
      audience: "管理层汇报",
      goal: "经营汇报与决策同步",
      scenario: "sales-deck",
      language: "zh-CN",
      pageCount: 10,
      tone: "简洁、专业、决策导向",
      mustInclude: [],
      missingFields: [],
      readyForPreview: true,
      suggestedValues: {
        audience: "管理层汇报",
        goal: "经营汇报与决策同步",
        scenario: "sales-deck",
        language: "zh-CN",
        pageCount: 10,
        tone: "简洁、专业、决策导向",
      },
    },
    messageContents: [],
    auditContext: {
      traceId: "trace-template-required",
      conversationId: "conv-template-required",
      agentId: "executive-ppt",
    },
  })

  const tools = result.selectedTools as unknown as Record<
    string,
    { execute: (input: Record<string, unknown>) => Promise<Record<string, unknown>> }
  >
  const previewResult = await tools.preview_ppt_deck.execute({
    prompt: "继续，生成可编辑 PPT 预览。",
  })

  assert.equal(previewResult.ok, true)
  assert.equal(previewInput, null)
  assert.equal(enqueuedTasks.length, 1)
  assert.equal(
    (enqueuedTasks[0]?.payload?.input as { templateMode?: string } | undefined)?.templateMode,
    "single-template",
  )
  assert.equal(
    (enqueuedTasks[0]?.payload?.input as { templateId?: string } | undefined)?.templateId,
    "cangzhuo",
  )
})

test("tool registry strips model-supplied template ids when the user did not explicitly choose one", async () => {
  const result = await buildAiEntryToolRegistry({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
    policy: {
      agentId: "executive-ppt",
      allowedSkillIds: ["ppt-master"],
      allowedToolIds: ["preview_ppt_deck"],
      allowedMcpServerIds: [],
      maxToolCalls: 4,
      maxRuntimeMs: 30_000,
      canCreateArtifacts: true,
      approvalRequiredToolIds: [],
    },
    selectedSkills: [
      {
        id: "ppt-master",
        name: "PPT Master",
        description: "PPT",
        type: "tool",
        triggerHints: ["ppt"],
        instruction: "Preview directly unless the user explicitly selects a template.",
        toolIds: ["preview_ppt_deck"],
        mcpServerIds: [],
        version: "1",
      },
    ],
    skillsEnabled: true,
    enabledToolNames: null,
    latestUserPrompt: "可以",
    pptBriefState: {
      topic: "克里米亚现状军事分析",
      audience: "初级军事爱好者",
      goal: "课堂讲解",
      scenario: "training",
      language: "zh-CN",
      pageCount: 12,
      tone: "简洁、专业、结构化",
      mustInclude: [],
      missingFields: [],
      readyForPreview: true,
      suggestedValues: {
        audience: "初级军事爱好者",
        goal: "课堂讲解",
        scenario: "training",
        language: "zh-CN",
        pageCount: 12,
        tone: "简洁、专业、结构化",
      },
    },
    messageContents: [],
    auditContext: {
      traceId: "trace-model-template-ignored",
      conversationId: "conv-model-template-ignored",
      agentId: "executive-ppt",
    },
  })

  const tools = result.selectedTools as unknown as Record<
    string,
    { execute: (input: Record<string, unknown>) => Promise<Record<string, unknown>> }
  >
  const previewResult = await tools.preview_ppt_deck.execute({
    prompt: "可以",
    templateMode: "auto-4",
    templateId: "neo-grid-bold",
  })

  assert.equal(previewResult.ok, true)
  assert.equal(enqueuedTasks.length, 1)
  assert.equal(previewInput, null)
  assert.equal(
    (enqueuedTasks[0]?.payload?.input as { templateMode?: string } | undefined)?.templateMode,
    "single-template",
  )
  assert.equal(
    (enqueuedTasks[0]?.payload?.input as { templateId?: string } | undefined)?.templateId,
    "aurora-glass",
  )
})

test("tool registry injects the user-selected recommended template into editable ppt preview", async () => {
  const result = await buildAiEntryToolRegistry({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
    policy: {
      agentId: "executive-ppt",
      allowedSkillIds: ["ppt-master"],
      allowedToolIds: ["preview_ppt_deck"],
      allowedMcpServerIds: [],
      maxToolCalls: 4,
      maxRuntimeMs: 30_000,
      canCreateArtifacts: true,
      approvalRequiredToolIds: [],
    },
    selectedSkills: [
      {
        id: "ppt-master",
        name: "PPT Master",
        description: "PPT",
        type: "tool",
        triggerHints: ["ppt"],
        instruction: "Recommend templates first, then preview after selection.",
        toolIds: ["preview_ppt_deck"],
        mcpServerIds: [],
        version: "1",
      },
    ],
    skillsEnabled: true,
    enabledToolNames: null,
    latestUserPrompt: "用第2个模板生成可编辑 PPT 预览。",
    pptBriefState: {
      topic: "董事会经营复盘",
      audience: "管理层汇报",
      goal: "经营汇报与决策同步",
      scenario: "sales-deck",
      language: "zh-CN",
      pageCount: 10,
      tone: "简洁、专业、决策导向",
      mustInclude: [],
      missingFields: [],
      readyForPreview: true,
      suggestedValues: {
        audience: "管理层汇报",
        goal: "经营汇报与决策同步",
        scenario: "sales-deck",
        language: "zh-CN",
        pageCount: 10,
        tone: "简洁、专业、决策导向",
      },
    },
    messageContents: [
      "<!-- ai-entry-ppt-template-recommendations:{\"defaultTemplateId\":\"long-table\",\"templateIds\":[\"long-table\",\"neo-grid-bold\",\"broadside\",\"playful\"]} -->",
    ],
    auditContext: {
      traceId: "trace-template-picked",
      conversationId: "conv-template-picked",
      agentId: "executive-ppt",
    },
  })

  const tools = result.selectedTools as unknown as Record<
    string,
    { execute: (input: Record<string, unknown>) => Promise<Record<string, unknown>> }
  >
  const previewResult = await tools.preview_ppt_deck.execute({
    prompt: "用第2个模板生成可编辑 PPT 预览。",
    templateMode: "single-template",
    templateId: "neo-grid-bold",
  })

  assert.equal(previewResult.ok, true)
  assert.equal(enqueuedTasks.length, 1)
  assert.equal(
    (enqueuedTasks[0]?.payload?.input as { templateMode?: string } | undefined)?.templateMode,
    "single-template",
  )
  assert.equal(
    (enqueuedTasks[0]?.payload?.input as { templateId?: string } | undefined)?.templateId,
    "neo-grid-bold",
  )
})

test("tool registry accepts a direct template id reply before a persisted recommendation marker exists", async () => {
  const result = await buildAiEntryToolRegistry({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
    policy: {
      agentId: "executive-ppt",
      allowedSkillIds: ["ppt-master"],
      allowedToolIds: ["preview_ppt_deck"],
      allowedMcpServerIds: [],
      maxToolCalls: 4,
      maxRuntimeMs: 30_000,
      canCreateArtifacts: true,
      approvalRequiredToolIds: [],
    },
    selectedSkills: [
      {
        id: "ppt-master",
        name: "PPT Master",
        description: "PPT",
        type: "tool",
        triggerHints: ["ppt"],
        instruction: "Recommend templates first, then preview after selection.",
        toolIds: ["preview_ppt_deck"],
        mcpServerIds: [],
        version: "1",
      },
    ],
    skillsEnabled: true,
    enabledToolNames: null,
    latestUserPrompt: "swiss-grid",
    pptBriefState: {
      topic: "企业AI营销工作台",
      audience: "管理层",
      goal: "帮助管理层快速理解产品价值和落地路径",
      scenario: "product-launch",
      language: "zh-CN",
      pageCount: 4,
      tone: "简洁、专业、决策导向",
      mustInclude: [],
      missingFields: [],
      readyForPreview: true,
      suggestedValues: {
        audience: "管理层",
        goal: "帮助管理层快速理解产品价值和落地路径",
        scenario: "product-launch",
        language: "zh-CN",
        pageCount: 4,
        tone: "简洁、专业、决策导向",
      },
    },
    messageContents: [
      "推荐模板方向：方案 A / 方案 B / 方案 C。确认模板方向后，我立刻生成预览。",
    ],
    auditContext: {
      traceId: "trace-direct-template-before-marker",
      conversationId: "conv-direct-template-before-marker",
      agentId: "executive-ppt",
    },
  })

  const tools = result.selectedTools as unknown as Record<
    string,
    { execute: (input: Record<string, unknown>) => Promise<Record<string, unknown>> }
  >
  const previewResult = await tools.preview_ppt_deck.execute({
    prompt: "企业AI营销工作台",
  })

  assert.equal(previewResult.ok, true)
  assert.equal(enqueuedTasks.length, 1)
  assert.equal(
    (enqueuedTasks[0]?.payload?.input as { templateMode?: string } | undefined)?.templateMode,
    "single-template",
  )
  assert.equal(
    (enqueuedTasks[0]?.payload?.input as { templateId?: string } | undefined)?.templateId,
    "swiss-grid",
  )
})

test("tool registry injects latest user prompt as sourcePrompt for executive-ppt preview tasks", async () => {
  const result = await buildAiEntryToolRegistry({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
    policy: {
      agentId: "executive-ppt",
      allowedSkillIds: ["ppt-master"],
      allowedToolIds: ["preview_ppt_deck"],
      allowedMcpServerIds: [],
      maxToolCalls: 4,
      maxRuntimeMs: 30_000,
      canCreateArtifacts: true,
      approvalRequiredToolIds: [],
    },
    selectedSkills: [
      {
        id: "ppt-master",
        name: "PPT Master",
        description: "PPT",
        type: "tool",
        triggerHints: ["ppt"],
        instruction: "Preview directly.",
        toolIds: ["preview_ppt_deck"],
        mcpServerIds: [],
        version: "1",
      },
    ],
    skillsEnabled: true,
    enabledToolNames: null,
    latestUserPrompt:
      "请生成一份董事会经营复盘与风险诊断汇报 PPT。受众是董事会和管理层，目标是经营汇报与决策同步，场景是 sales-deck，语言是中文，10 页。",
    pptBriefState: {
      topic: "董事会经营复盘与风险诊断汇报 PPT",
      audience: "董事会和管理层",
      goal: "经营汇报与决策同步",
      scenario: "sales-deck",
      language: "zh-CN",
      pageCount: 10,
      tone: "简洁、专业、决策导向",
      mustInclude: [],
      missingFields: [],
      readyForPreview: true,
      suggestedValues: {
        audience: "董事会和管理层",
        goal: "经营汇报与决策同步",
        scenario: "sales-deck",
        language: "zh-CN",
        pageCount: 10,
        tone: "简洁、专业、决策导向",
      },
    },
    messageContents: [],
    auditContext: {
      traceId: "trace-source-prompt",
      conversationId: "conv-source-prompt",
      agentId: "executive-ppt",
    },
  })

  const tools = result.selectedTools as unknown as Record<
    string,
    { execute: (input: Record<string, unknown>) => Promise<Record<string, unknown>> }
  >
  const previewResult = await tools.preview_ppt_deck.execute({
    prompt: [
      "请生成董事会经营复盘与风险诊断汇报。",
      "关键风险诊断（外部） —— 市场、竞争、政策",
    ].join("\n"),
  })

  assert.equal(previewResult.ok, true)
  assert.equal(enqueuedTasks.length, 1)
  assert.equal(
    (enqueuedTasks[0]?.payload?.input as { sourcePrompt?: string } | undefined)?.sourcePrompt,
    "请生成一份董事会经营复盘与风险诊断汇报 PPT。受众是董事会和管理层，目标是经营汇报与决策同步，场景是 sales-deck，语言是中文，10 页。",
  )
})

test("tool registry honors an explicit empty allowlist and does not auto-add web_search", async () => {
  const result = await buildAiEntryToolRegistry({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
    policy: {
      agentId: "general",
      allowedSkillIds: ["ppt-master"],
      allowedToolIds: ["web_search", "preview_ppt_deck", "export_ppt_deck"],
      allowedMcpServerIds: [],
      maxToolCalls: 4,
      maxRuntimeMs: 30_000,
      canCreateArtifacts: true,
      approvalRequiredToolIds: [],
    },
    selectedSkills: [
      {
        id: "ppt-master",
        name: "PPT Master",
        description: "PPT",
        type: "tool",
        triggerHints: ["ppt"],
        instruction: "Use web_search before preview when facts matter, then preview and export.",
        toolIds: ["web_search", "preview_ppt_deck", "export_ppt_deck"],
        mcpServerIds: [],
        version: "1",
      },
    ],
    skillsEnabled: true,
    enabledToolNames: [],
    auditContext: {
      traceId: "trace-4",
      conversationId: "conv-4",
      agentId: "general",
    },
  })

  assert.deepEqual(result.selectedToolIds, [])
})
