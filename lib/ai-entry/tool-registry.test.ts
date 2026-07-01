import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load
let previewInput: Record<string, unknown> | null = null
let webSearchResult: Record<string, unknown> = { ok: true }

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
            return { ok: true }
          },
        },
        export_ppt_deck: {
          description: "Export deck",
          inputSchema: {},
          execute: async () => ({ ok: true }),
        },
      }),
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
  webSearchResult = { ok: true }
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
