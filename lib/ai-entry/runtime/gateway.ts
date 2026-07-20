import type { RuntimeGatewayDecision, WorkflowContext } from "@/lib/ai-runtime/contracts"
import { isBusinessAgentId, resolveBusinessAgentRailwayRuntimeProfile, resolveDashiPptCloudflareRuntimeProfile, resolveDefaultAgentRuntimeProfile, resolveEditablePptRailwayRuntimeProfile, isAiEntryOpenCodeContextEnabled, isAiEntryOpenCodeFixedToolGuardEnabled } from "./profile-store"

const FIXED_NATIVE_TOOL_IDS = new Set([
  "preview_ppt_deck",
  "export_ppt_deck",
  "update_ppt_brief",
  "recommend_ppt_templates",
  "image_generate",
  "image_edit",
  "knowledge_write",
  "knowledge_save",
])

const EDITABLE_PPT_OPENCODE_TOOL_IDS = new Set([
  "preview_ppt_deck",
  "export_ppt_deck",
  "update_ppt_brief",
  "recommend_ppt_templates",
])

const FRESH_EVIDENCE_PATTERN = /(?:web_search|联网|网上|在线搜索|检索|查找资料|最新|实时|当前行情|市场研究|竞品研究|外部证据|引用来源|research|current|latest|real[- ]time|search the web)/iu

export type AiEntryRuntimeGatewayInput = {
  latestUserPrompt: string
  agentId?: string | null
  selectedSkillIds?: string[]
  selectedToolIds: string[]
  selectedMcpServerIds?: string[]
  enabledToolNames?: string[] | null
  executionContext?: "chat" | "workflow"
  workflowContext?: WorkflowContext | null
  requiresNativeAttachment?: boolean
}

function nativeToolIds(input: AiEntryRuntimeGatewayInput) {
  const selected = new Set(input.selectedToolIds)
  const explicit = new Set(input.enabledToolNames || [])
  const required = [...selected].filter((toolId) => FIXED_NATIVE_TOOL_IDS.has(toolId) || toolId.startsWith("mcp:"))
  if ((input.selectedMcpServerIds || []).length > 0) required.push("mcp")
  if (input.requiresNativeAttachment) required.push("attachment")
  const dashiPresentationContext = input.agentId === "executive-presentation-ppt" || (input.selectedSkillIds || []).includes("dashiai-ppt")
  if (!dashiPresentationContext && (explicit.has("web_search") || FRESH_EVIDENCE_PATTERN.test(input.latestUserPrompt))) required.push("web_search")
  return [...new Set(required)]
}

export function resolveAiEntryRuntimeDecision(input: AiEntryRuntimeGatewayInput): RuntimeGatewayDecision {
  const workflow = input.workflowContext || null
  if (workflow?.status === "waiting_for_input") {
    return {
      kind: "workflow-continuation",
      workflowRunId: workflow.workflowRunId,
      allowedUserActions: workflow.allowedUserActions,
      reason: "active workflow is waiting for platform-owned user input",
    }
  }

  if (input.executionContext === "workflow") {
    return {
      kind: "native-tool",
      requiredToolIds: ["workflow"],
      reason: "workflow execution remains platform-owned in the SaaS MVP",
    }
  }

  const editablePptContext = input.agentId === "executive-ppt" || (input.selectedSkillIds || []).includes("ppt-master")
  const dashiPresentationContext = input.agentId === "executive-presentation-ppt" || (input.selectedSkillIds || []).includes("dashiai-ppt")
  const businessAgentContext = isBusinessAgentId(input.agentId)
  // A plain AI Chat request must remain in the app's native AI SDK path. It
  // has no persistent Agent workspace and should never cold-start a container.
  if (!businessAgentContext && !editablePptContext && !dashiPresentationContext) {
    const requiredToolIds = nativeToolIds(input)
    if (requiredToolIds.length > 0) {
      return { kind: "native-tool", requiredToolIds, reason: "request requires a platform-owned tool" }
    }
    return { kind: "ai-sdk-native", reason: "ordinary AI Chat is platform-owned and does not use OpenCode" }
  }
  const profile = resolveDefaultAgentRuntimeProfile()
  const dashiCloudflareProfile = dashiPresentationContext
    ? resolveDashiPptCloudflareRuntimeProfile()
    : null
  const pptRailwayProfile = editablePptContext
    ? resolveEditablePptRailwayRuntimeProfile()
    : null
  const businessRailwayProfile = businessAgentContext ? resolveBusinessAgentRailwayRuntimeProfile() : null
  const activeProfile = businessRailwayProfile || dashiCloudflareProfile || (pptRailwayProfile?.enabled ? pptRailwayProfile : profile)
  if (businessAgentContext && !businessRailwayProfile?.enabled) {
    return { kind: "opencode-chat", backend: "railway-opencode", reason: "business Agent requires the Railway persistent runtime" }
  }
  if (!activeProfile.enabled || !isAiEntryOpenCodeContextEnabled()) {
    return { kind: "ai-sdk-native", reason: "OpenCode SaaS runtime is disabled or not configured" }
  }

  const fixedToolGuardEnabled = isAiEntryOpenCodeFixedToolGuardEnabled()
  // Editable PPT is fully owned by OpenCode + native ppt-master. Never let
  // platform tool selections or keyword gates route this context back to the
  // custom preview/export tool registry.
  const requiredToolIds = editablePptContext ? [] : nativeToolIds(input)
  const editablePptCanUseOpenCode =
    editablePptContext &&
    requiredToolIds.length > 0 &&
    requiredToolIds.every((toolId) => EDITABLE_PPT_OPENCODE_TOOL_IDS.has(toolId))
  if (fixedToolGuardEnabled && requiredToolIds.length > 0 && !editablePptCanUseOpenCode) {
    return {
      kind: "native-tool",
      requiredToolIds,
      reason: "request requires a platform-owned tool",
    }
  }

  return {
    kind: "opencode-chat",
    backend: dashiPresentationContext ? "cloudflare-opencode-session" : "railway-opencode",
    reason: dashiPresentationContext
      ? "speaker-style PPT is owned by the OpenCode-native Dashi AI PPT skill"
      : editablePptCanUseOpenCode
      ? "editable PPT is owned by the OpenCode ppt-master skill"
      : "ordinary SaaS chat is eligible for stateless OpenCode execution",
  }
}
