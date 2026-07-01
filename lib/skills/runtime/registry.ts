import type { LeadHunterAdvisorType } from "@/lib/lead-hunter/types"
import type { ExecutiveAdvisorType } from "@/lib/skills/runtime/executive-advisor-types"
import { runWriterSkillsTurn } from "@/lib/writer/skills"

type LeadHunterSkillEventPayload = {
  event: string
  data?: unknown
}

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
  selectedProviderId?: string | null
  selectedModelId?: string | null
  onProgress?: (event: { type: string; label: string; detail?: string; status: string; at?: number }) => void | Promise<void>
}

export async function loadLeadHunterSkillRunner(advisorType: LeadHunterAdvisorType) {
  const runtime = await import("@/lib/lead-hunter/skill-engine")
  return {
    kind: "lead-hunter" as const,
    advisorType,
    runBlocking: (input: LeadHunterSkillInput) =>
      runtime.runLeadHunterSkillConversation({
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
      runtime.createLeadHunterSkillSseStream({
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

export async function loadExecutiveAdvisorSkillRunner(advisorType: ExecutiveAdvisorType) {
  const runtime = await import("@/lib/skills/runtime/executive-advisor")
  return runtime.loadExecutiveAdvisorSkillRunner(advisorType)
}

export type { ExecutiveAdvisorType }

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
        selectedProviderId: (input.selectedProviderId || null) as any,
        selectedModelId: (input.selectedModelId || null) as any,
        onProgress: input.onProgress as any,
      } as any)
    },
  }
}
