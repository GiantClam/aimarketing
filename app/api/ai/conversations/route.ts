import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import {
  createAiEntryConversation,
  getLatestAiEntryConversationModelId,
  listAiEntryConversations,
  type AiEntryConversationScope,
} from "@/lib/ai-entry/repository"
import {
  AI_ENTRY_CONSULTING_DEFAULT_EXECUTIVE_AGENT_ID,
  AI_ENTRY_CONSULTING_QUALITY_MODEL_HINT,
  pickConsultingModelId,
  resolveConsultingModelMode,
  shouldLockConsultingAdvisorModel,
  type AiEntryConsultingModelMode,
} from "@/lib/ai-entry/model-policy"
import { resolveEquivalentModelId } from "@/lib/ai-entry/model-id-registry"
import { parseAiEntryModelSelection } from "@/lib/ai-entry/model-selection"
import { loadExecutiveSkillForAgent } from "@/lib/ai-entry/executive-skill-loader"
import { getGovernedAiEntryModelCatalogForUser } from "@/lib/platform/model-governance"

function parseLimit(input: string | null, fallback: number) {
  const parsed = Number.parseInt(input || "", 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(parsed, 50)
}

function parseAgentId(input: string | null | undefined) {
  const normalized = typeof input === "string" ? input.trim() : ""
  return normalized || null
}

async function resolveCreateConversationModelId(
  user: {
    id: number
    enterpriseId: number | null
    enterpriseRole: string | null
    enterpriseStatus: string | null
  },
  requestedModelId: string | null,
  scope: AiEntryConversationScope,
  agentId: string | null,
  options?: {
    forceConsultingModel?: boolean
    consultingModelMode?: AiEntryConsultingModelMode
  },
) {
  const resolveRequestedFromCatalog = async () => {
    if (!requestedModelId) return null
    try {
      const catalog = await getGovernedAiEntryModelCatalogForUser({ user })
      const requestedSelection = parseAiEntryModelSelection(requestedModelId)
      const aliasPool = catalog.models.flatMap((item) =>
        [
          item.id,
          item.modelId,
          item.runtimeId,
          item.canonicalId,
          ...(Array.isArray(item.aliases) ? item.aliases : []),
        ].filter((value): value is string => typeof value === "string" && value.trim().length > 0),
      )
      const matched = resolveEquivalentModelId(
        requestedModelId,
        aliasPool,
      )
      const matchedOption =
        catalog.models.find((item) => {
          if (
            requestedSelection &&
            item.providerId === requestedSelection.providerId &&
            item.modelId === requestedSelection.modelId
          ) {
            return true
          }
          return [
            item.id,
            item.modelId,
            item.runtimeId,
            item.canonicalId,
            ...(Array.isArray(item.aliases) ? item.aliases : []),
          ].includes(matched || requestedModelId)
        }) || null
      return matchedOption?.id || matched || requestedModelId
    } catch {
      return requestedModelId
    }
  }

  if (options?.forceConsultingModel) {
    try {
      const catalog = await getGovernedAiEntryModelCatalogForUser({ user })
      const consultingModelId = pickConsultingModelId(catalog.models)
      if (consultingModelId) return consultingModelId
    } catch (error) {
      console.warn("ai-entry.conversation.create.locked-model.resolve.failed", {
        message: error instanceof Error ? error.message : String(error),
      })
    }

    return AI_ENTRY_CONSULTING_QUALITY_MODEL_HINT
  }

  if (requestedModelId) return await resolveRequestedFromCatalog()

  try {
    const catalog = await getGovernedAiEntryModelCatalogForUser({ user })
    if (catalog.selectedModelId) return catalog.selectedModelId
  } catch (error) {
    console.warn("ai-entry.conversation.create.default-model.resolve.failed", {
      message: error instanceof Error ? error.message : String(error),
    })
  }

  const latestModelId = await getLatestAiEntryConversationModelId(user.id, scope, agentId)
  if (latestModelId) return latestModelId

  return AI_ENTRY_CONSULTING_QUALITY_MODEL_HINT
}

export async function GET(request: NextRequest) {
  const auth = await requireSessionUser(request)
  if ("response" in auth) {
    return auth.response
  }

  const searchParams = request.nextUrl.searchParams
  const limit = parseLimit(searchParams.get("limit"), 20)
  const cursor = searchParams.get("cursor")
  const agentId = parseAgentId(searchParams.get("agent"))
  const conversationScope: AiEntryConversationScope = shouldLockConsultingAdvisorModel({
    entryMode: searchParams.get("entryMode"),
  })
    ? "consulting"
    : "chat"

  try {
    const data = await listAiEntryConversations(
      auth.user.id,
      limit,
      cursor,
      conversationScope,
      agentId,
    )
    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : "ai_entry_conversation_list_failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireSessionUser(request)
  if ("response" in auth) {
    return auth.response
  }

  const body = (await request.json().catch(() => ({}))) as {
    title?: unknown
    modelId?: unknown
    entryMode?: unknown
    agentId?: unknown
  }
  const rawTitle = typeof body.title === "string" ? body.title : null
  const rawModelId =
    typeof body.modelId === "string" && body.modelId.trim()
      ? body.modelId.trim()
      : null
  const rawAgentId =
    typeof body.agentId === "string" && body.agentId.trim()
      ? body.agentId.trim()
      : null
  const shouldLockModel = shouldLockConsultingAdvisorModel({
    entryMode: body.entryMode,
    agentId: rawAgentId,
  })
  const conversationScope: AiEntryConversationScope = shouldLockModel
    ? "consulting"
    : "chat"
  const consultingModelMode = resolveConsultingModelMode()

  try {
    const resolvedModelId = await resolveCreateConversationModelId(
      auth.user,
      rawModelId,
      conversationScope,
      rawAgentId,
      {
        forceConsultingModel: shouldLockModel,
        consultingModelMode,
      },
    )

    if (shouldLockModel) {
      // Warm consulting skill docs when creating a new consulting conversation,
      // so first message can use cached skill context.
      try {
        await loadExecutiveSkillForAgent(AI_ENTRY_CONSULTING_DEFAULT_EXECUTIVE_AGENT_ID)
      } catch (error) {
        console.warn("ai-entry.conversation.create.skill-warmup.failed", {
          agentId: AI_ENTRY_CONSULTING_DEFAULT_EXECUTIVE_AGENT_ID,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }

    const data = await createAiEntryConversation(
      auth.user.id,
      rawTitle,
      resolvedModelId,
      conversationScope,
      rawAgentId,
    )
    return NextResponse.json({ data })
  } catch (error) {
    const message = error instanceof Error ? error.message : "ai_entry_conversation_create_failed"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
