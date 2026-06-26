import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let finalizeCalls = 0
let releaseCalls = 0
let toolRegistryWarnings: string[] = []
let toolRegistryToolIds: string[] = []
let emitArtifactFlow = false

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "next/server") {
    return {
      NextResponse: {
        json: (body: unknown, init?: { status?: number }) => ({
          status: init?.status || 200,
          body,
        }),
      },
    }
  }

  if (request === "ai") {
    return {
      stepCountIs: (count: number) => count,
    }
  }

  if (request === "@/lib/auth/guards") {
    return {
      requireSessionUser: async () => ({
        user: {
          id: 7,
          email: "user@example.com",
          isDemo: false,
          enterpriseId: 3,
          enterpriseName: "Acme",
          enterpriseRole: "admin",
          enterpriseStatus: "active",
        },
      }),
    }
  }

  if (request === "@/lib/auth/session") {
    return {
      isSessionDbUnavailableError: () => false,
    }
  }

  if (request === "@/lib/ai-entry/repository") {
    return {
      ensureAiEntryConversation: async () => ({ id: "conv-1" }),
      appendAiEntryTurn: async () => {},
    }
  }

  if (request === "@/lib/ai-entry/provider-routing") {
    return {}
  }

  if (request === "@/lib/ai-entry/agent-catalog") {
    return {
      isAiEntryAgentId: (value: string | null | undefined) => typeof value === "string" && value.length > 0,
    }
  }

  if (request === "@/lib/ai-entry/model-policy") {
    return {
      AI_ENTRY_CONSULTING_QUALITY_MODEL_HINT: "gpt-5.4",
      pickConsultingModelId: () => "gpt-5.4",
      resolveConsultingModelMode: () => "quality",
      shouldLockConsultingAdvisorModel: () => false,
    }
  }

  if (request === "@/lib/ai-entry/model-id-registry") {
    return {
      resolveEquivalentModelId: (value: string | null | undefined) => value,
    }
  }

  if (request === "@/lib/ai-entry/model-selection") {
    return {
      parseAiEntryModelSelection: () => null,
      serializeAiEntryModelSelection: ({ providerId, modelId }: { providerId: string; modelId: string }) => `${providerId}::${modelId}`,
    }
  }

  if (request === "@/lib/ai-entry/chat-policy") {
    return {
      getAiEntryWebSearchSystemRule: () => "",
      shouldQueryAiEntryEnterpriseKnowledge: () => false,
    }
  }

  if (request === "@/lib/ai-entry/identity") {
    return {
      normalizeAiEntryIdentity: (text: string) => text,
    }
  }

  if (request === "@/lib/knowledge/service") {
    return {
      loadEnterpriseKnowledgeContext: async () => null,
    }
  }

  if (request === "@/lib/platform/shared-credits-policy") {
    return {
      hasCustomAiChatModelSelection: () => false,
    }
  }

  if (request === "@/lib/ai-entry/chat-attachments") {
    return {
      normalizeAttachmentList: () => [],
      normalizeMessages: (messages: Array<{ role: string; content: string }>) => messages,
    }
  }

  if (request === "@/lib/ai-entry/language-policy") {
    return {
      resolveForcedReplyLanguage: () => null,
    }
  }

  if (request === "@/lib/ai-entry/ppt-tool-result-message") {
    return {
      buildPptToolResultMessage: () => null,
      stripPptArtifactRelativeLinks: (value: string) => value,
    }
  }

  if (request === "@/lib/skills/runtime/ai-entry-consulting") {
    return {
      prepareAiEntryConsultingRuntime: async (input: { requestedAgentId?: string | null }) => ({
        effectiveAgentId: input.requestedAgentId || "general",
        routeDecision: null,
        skillRouteDecision: emitArtifactFlow
          ? {
              selectedSkillIds: ["ppt-master"],
              reasons: [{ skillId: "ppt-master", reason: "ppt_intent" }],
            }
          : null,
        selectedSkills: emitArtifactFlow
          ? [
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
            ]
          : [],
        selectedSkillIds: emitArtifactFlow ? ["ppt-master"] : [],
        runtimePolicy: {
          agentId: input.requestedAgentId || "general",
          allowedSkillIds: ["ppt-master"],
          allowedToolIds: ["web_search", "preview_ppt_deck", "export_ppt_deck"],
          allowedMcpServerIds: [],
          maxToolCalls: 8,
          maxRuntimeMs: 60_000,
          canCreateArtifacts: true,
          approvalRequiredToolIds: [],
        },
        resolvedInstruction: emitArtifactFlow
          ? "# Routed Skills\n\nUse web_search before preview when factual evidence is needed, then use PPT tools."
          : "",
      }),
    }
  }

  if (request === "@/lib/ai-entry/tool-registry") {
    return {
      buildAiEntryToolRegistry: async () => ({
        selectedTools: {},
        selectedToolIds: toolRegistryToolIds,
        closeTools: null,
        toolLoadWarnings: toolRegistryWarnings,
        selectedMcpServerIds: [],
      }),
    }
  }

  if (request === "@/lib/skills/runtime/ai-entry-executor") {
    return {
      runAiEntryConsultingStreaming: async (input: {
        onProviderSelected?: (payload: Record<string, unknown>) => void
        onTextDelta?: (delta: string) => void
        onToolCall?: (payload: Record<string, unknown>) => void
        onToolResult?: (payload: Record<string, unknown>) => void
      }) => {
        input.onProviderSelected?.({
          providerId: "pptoken",
          model: "gpt-5.4",
          attempt: 1,
          providerOrder: ["pptoken"],
          upgradeProbe: false,
        })
        if (emitArtifactFlow) {
          input.onToolCall?.({
            toolName: "export_ppt_deck",
            toolCallId: "tool-1",
            args: {
              previewSessionId: "preview-session-1",
              selectedVariantKey: "variant-a",
            },
          })
          input.onToolResult?.({
            toolName: "export_ppt_deck",
            toolCallId: "tool-1",
            result: {
              ok: true,
              title: "AI Marketing Workbench",
              fileName: "ai-marketing-workbench.pptx",
              contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
              artifactId: 401,
              toolRunId: 301,
              downloadUrl: "/api/platform/artifacts/401/download?download=1",
              artifact: {
                kind: "pptx",
                title: "AI Marketing Workbench",
                fileName: "ai-marketing-workbench.pptx",
                artifactId: 401,
                downloadUrl: "/api/platform/artifacts/401/download?download=1",
              },
              validation: {
                ok: true,
                checks: [
                  {
                    code: "mime_is_pptx",
                    ok: true,
                    message: "Exported artifact MIME type is PPTX.",
                  },
                ],
              },
            },
          })
        }
        input.onTextDelta?.(emitArtifactFlow ? "PPT ready." : "Normal chat reply.")
        return {
          result: {
            accumulated: emitArtifactFlow ? "PPT ready." : "Normal chat reply.",
          },
          providerId: "pptoken",
          model: "gpt-5.4",
          providerOrder: ["pptoken"],
        }
      },
      runAiEntryConsultingBlocking: async () => {
        throw new Error("blocking_not_used_in_test")
      },
    }
  }

  if (request === "@/lib/billing/costing") {
    return {
      estimateTextCredits: () => ({
        credits: 10,
        officialCostUsd: 0.01,
        costBasisUsd: 0.01,
        metadata: {},
      }),
    }
  }

  if (request === "@/lib/billing/runtime") {
    return {
      reserveFeatureCredits: async () => ({ amount: 10 }),
      finalizeReservedCredits: async () => {
        finalizeCalls += 1
      },
      releaseReservedCredits: async () => {
        releaseCalls += 1
      },
    }
  }

  if (request === "@/lib/platform/model-governance") {
    return {
      getGovernedAiEntryModelCatalogForUser: async () => ({
        models: [
          {
            id: "pptoken::gpt-5.4",
            modelId: "gpt-5.4",
            runtimeId: "gpt-5.4",
            providerId: "pptoken",
          },
        ],
        selectedModelId: "pptoken::gpt-5.4",
        providerId: "pptoken",
      }),
    }
  }

  if (request === "@/lib/platform/enterprise-runtime-config") {
    return {
      getEnterpriseTextRuntimeProviderConfigsForUser: async () => null,
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let POST: (request: { json: () => Promise<Record<string, unknown>>; nextUrl: { origin: string } }) => Promise<Response>

test.before(async () => {
  const route = await import("./route")
  POST = route.POST as typeof POST
})

test.beforeEach(() => {
  finalizeCalls = 0
  releaseCalls = 0
  toolRegistryWarnings = []
  toolRegistryToolIds = []
  emitArtifactFlow = false
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("ai chat route keeps ordinary streaming chat working even when MCP tool loading fails", async () => {
  toolRegistryWarnings = ["mcp_server_load_failed:mcp-sse-1:boom"]

  const response = await POST({
    json: async () => ({
      messages: [{ role: "user", content: "你好，帮我总结今天该做什么。" }],
      stream: true,
    }),
    nextUrl: { origin: "https://example.com" },
  })

  assert.equal(response.headers.get("Content-Type"), "text/event-stream; charset=utf-8")
  const text = await response.text()
  assert.match(text, /conversation_init/)
  assert.match(text, /message_end/)
  assert.match(text, /Normal chat reply\./)
  assert.equal(finalizeCalls, 1)
  assert.equal(releaseCalls, 0)
})

test("ai chat route preserves business-agent streaming and emits artifact-created for PPT export flow", async () => {
  emitArtifactFlow = true
  toolRegistryToolIds = ["preview_ppt_deck", "export_ppt_deck"]

  const response = await POST({
    json: async () => ({
      messages: [{ role: "user", content: "帮我做一份汇报 PPT，并导出可下载的 PPTX。" }],
      stream: true,
      agentConfig: {
        agentId: "business-brand-creative",
      },
    }),
    nextUrl: { origin: "https://example.com" },
  })

  assert.equal(response.headers.get("Content-Type"), "text/event-stream; charset=utf-8")
  const text = await response.text()
  assert.match(text, /"event":"skill_selected"/)
  assert.match(text, /"event":"tool_call_start"/)
  assert.match(text, /"event":"validation_result"/)
  assert.match(text, /"event":"artifact_created"/)
  assert.match(text, /ai-marketing-workbench\.pptx/)
  assert.match(text, /message_end/)
  assert.equal(finalizeCalls, 1)
  assert.equal(releaseCalls, 0)
})
