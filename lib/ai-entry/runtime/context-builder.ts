import { createHash } from "node:crypto"
import type { AgentRuntimeInput, RuntimeProjectSnapshot, SharedSkillSetSelection, WorkflowContext } from "@/lib/ai-runtime/contracts"
import { resolveRuntimeArtifactLimits, runtimeArtifactExtensions } from "./artifact-policy"
import { isAiEntryOpenCodeArtifactContextEnabled } from "./profile-store"
import {
  buildRuntimeContextWindow,
  clipRuntimeContextText,
  contextByteLength,
  DEFAULT_RUNTIME_CONTEXT_BYTES,
  DEFAULT_RUNTIME_RECENT_MESSAGES,
  MAX_RUNTIME_SUMMARY_CHARS,
  MAX_RUNTIME_TOOL_OUTPUT_CHARS,
  resolveRuntimeContextBytes,
} from "./context-window"

export const DEFAULT_MAX_CONTEXT_CHARS = DEFAULT_RUNTIME_CONTEXT_BYTES
export const DEFAULT_RECENT_MESSAGES_LIMIT = DEFAULT_RUNTIME_RECENT_MESSAGES
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
  return contextByteLength(input)
}

function normalizeAttachments(attachments: AgentRuntimeInput["attachments"]) {
  return attachments
    .map((attachment) => ({
      id: text(attachment.id).slice(0, 128),
      fileName: text(attachment.fileName).slice(0, 255),
      mimeType: text(attachment.mimeType).slice(0, 120),
      textSummary: clipRuntimeContextText(text(attachment.textSummary), 2_000),
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
      workflowContext.latestStepSummaries
        .slice(-4)
        .map((summary) => clipRuntimeContextText(summary, MAX_RUNTIME_TOOL_OUTPUT_CHARS))
        .join("\n"),
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
  const normalized = clipRuntimeContextText(text(summary), MAX_RUNTIME_SUMMARY_CHARS)
  return normalized ? { role: "assistant", content: `[Conversation summary]\n${normalized}` } : null
}

export function buildAgentRuntimeInput(input: {
  runId: string
  sessionKey?: string | null
  conversationId: string | null
  conversationRevision?: number | null
  writerContext?: AgentRuntimeInput["writerContext"]
  enterpriseId: number | null
  userId: number
  agentId: string | null
  writerPhase?: AgentRuntimeInput["writerPhase"]
  selectedSkillIds?: string[]
  sharedSkillSetSelection?: SharedSkillSetSelection | null
  systemPrompt: string
  messages: RuntimeMessage[]
  attachments?: AgentRuntimeInput["attachments"]
  artifactContext?: AgentRuntimeInput["artifactContext"]
  workflowContext?: WorkflowContext | null
  conversationSummary?: string | null
  projectSnapshot?: RuntimeProjectSnapshot | null
  modelHint?: string | null
  reasoningEffort?: AgentRuntimeInput["reasoningEffort"]
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
  if (input.writerContext && input.agentId !== "writer") {
    throw new Error("writer_context_agent_mismatch")
  }
  const maxContextChars = resolveRuntimeContextBytes(
    input.maxContextChars ?? envPositiveInt("AI_ENTRY_OPENCODE_MAX_CONTEXT_CHARS", DEFAULT_MAX_CONTEXT_CHARS),
  )
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

  const artifactContract = resolveRuntimeArtifactLimits({
    agentId: input.agentId,
    selectedSkillIds: input.selectedSkillIds,
    maxArtifacts: input.profileLimits?.maxArtifacts ?? 8,
    maxArtifactBytes: input.profileLimits?.maxArtifactBytes ?? 2 * 1024 * 1024,
    maxArtifactTotalBytes: input.profileLimits?.maxArtifactTotalBytes ?? 4 * 1024 * 1024,
  })

  const baseInput = {
    runId: input.runId,
    ...(input.sessionKey ? { sessionKey: input.sessionKey } : {}),
    conversationId: input.conversationId,
    conversationRevision: input.conversationRevision ?? null,
    ...(input.writerContext ? { writerContext: input.writerContext } : {}),
    enterpriseId: input.enterpriseId,
    userId: input.userId,
    agentId: input.agentId,
    ...(input.writerPhase ? { writerPhase: input.writerPhase } : {}),
    ...((input.selectedSkillIds || []).filter(Boolean).length > 0
      ? { selectedSkillIds: [...new Set((input.selectedSkillIds || []).filter(Boolean))] }
      : {}),
    ...(input.sharedSkillSetSelection ? { sharedSkillSetSelection: input.sharedSkillSetSelection } : {}),
    modelHint: text(input.modelHint) || null,
    ...(input.reasoningEffort ? { reasoningEffort: input.reasoningEffort } : {}),
    ...(input.projectSnapshot ? { projectSnapshot: input.projectSnapshot } : {}),
    systemPrompt: normalizedSystemPrompt,
    messages: [currentUserMessage],
    attachments,
    artifactContext: [],
    workflowContext: input.workflowContext || null,
    artifactContract: {
      manifestPath: "artifact-manifest.json" as const,
      artifactDir: "artifacts" as const,
      maxArtifacts: artifactContract.maxArtifacts,
      maxArtifactBytes: artifactContract.maxArtifactBytes,
      maxArtifactTotalBytes: artifactContract.maxArtifactTotalBytes,
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
  const artifactLimit = input.artifactContextLimit ?? envPositiveInt("AI_ENTRY_OPENCODE_ARTIFACT_CONTEXT_LIMIT", DEFAULT_ARTIFACT_CONTEXT_LIMIT)
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
    .slice(-(input.recentMessagesLimit ?? envPositiveInt("AI_ENTRY_OPENCODE_RECENT_MESSAGES_LIMIT", DEFAULT_RECENT_MESSAGES_LIMIT)))
    .map((message) => message.role === "tool"
      ? { ...message, content: clipRuntimeContextText(message.content, MAX_RUNTIME_TOOL_OUTPUT_CHARS) }
      : message)
  const summary = conversationSummaryMessage(input.conversationSummary || "")
  const contextMessages = [workflow, artifactMessage(artifacts)].filter((message): message is RuntimeMessage => Boolean(message))
  const window = buildRuntimeContextWindow({
    currentMessage: currentUserMessage,
    historicalMessages: historical,
    supplementalMessages: contextMessages,
    summaryMessage: summary,
    // Leave a small envelope for the signed runtime contract (IDs, policy,
    // artifact contract) while keeping the user-facing prompt itself bounded.
    maxBytes: maxContextChars + 512,
    serialize: (messages) => serializeLength({ ...baseInput, messages, artifactContext: artifacts }),
  })
  let selected = window.selected
  const fits = window.fits
  while (!fits() && artifacts.length > 0) {
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
    writerContext: input.writerContext?.contextHash || null,
  })).digest("hex")

  return {
    ...baseInput,
    artifactContext: artifacts,
    messages: finalMessages,
    contextHash,
  }
}
