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
let toolRegistryToolChoice: Record<string, unknown> | undefined
let emitArtifactFlow = false
let emitToolFailureFlow = false
let emitPreviewSelectionRequiredFlow = false
let emitQueuedPreviewFlow = false
let emitClosedControllerErrorFlow = false
let lastStreamingSystemPrompt = ""
let lastStreamingToolChoice: Record<string, unknown> | undefined
let customAgentExecutionMode: "direct_agent" | "workflow_backed" = "direct_agent"
let customAgentStatus: "published" | "disabled" | "archived" | "draft" = "published"
let ensureConversationArgs:
  | {
      fallbackTitle?: string
      agentId?: string | null
    }
  | null = null
let appendMessageCalls: Array<{
  agentId?: string | null
  role?: "user" | "assistant"
  content?: string
}> = []

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
      ensureAiEntryConversation: async (
        _userId: number,
        _conversationId: string | null | undefined,
        fallbackTitle?: string,
        _currentModelId?: string | null,
        _scope?: string,
        agentId?: string | null,
      ) => {
        ensureConversationArgs = {
          fallbackTitle,
          agentId,
        }
        return { id: "conv-1" }
      },
      appendAiEntryMessage: async (input: {
        agentId?: string | null
        role?: "user" | "assistant"
        content?: string
      }) => {
        appendMessageCalls.push(input)
      },
    }
  }

  if (request === "@/lib/ai-entry/provider-routing") {
    return {}
  }

  if (request === "@/lib/ai-entry/agent-catalog") {
    return {
      isAiEntryAgentId: (value: string | null | undefined) =>
        typeof value === "string" &&
        (value === "general" || value.startsWith("business-") || value.startsWith("executive-")),
    }
  }

  if (request === "@/lib/platform/custom-agent-runtime-id") {
    return {
      parseCustomAgentRuntimeId: (value: string | null | undefined) => {
        if (typeof value !== "string" || !value.startsWith("custom-agent:")) return null
        const numeric = Number(value.slice("custom-agent:".length))
        return Number.isInteger(numeric) && numeric > 0 ? numeric : null
      },
    }
  }

  if (request === "@/lib/platform/custom-agents") {
    return {
      getCustomAgentForUser: async ({ agentId }: { agentId: number }) => ({
        id: agentId,
        name: "Revenue Ops Copilot",
        summary: "Turn business requests into practical GTM actions.",
        goal: "Improve pipeline execution quality",
        scope: "Business workbench direct chat",
        guardrails: "Keep outputs concrete and execution-ready.",
        systemPromptSummary: "Revenue-oriented execution copilot",
        systemPrompt: "Bias toward concrete steps, owners, and deliverables.",
        status: customAgentStatus,
        executionMode: customAgentExecutionMode,
      }),
    }
  }

  if (request === "@/lib/ai-entry/model-policy") {
    return {
      AI_ENTRY_CONSULTING_QUALITY_MODEL_HINT: "gpt-5.4",
      isAiEntryPptAgentId: (value: string | null | undefined) =>
        value === "executive-ppt" || value === "executive-presentation-ppt",
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
      buildPptTemplateRecommendationMessage: () => null,
      buildPptToolResultMessage: () => null,
      extractLatestPptTemplateRecommendationContext: () => null,
      resolvePptTemplateSelectionFromUserText: () => null,
      resolveLatestPptConversationState: () => ({
        latestPreview: null,
        latestExport: null,
        phase: "idle",
      }),
      stripPptArtifactRelativeLinks: (value: string) => value,
    }
  }

  if (request === "@/lib/ai-entry/ppt-auto-preview") {
    return {
      maybeAutoRunPptPreview: async (input: { assistantMessage?: string }) => ({
        assistantMessage: input.assistantMessage || "",
        autoPreviewExecuted: false,
        previewResult: null,
      }),
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
        toolChoice: toolRegistryToolChoice,
        closeTools: null,
        toolLoadWarnings: toolRegistryWarnings,
        selectedMcpServerIds: [],
      }),
    }
  }

  if (request === "@/lib/skills/runtime/ai-entry-executor") {
    return {
      runAiEntryConsultingStreaming: async (input: {
        systemPrompt?: string
        toolChoice?: Record<string, unknown>
        onProviderSelected?: (payload: Record<string, unknown>) => void
        onTextDelta?: (delta: string) => void
        onToolCall?: (payload: Record<string, unknown>) => void
        onToolResult?: (payload: Record<string, unknown>) => void
      }) => {
        lastStreamingSystemPrompt = input.systemPrompt || ""
        lastStreamingToolChoice = input.toolChoice
        input.onProviderSelected?.({
          providerId: "pptoken",
          model: "gpt-5.4",
          attempt: 1,
          providerOrder: ["pptoken"],
          upgradeProbe: false,
        })
        if (emitClosedControllerErrorFlow) {
          throw new Error("Invalid state: Controller is already closed")
        }
        if (emitQueuedPreviewFlow) {
          input.onToolCall?.({
            toolName: "preview_ppt_deck",
            toolCallId: "tool-preview-queued-1",
            args: {
              prompt: "帮我生成董事会汇报预览",
            },
          })
          input.onToolResult?.({
            toolName: "preview_ppt_deck",
            toolCallId: "tool-preview-queued-1",
            result: {
              ok: true,
              status: "queued",
              message: "可编辑 PPT 已切换为后台生成，系统会继续轮询并在完成后回填预览结果。",
              backgroundTask: {
                taskId: "901",
                conversationId: "conv-1",
                toolName: "preview_ppt_deck",
                status: "queued",
              },
            },
          })
        } else if (emitPreviewSelectionRequiredFlow) {
          input.onToolCall?.({
            toolName: "preview_ppt_deck",
            toolCallId: "tool-preview-1",
            args: {
              prompt: "帮我做一份董事会汇报",
            },
          })
          input.onToolResult?.({
            toolName: "preview_ppt_deck",
            toolCallId: "tool-preview-1",
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
              ],
            },
          })
        } else if (emitToolFailureFlow) {
          input.onToolCall?.({
            toolName: "export_ppt_deck",
            toolCallId: "tool-fail-1",
            args: {
              previewSessionId: "preview-session-missing",
              selectedVariantKey: "variant-a",
            },
          })
          input.onToolResult?.({
            toolName: "export_ppt_deck",
            toolCallId: "tool-fail-1",
            result: {
              ok: false,
              error: {
                code: "missing_preview_session",
                message: "Preview session is no longer available. Generate the PPT preview again before export.",
              },
            },
          })
        } else if (emitArtifactFlow) {
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
        const accumulatedText = emitArtifactFlow
          ? "PPT ready."
          : emitQueuedPreviewFlow
            ? "我会先准备预览所需内容。"
          : emitPreviewSelectionRequiredFlow
            ? "请先选一个模板。"
          : emitToolFailureFlow
            ? ""
            : "Normal chat reply."
        if (accumulatedText) {
          input.onTextDelta?.(accumulatedText)
        }
        return {
          result: {
            accumulated: accumulatedText,
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
  toolRegistryToolChoice = undefined
  emitArtifactFlow = false
  emitToolFailureFlow = false
  emitPreviewSelectionRequiredFlow = false
  emitQueuedPreviewFlow = false
  emitClosedControllerErrorFlow = false
  lastStreamingSystemPrompt = ""
  lastStreamingToolChoice = undefined
  customAgentExecutionMode = "direct_agent"
  customAgentStatus = "published"
  ensureConversationArgs = null
  appendMessageCalls = []
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

test("ai chat route synthesizes a readable fallback when tools fail without any model text", async () => {
  emitToolFailureFlow = true
  toolRegistryToolIds = ["export_ppt_deck"]
  toolRegistryToolChoice = {
    type: "tool",
    toolName: "export_ppt_deck",
  }

  const response = await POST({
    json: async () => ({
      messages: [
        {
          role: "assistant",
          content:
            "已生成 PPT 预览：\n<!-- ai-entry-ppt-preview-context:{\"previewSessionId\":\"preview-session-missing\",\"defaultVariantKey\":\"variant-a\",\"variantKeys\":[\"variant-a\"]} -->",
        },
        { role: "user", content: "导出 Playful" },
      ],
      stream: true,
      agentConfig: {
        agentId: "executive-ppt",
      },
    }),
    nextUrl: { origin: "https://example.com" },
  })

  const text = await response.text()
  assert.match(text, /工具执行失败，当前还没有拿到可用结果/)
  assert.match(text, /export_ppt_deck/)
  assert.match(text, /Preview session is no longer available/)
})

test("ai chat route keeps preview template-selection in waiting state instead of emitting tool error completion", async () => {
  emitPreviewSelectionRequiredFlow = true
  toolRegistryToolIds = ["preview_ppt_deck"]
  toolRegistryToolChoice = {
    type: "tool",
    toolName: "preview_ppt_deck",
  }

  const response = await POST({
    json: async () => ({
      messages: [{ role: "user", content: "帮我生成一份给管理层看的产品发布董事会汇报 PPT 预览。" }],
      stream: true,
      agentConfig: {
        agentId: "executive-ppt",
      },
    }),
    nextUrl: { origin: "https://example.com" },
  })

  const text = await response.text()
  assert.match(text, /"event":"tool_result"/)
  assert.match(text, /ppt_template_selection_required/)
  assert.doesNotMatch(text, /"event":"tool_call_error".*"tool-preview-1"/)
  assert.doesNotMatch(text, /"event":"tool_call_done".*"tool-preview-1"/)
})

test("ai chat route does not persist queued background preview status as a second assistant artifact message", async () => {
  emitQueuedPreviewFlow = true
  toolRegistryToolIds = ["preview_ppt_deck"]
  toolRegistryToolChoice = {
    type: "tool",
    toolName: "preview_ppt_deck",
  }

  const response = await POST({
    json: async () => ({
      messages: [{ role: "user", content: "帮我先生成一个给管理层看的产品发布可编辑 PPT 预览。" }],
      stream: true,
      agentConfig: {
        agentId: "executive-ppt",
      },
    }),
    nextUrl: { origin: "https://example.com" },
  })

  const text = await response.text()
  assert.match(text, /"event":"tool_result"/)
  assert.match(text, /"taskId":"901"/)
  assert.ok(appendMessageCalls.at(-1))
  assert.equal(appendMessageCalls.at(-1)?.role, "assistant")
  assert.equal(appendMessageCalls.at(-1)?.content, "我会先准备预览所需内容。")
})

test("ai chat route does not force export toolChoice for ppt turns and lets model decide from context", async () => {
  toolRegistryToolIds = ["preview_ppt_deck", "export_ppt_deck"]
  toolRegistryToolChoice = undefined

  const response = await POST({
    json: async () => ({
      messages: [
        {
          role: "assistant",
          content:
            "已生成 PPT 预览：\n<!-- ai-entry-ppt-preview-context:{\"previewSessionId\":\"preview-session-1\",\"defaultVariantKey\":\"variant-a\",\"variantKeys\":[\"variant-a\",\"variant-b\"]} -->",
        },
        { role: "user", content: "导出 Playful" },
      ],
      stream: true,
      agentConfig: {
        agentId: "executive-ppt",
      },
    }),
    nextUrl: { origin: "https://example.com" },
  })

  assert.equal(response.headers.get("Content-Type"), "text/event-stream; charset=utf-8")
  await response.text()
  assert.equal(lastStreamingToolChoice, undefined)
})

test("ai chat route uses the first user prompt as conversation title fallback", async () => {
  const response = await POST({
    json: async () => ({
      messages: [{ role: "user", content: "帮我规划下个月的增长实验。" }],
      stream: true,
      agentConfig: {
        agentId: "executive-growth",
        agentName: "增长顾问",
        entryMode: "consulting-advisor",
      },
    }),
    nextUrl: { origin: "https://example.com" },
  })

  assert.equal(response.headers.get("Content-Type"), "text/event-stream; charset=utf-8")
  await response.text()
  assert.deepEqual(ensureConversationArgs, {
    fallbackTitle: "帮我规划下个月的增长实验。",
    agentId: "executive-growth",
  })
  assert.deepEqual(
    appendMessageCalls.map((call) => ({ role: call.role, agentId: call.agentId })),
    [
      { role: "user", agentId: "executive-growth" },
      { role: "assistant", agentId: "executive-growth" },
    ],
  )
})

test("ai chat route persists the user prompt before assistant completion", async () => {
  const response = await POST({
    json: async () => ({
      messages: [{ role: "user", content: "帮我生成一份给管理层看的产品发布董事会汇报 PPT。" }],
      stream: true,
      agentConfig: {
        agentId: "executive-ppt",
      },
    }),
    nextUrl: { origin: "https://example.com" },
  })

  assert.equal(response.headers.get("Content-Type"), "text/event-stream; charset=utf-8")
  await response.text()
  assert.deepEqual(
    appendMessageCalls.map((call) => ({
      role: call.role,
      content: call.content,
      agentId: call.agentId,
    })),
    [
      {
        role: "user",
        content: "帮我生成一份给管理层看的产品发布董事会汇报 PPT。",
        agentId: "executive-ppt",
      },
      {
        role: "assistant",
        content: "Normal chat reply.",
        agentId: "executive-ppt",
      },
    ],
  )
})

test("ai chat route asks follow-up questions and stops before preview when executive-ppt brief is incomplete", async () => {
  const response = await POST({
    json: async () => ({
      messages: [{ role: "user", content: "做一个克里米亚现状的ppt，10页，检索2026年最新的信息" }],
      stream: true,
      agentConfig: {
        agentId: "executive-ppt",
      },
    }),
    nextUrl: { origin: "https://example.com" },
  })

  assert.equal(response.headers.get("Content-Type"), "text/event-stream; charset=utf-8")
  const text = await response.text()
  assert.match(text, /还不能进入 PPT 预览/)
  assert.match(text, /这份 PPT 主要给谁看/)
  assert.match(text, /这次更接近哪种场景/)
  assert.doesNotMatch(text, /Normal chat reply\./)
  assert.doesNotMatch(text, /"event":"tool_call"/)
  assert.equal(appendMessageCalls[0]?.role, "user")
  assert.equal(appendMessageCalls[0]?.agentId, "executive-ppt")
  assert.equal(appendMessageCalls[0]?.content, "做一个克里米亚现状的ppt，10页，检索2026年最新的信息")
  assert.equal(appendMessageCalls[1]?.role, "assistant")
  assert.equal(appendMessageCalls[1]?.agentId, "executive-ppt")
  assert.match(appendMessageCalls[1]?.content || "", /我收到后会继续追问，直到 brief 完整再进入预览/)
  assert.equal(finalizeCalls, 0)
  assert.equal(releaseCalls, 0)
})

test("ai chat route does not persist closed stream transport errors as assistant replies", async () => {
  emitClosedControllerErrorFlow = true

  const response = await POST({
    json: async () => ({
      messages: [{ role: "user", content: "帮我生成一份给管理层看的产品发布董事会汇报 PPT。" }],
      stream: true,
      agentConfig: {
        agentId: "executive-ppt",
      },
    }),
    nextUrl: { origin: "https://example.com" },
  })

  assert.equal(response.headers.get("Content-Type"), "text/event-stream; charset=utf-8")
  const text = await response.text()
  assert.doesNotMatch(text, /Controller is already closed/)
  assert.deepEqual(
    appendMessageCalls.map((call) => ({
      role: call.role,
      content: call.content,
      agentId: call.agentId,
    })),
    [
      {
        role: "user",
        content: "帮我生成一份给管理层看的产品发布董事会汇报 PPT。",
        agentId: "executive-ppt",
      },
    ],
  )
  assert.equal(finalizeCalls, 0)
  assert.equal(releaseCalls, 1)
})

test("ai chat route skips ppt brief gating instructions for workflow execution context", async () => {
  const response = await POST({
    json: async () => ({
      messages: [{ role: "user", content: "做一份公司发布会 PPT" }],
      stream: true,
      executionContext: "workflow",
      agentConfig: {
        agentId: "executive-ppt",
      },
    }),
    nextUrl: { origin: "https://example.com" },
  })

  assert.equal(response.headers.get("Content-Type"), "text/event-stream; charset=utf-8")
  await response.text()
  assert.doesNotMatch(lastStreamingSystemPrompt, /## PPT brief state/)
  assert.doesNotMatch(lastStreamingSystemPrompt, /ask only 1 to 3 short confirmation questions/i)
})

test("ai chat route supports published direct custom agents in streaming chat", async () => {
  const response = await POST({
    json: async () => ({
      messages: [{ role: "user", content: "帮我整理本周销售推进动作。" }],
      stream: true,
      agentConfig: {
        agentId: "custom-agent:42",
      },
    }),
    nextUrl: { origin: "https://example.com" },
  })

  assert.equal(response.headers.get("Content-Type"), "text/event-stream; charset=utf-8")
  const text = await response.text()
  assert.match(text, /custom-agent:42/)
  assert.match(text, /Normal chat reply\./)
  assert.match(lastStreamingSystemPrompt, /Revenue Ops Copilot/)
  assert.match(lastStreamingSystemPrompt, /Improve pipeline execution quality/)
  assert.match(lastStreamingSystemPrompt, /Bias toward concrete steps, owners, and deliverables\./)
  assert.equal(finalizeCalls, 1)
  assert.equal(releaseCalls, 0)
})

test("ai chat route rejects workflow-backed custom agents in direct chat", async () => {
  customAgentExecutionMode = "workflow_backed"

  const response = await POST({
    json: async () => ({
      messages: [{ role: "user", content: "帮我推进销售漏斗。" }],
      stream: true,
      agentConfig: {
        agentId: "custom-agent:7",
      },
    }),
    nextUrl: { origin: "https://example.com" },
  })

  assert.equal((response as { status?: number }).status, 409)
  assert.deepEqual((response as { body?: unknown }).body, {
    error: "custom_agent_workflow_backed_chat_not_supported",
  })
  assert.equal(finalizeCalls, 0)
})

test("ai chat route rejects disabled custom agents before streaming starts", async () => {
  customAgentStatus = "disabled"

  const response = await POST({
    json: async () => ({
      messages: [{ role: "user", content: "帮我整理销售跟进动作。" }],
      stream: true,
      agentConfig: {
        agentId: "custom-agent:8",
      },
    }),
    nextUrl: { origin: "https://example.com" },
  })

  assert.equal((response as { status?: number }).status, 403)
  assert.deepEqual((response as { body?: unknown }).body, {
    error: "custom_agent_disabled",
  })
  assert.equal(finalizeCalls, 0)
})

test("ai chat route rejects archived custom agents before streaming starts", async () => {
  customAgentStatus = "archived"

  const response = await POST({
    json: async () => ({
      messages: [{ role: "user", content: "帮我整理销售跟进动作。" }],
      stream: true,
      agentConfig: {
        agentId: "custom-agent:9",
      },
    }),
    nextUrl: { origin: "https://example.com" },
  })

  assert.equal((response as { status?: number }).status, 403)
  assert.deepEqual((response as { body?: unknown }).body, {
    error: "custom_agent_archived",
  })
  assert.equal(finalizeCalls, 0)
})
