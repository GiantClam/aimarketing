import { createHash } from "node:crypto"
import type { AgentRuntimeInput, RuntimeProjectSnapshot, SharedSkillSetSelection, WorkflowContext } from "@/lib/ai-runtime/contracts"
import { runtimeArtifactExtensions } from "./artifact-policy"
import { isAiEntryOpenCodeArtifactContextEnabled } from "./profile-store"

export const DEFAULT_MAX_CONTEXT_CHARS = 60_000
export const DEFAULT_RECENT_MESSAGES_LIMIT = 20
export const DEFAULT_ARTIFACT_CONTEXT_LIMIT = 10

export class AgentRuntimeInputTooLargeError extends Error {
  readonly code = "runtime_input_too_large"

  constructor() {
    super("The current user message exceeds the OpenCode runtime context limit.")
    this.name = "AgentRuntimeInputTooLargeError"
  }
}

type RuntimeMessage = AgentRuntimeInput["messages"][number]

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

function envPositiveInt(name: string, fallback: number) {
  const parsed = Number.parseInt(process.env[name] || "", 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function serializeLength(input: Pick<AgentRuntimeInput, "systemPrompt" | "messages" | "attachments" | "artifactContext" | "workflowContext" | "projectSnapshot">) {
  return JSON.stringify(input).length
}

function normalizeAttachments(attachments: AgentRuntimeInput["attachments"]) {
  return attachments
    .map((attachment) => ({
      id: text(attachment.id).slice(0, 128),
      fileName: text(attachment.fileName).slice(0, 255),
      mimeType: text(attachment.mimeType).slice(0, 120),
      textSummary: text(attachment.textSummary).slice(0, 12_000),
    }))
    .filter((attachment) => attachment.id && attachment.textSummary)
}

function workflowMessage(workflowContext: WorkflowContext | null): RuntimeMessage | null {
  if (!workflowContext) return null
  return {
    role: "assistant",
    content: [
      "[Platform workflow context]",
      `workflowRunId: ${workflowContext.workflowRunId}`,
      `workflowKey: ${workflowContext.workflowKey}`,
      `status: ${workflowContext.status}`,
      `currentStepKey: ${workflowContext.currentStepKey || "none"}`,
      workflowContext.latestStepSummaries.join("\n"),
      `allowedUserActions: ${workflowContext.allowedUserActions.join(", ") || "none"}`,
    ].filter(Boolean).join("\n"),
  }
}

function artifactMessage(artifacts: AgentRuntimeInput["artifactContext"]): RuntimeMessage | null {
  if (artifacts.length === 0) return null
  return {
    role: "assistant",
    content: [
      "[Platform artifact context — metadata only]",
      ...artifacts.map((artifact) => `artifactId=${artifact.artifactId}; title=${artifact.title}; kind=${artifact.kind}; summary=${artifact.summary}`),
    ].join("\n"),
  }
}

function conversationSummaryMessage(summary: string): RuntimeMessage | null {
  const normalized = text(summary)
  return normalized ? { role: "assistant", content: `[Conversation summary]\n${normalized}` } : null
}

export function buildAgentRuntimeInput(input: {
  runId: string
  sessionKey?: string | null
  conversationId: string | null
  conversationRevision?: number | null
  enterpriseId: number | null
  userId: number
  agentId: string | null
  selectedSkillIds?: string[]
  exportConfirmationGranted?: boolean
  sharedSkillSetSelection?: SharedSkillSetSelection | null
  systemPrompt: string
  messages: RuntimeMessage[]
  attachments?: AgentRuntimeInput["attachments"]
  artifactContext?: AgentRuntimeInput["artifactContext"]
  workflowContext?: WorkflowContext | null
  conversationSummary?: string | null
  projectSnapshot?: RuntimeProjectSnapshot | null
  modelHint?: string | null
  allowNetwork?: boolean
  maxContextChars?: number
  recentMessagesLimit?: number
  artifactContextLimit?: number
  profileLimits?: {
    maxArtifacts: number
    maxArtifactBytes: number
    maxArtifactTotalBytes: number
  }
}): AgentRuntimeInput {
  const maxContextChars = input.maxContextChars || envPositiveInt("AI_ENTRY_OPENCODE_MAX_CONTEXT_CHARS", DEFAULT_MAX_CONTEXT_CHARS)
  const normalizedSystemPrompt = text(input.systemPrompt)
  const normalizedMessages = input.messages
    .filter((message) => (message.role === "user" || message.role === "assistant" || message.role === "tool") && text(message.content))
    .map((message) => ({ role: message.role, content: text(message.content) }))
  const currentUserIndex = [...normalizedMessages].map((message) => message.role).lastIndexOf("user")
  const currentUser = currentUserIndex >= 0 ? normalizedMessages[currentUserIndex] : null
  const currentUserContent = currentUser?.content || ""
  const attachments = normalizeAttachments(input.attachments || [])
  const attachmentBlock = attachments.length > 0
    ? `\n\n[Authenticated attachment summaries]\n${attachments.map((attachment) => `${attachment.fileName} (${attachment.mimeType}): ${attachment.textSummary}`).join("\n")}`
    : ""
  const currentUserMessage: RuntimeMessage = {
    role: "user",
    content: `${currentUserContent}${attachmentBlock}`.trim(),
  }

  const baseInput = {
    runId: input.runId,
    ...(input.sessionKey ? { sessionKey: input.sessionKey } : {}),
    conversationId: input.conversationId,
    conversationRevision: input.conversationRevision ?? null,
    enterpriseId: input.enterpriseId,
    userId: input.userId,
    agentId: input.agentId,
    ...(input.exportConfirmationGranted === true ? { exportConfirmationGranted: true } : {}),
    ...((input.selectedSkillIds || []).filter(Boolean).length > 0
      ? { selectedSkillIds: [...new Set((input.selectedSkillIds || []).filter(Boolean))] }
      : {}),
    ...(input.sharedSkillSetSelection ? { sharedSkillSetSelection: input.sharedSkillSetSelection } : {}),
    modelHint: text(input.modelHint) || null,
    ...(input.projectSnapshot ? { projectSnapshot: input.projectSnapshot } : {}),
    systemPrompt: normalizedSystemPrompt,
    messages: [currentUserMessage],
    attachments,
    artifactContext: [],
    workflowContext: input.workflowContext || null,
    artifactContract: {
      manifestPath: "artifact-manifest.json" as const,
      artifactDir: "artifacts" as const,
      maxArtifacts: input.profileLimits?.maxArtifacts || 8,
      maxArtifactBytes: input.profileLimits?.maxArtifactBytes || 2 * 1024 * 1024,
      maxArtifactTotalBytes: input.profileLimits?.maxArtifactTotalBytes || 4 * 1024 * 1024,
      allowedExtensions: runtimeArtifactExtensions(input.agentId, input.selectedSkillIds),
    },
    policy: {
      allowPlatformTools: false as const,
      allowTools: false as const,
      allowMcp: false as const,
      allowSkillInstall: false as const,
      allowNetwork: input.allowNetwork !== false,
    },
  } satisfies AgentRuntimeInput

  if (currentUserMessage.content.length + normalizedSystemPrompt.length > maxContextChars) {
    throw new AgentRuntimeInputTooLargeError()
  }

  const workflow = workflowMessage(input.workflowContext || null)
  const artifactLimit = input.artifactContextLimit || envPositiveInt("AI_ENTRY_OPENCODE_ARTIFACT_CONTEXT_LIMIT", DEFAULT_ARTIFACT_CONTEXT_LIMIT)
  const artifacts = isAiEntryOpenCodeArtifactContextEnabled()
    ? (input.artifactContext || []).slice(-artifactLimit).map((artifact) => ({
        artifactId: artifact.artifactId,
        title: text(artifact.title).slice(0, 255),
        kind: text(artifact.kind).slice(0, 64),
        summary: text(artifact.summary).slice(0, 2_000),
      }))
    : []
  const historical = normalizedMessages
    .filter((_, index) => index !== currentUserIndex)
    .slice(-(input.recentMessagesLimit || envPositiveInt("AI_ENTRY_OPENCODE_RECENT_MESSAGES_LIMIT", DEFAULT_RECENT_MESSAGES_LIMIT)))
    .reverse()
  const summary = conversationSummaryMessage(input.conversationSummary || "")
  const contextMessages = [workflow, artifactMessage(artifacts), ...historical, summary].filter((message): message is RuntimeMessage => Boolean(message))

  let selected = [...contextMessages]
  const fits = () => serializeLength({ ...baseInput, messages: [...selected, currentUserMessage], artifactContext: artifacts }) <= maxContextChars
  while (!fits() && selected.some((message) => historical.includes(message))) {
    const historicalIndex = [...selected].findIndex((message) => historical.includes(message))
    if (historicalIndex < 0) break
    selected.splice(historicalIndex, 1)
  }
  while (!fits() && artifacts.length > 3) {
    artifacts.shift()
    const nextArtifact = artifactMessage(artifacts)
    selected = selected.filter((message) => !message.content.startsWith("[Platform artifact context"))
    if (nextArtifact) selected.splice(workflow ? 1 : 0, 0, nextArtifact)
  }
  if (!fits()) throw new AgentRuntimeInputTooLargeError()

  const finalMessages = [...selected, currentUserMessage]
  const contextHash = createHash("sha256").update(JSON.stringify({
    revision: input.conversationRevision ?? null,
    messages: finalMessages.slice(-20),
    summary: input.conversationSummary || null,
    artifactRefs: artifacts,
  })).digest("hex")

  return {
    ...baseInput,
    artifactContext: artifacts,
    messages: finalMessages,
    contextHash,
  }
}
