import { and, eq, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { writerConversations, writerMessages } from "@/lib/db/schema"
import { getWriterConversation } from "@/lib/writer/repository"
import type { WriterPlatform, WriterMode, WriterLanguage } from "@/lib/writer/config"
import type { WriterTurnDiagnostics } from "@/lib/writer/types"

export class WriterRevisionConflictError extends Error {
  readonly code = "writer_revision_conflict"

  constructor(public readonly expectedRevision: number, public readonly activeRevision: number) {
    super(`writer_revision_conflict:expected=${expectedRevision}:active=${activeRevision}`)
  }
}

export type WriterRevisionState = {
  activeRevision: number
  activeDraftMessageId: number | null
  activeDraft: string | null
}

export async function getWriterRevisionState(userId: number, conversationId: string): Promise<WriterRevisionState | null> {
  const conversation = await getWriterConversation(userId, conversationId)
  if (!conversation) return null
  const rows = await db.execute(sql`
    SELECT active_revision, active_draft_message_id,
      (SELECT content FROM "AI_MARKETING_writer_messages" WHERE id = active_draft_message_id) AS active_draft
    FROM "AI_MARKETING_writer_conversations"
    WHERE id = ${conversation.id}
    LIMIT 1
  `)
  const row = (rows.rows[0] || {}) as Record<string, unknown>
  const activeDraftMessageId = Number(row.active_draft_message_id)
  return {
    activeRevision: Number(row.active_revision || 0),
    activeDraftMessageId: Number.isFinite(activeDraftMessageId) && activeDraftMessageId > 0 ? activeDraftMessageId : null,
    activeDraft: typeof row.active_draft === "string" && row.active_draft ? row.active_draft : null,
  }
}

export async function persistWriterRevision(input: {
  userId: number
  conversationId: string
  expectedRevision: number
  title: string
  content: string
  diagnostics?: WriterTurnDiagnostics | null
  platform?: WriterPlatform
  mode?: WriterMode
  language?: WriterLanguage
  turnOutcome?: "needs_clarification" | "draft_ready"
  assetStatus?: string
  activePlatformSkillId?: string | null
  contextHash?: string | null
  skillRelease?: string | null
  skillDigest?: string | null
}) {
  const conversation = await getWriterConversation(input.userId, input.conversationId)
  if (!conversation) throw new Error("writer_conversation_not_found")
  const result = await db.transaction(async (tx) => {
    const locked = await tx.execute(sql`
      SELECT active_revision, active_draft_message_id
      FROM "AI_MARKETING_writer_conversations"
      WHERE id = ${conversation.id} AND user_id = ${input.userId}
      FOR UPDATE
    `)
    const current = (locked.rows[0] || {}) as Record<string, unknown>
    const activeRevision = Number(current.active_revision || 0)
    if (activeRevision !== input.expectedRevision) throw new WriterRevisionConflictError(input.expectedRevision, activeRevision)

    const activeDraftMessageId = Number(current.active_draft_message_id)
    if (Number.isFinite(activeDraftMessageId) && activeDraftMessageId > 0) {
      await tx.update(writerMessages)
        .set({ isActiveDraft: false })
        .where(eq(writerMessages.id, activeDraftMessageId))
    }

    const nextRevision = activeRevision + 1
    const [message] = await tx.insert(writerMessages).values({
      conversationId: conversation.id,
      role: "assistant",
      content: input.content,
      diagnostics: input.diagnostics || null,
      revision: nextRevision,
      expectedBaseRevision: input.expectedRevision,
      isActiveDraft: true,
      createdAt: new Date(),
    }).returning({ id: writerMessages.id })
    await tx.update(writerConversations).set({
      activeRevision: nextRevision,
      activeDraftMessageId: message.id,
      ...(input.platform ? { platform: input.platform } : {}),
      ...(input.mode ? { mode: input.mode } : {}),
      ...(input.language ? { language: input.language } : {}),
      ...(input.turnOutcome ? { turnOutcome: input.turnOutcome } : {}),
      ...(input.assetStatus ? { assetStatus: input.assetStatus } : {}),
      ...(input.activePlatformSkillId ? { activePlatformSkillId: input.activePlatformSkillId } : {}),
      ...(input.contextHash ? { contextHash: input.contextHash } : {}),
      ...(input.skillRelease ? { skillRelease: input.skillRelease } : {}),
      ...(input.skillDigest ? { skillDigest: input.skillDigest } : {}),
      status: "text_ready",
      updatedAt: new Date(),
    }).where(and(eq(writerConversations.id, conversation.id), eq(writerConversations.activeRevision, input.expectedRevision)))
    return { revision: nextRevision, messageId: message.id }
  })
  return result
}

export async function persistWriterAssetProgress(input: {
  userId: number
  conversationId: string | null
  expectedRevision: number | null | undefined
  content: string
}) {
  if (!input.conversationId || !Number.isInteger(input.expectedRevision) || (input.expectedRevision || 0) < 0) return false
  const conversation = await getWriterConversation(input.userId, input.conversationId)
  if (!conversation) return false
  const result = await db.execute(sql`
    UPDATE "AI_MARKETING_writer_messages"
    SET content = ${input.content}
    WHERE id = (
      SELECT active_draft_message_id
      FROM "AI_MARKETING_writer_conversations"
      WHERE id = ${conversation.id} AND user_id = ${input.userId} AND active_revision = ${input.expectedRevision}
      LIMIT 1
    )
    AND conversation_id = ${conversation.id}
    AND is_active_draft = true
    RETURNING id
  `)
  return result.rows.length > 0
}
