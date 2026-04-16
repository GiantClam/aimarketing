import {
  createLeadHunterSkillSseStream,
  runLeadHunterSkillConversation,
  type LeadHunterSkillEventPayload,
} from "@/lib/lead-hunter/skill-engine"
import type { LeadHunterAdvisorType } from "@/lib/lead-hunter/types"
import { runWriterSkillsTurn } from "@/lib/writer/skills"

type LeadHunterSkillInput = {
  query: string
  preferredLanguage?: "zh" | "en" | "auto" | null
  conversationId?: string | null
  enterpriseId?: number | null
  enterpriseCode?: string | null
  memoryContext?: string | null
  soulCard?: string | null
  signal?: AbortSignal
  onSseEvent?: (payload: LeadHunterSkillEventPayload) => void | Promise<void>
}

type WriterSkillInput = {
  query: string
  preloadedBrief?: unknown
  userId?: number
  conversationId?: string | null
  agentType?: string
  platform: string
  mode: string
  preferredLanguage?: string
  history?: unknown[]
  conversationStatus?: string
  enterpriseId?: number | null
  onProgress?: (event: { type: string; label: string; detail?: string; status: string; at?: number }) => void | Promise<void>
}

export function loadLeadHunterSkillRunner(advisorType: LeadHunterAdvisorType) {
  return {
    kind: "lead-hunter" as const,
    advisorType,
    runBlocking: (input: LeadHunterSkillInput) =>
      runLeadHunterSkillConversation({
        advisorType,
        query: input.query,
        preferredLanguage: input.preferredLanguage,
        conversationId: input.conversationId,
        enterpriseId: input.enterpriseId,
        enterpriseCode: input.enterpriseCode,
        memoryContext: input.memoryContext,
        soulCard: input.soulCard,
        signal: input.signal,
        onSseEvent: input.onSseEvent,
      }),
    runStreaming: (input: LeadHunterSkillInput) =>
      createLeadHunterSkillSseStream({
        advisorType,
        query: input.query,
        preferredLanguage: input.preferredLanguage,
        conversationId: input.conversationId,
        enterpriseId: input.enterpriseId,
        enterpriseCode: input.enterpriseCode,
        memoryContext: input.memoryContext,
        soulCard: input.soulCard,
        signal: input.signal,
        onSseEvent: input.onSseEvent,
      }),
  }
}

export function loadWriterSkillRunner() {
  return {
    kind: "writer" as const,
    runBlocking: async (input: WriterSkillInput) => {
      return runWriterSkillsTurn({
        query: input.query,
        preloadedBrief: (input.preloadedBrief || null) as any,
        userId: input.userId,
        conversationId: input.conversationId || null,
        agentType: (input.agentType || "writer") as any,
        platform: input.platform as any,
        mode: input.mode as any,
        preferredLanguage: (input.preferredLanguage || "auto") as any,
        history: (input.history || []) as any,
        conversationStatus: input.conversationStatus as any,
        enterpriseId: input.enterpriseId,
        onProgress: input.onProgress as any,
      } as any)
    },
  }
}
