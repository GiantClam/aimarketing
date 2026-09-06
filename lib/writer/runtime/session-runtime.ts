import { createHash } from "node:crypto"
import { buildWriterSessionContext } from "@coworkany/writer-core"

import type { WriterPlatform } from "@/lib/writer/config"

export type WriterSessionScope = {
  environment: string
  enterpriseId?: number | null
  userId: number
  conversationId: string
  agentId?: string
}

export type WriterActiveDraft = {
  revision: number
  title: string
  content: string
  sourceUrls: readonly string[]
}

export type WriterRuntimeTurn = {
  role: "user" | "assistant"
  content: string
}

export type WriterRuntimeContext = {
  schemaVersion: 1
  sessionKey: string
  conversationId: string
  platform: WriterPlatform
  currentTurn: string
  activeDraft: WriterActiveDraft | null
  recentTurns: WriterRuntimeTurn[]
  taskStatus: "pending" | "running" | "ready" | "failed"
  recovery: boolean
  contextHash: string
}

const RECOVERABLE_SESSION_ERRORS = /(?:session[_ -]?not[_ -]?found|checkpoint|context[_ -]?hash|session[_ -]?invalid|session[_ -]?unavailable)/iu

function normalizeScopePart(value: unknown, fallback: string) {
  const normalized = String(value ?? fallback).trim()
  return normalized || fallback
}

export function deriveWriterSessionKey(scope: WriterSessionScope) {
  const canonical = [
    normalizeScopePart(scope.environment, "unknown"),
    normalizeScopePart(scope.enterpriseId ?? "personal", "personal"),
    normalizeScopePart(scope.userId, "unknown"),
    normalizeScopePart(scope.conversationId, "unknown"),
    normalizeScopePart(scope.agentId, "writer"),
  ].join("\u001f")
  return `sess-${createHash("sha1").update(canonical).digest("hex")}`
}

function cloneDraft(draft: WriterActiveDraft | null) {
  if (!draft) return null
  return {
    revision: draft.revision,
    title: draft.title,
    content: draft.content,
    sourceUrls: [...draft.sourceUrls],
  }
}

function hashContext(input: Omit<WriterRuntimeContext, "contextHash">) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex")
}

export function buildWriterRuntimeContext(input: {
  sessionKey?: string
  conversationId?: string
  currentTurn: string
  platform: WriterPlatform
  activeDraft: WriterActiveDraft | null
  recentTurns: WriterRuntimeTurn[]
  recentTurnLimit?: number
  taskStatus: WriterRuntimeContext["taskStatus"]
}) {
  const sessionKey = input.sessionKey || deriveWriterSessionKey({
    environment: process.env.NODE_ENV || "development",
    userId: 0,
    conversationId: input.conversationId || "unknown",
  })
  const normalized = buildWriterSessionContext({
    conversationId: input.conversationId,
    platform: input.platform,
    currentTurn: input.currentTurn,
    activeDraft: input.activeDraft,
    recentTurns: input.recentTurns,
    recentTurnLimit: input.recentTurnLimit,
    taskStatus: input.taskStatus,
  })
  const base: Omit<WriterRuntimeContext, "contextHash"> = {
    schemaVersion: normalized.schemaVersion,
    sessionKey,
    conversationId: normalized.conversationId,
    platform: normalized.platform as WriterPlatform,
    currentTurn: normalized.currentTurn,
    activeDraft: cloneDraft(normalized.activeDraft),
    // History is bounded independently. The active draft is never included
    // in this array, so clipping history cannot clip the document.
    recentTurns: normalized.recentTurns.map((turn) => ({
      role: turn.role,
      content: turn.content,
    })),
    taskStatus: normalized.taskStatus,
    recovery: normalized.recovery,
  }
  return { ...base, contextHash: hashContext(base) }
}

export function buildWriterRecoveryContext(context: WriterRuntimeContext): WriterRuntimeContext {
  const normalized = buildWriterSessionContext({
    conversationId: context.conversationId,
    platform: context.platform,
    currentTurn: context.currentTurn,
    activeDraft: context.activeDraft,
    recentTurns: context.recentTurns,
    recentTurnLimit: Math.max(1, context.recentTurns.length),
    taskStatus: context.taskStatus,
    recovery: true,
  })
  const base = {
    ...context,
    activeDraft: cloneDraft(normalized.activeDraft),
    recentTurns: normalized.recentTurns.map((turn) => ({ ...turn })),
    recovery: normalized.recovery,
  }
  return { ...base, contextHash: hashContext(base) }
}

export function isRecoverableWriterRuntimeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return RECOVERABLE_SESSION_ERRORS.test(message)
}

export async function runWriterRuntimeWithRecovery<T>(input: {
  normalContext: WriterRuntimeContext
  recoveryContext: WriterRuntimeContext
  invoke: (context: WriterRuntimeContext) => Promise<T>
  charge?: () => Promise<void>
}) {
  const result = await input.invoke(input.normalContext).catch(async (error) => {
    if (!isRecoverableWriterRuntimeError(error)) throw error
    return input.invoke(input.recoveryContext)
  })
  if (input.charge) await input.charge()
  return result
}
