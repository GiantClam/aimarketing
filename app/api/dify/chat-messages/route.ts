import { NextRequest, NextResponse } from "next/server"

import { enqueueAssistantTask } from "@/lib/assistant-async"
import { requireAdvisorAccess } from "@/lib/auth/guards"
import { sendMessage } from "@/lib/dify/client"
import { buildDifyUserIdentity, getDifyConfigByAdvisorType } from "@/lib/dify/config"
import { buildDifyMemoryBridge, mergeDifyInputsWithMemoryBridge } from "@/lib/dify/memory-bridge"
import { appendLeadHunterMessage, ensureLeadHunterConversation } from "@/lib/lead-hunter/repository"
import { buildLeadHunterChatPayload, formatLeadHunterChatOutput } from "@/lib/lead-hunter/chat"
import { normalizeLeadHunterAdvisorType } from "@/lib/lead-hunter/types"
import { logAuditEvent } from "@/lib/server/audit"
import { checkRateLimit, createRateLimitResponse, getRequestIp } from "@/lib/server/rate-limit"

function sanitizeAssistantContent(raw: string) {
  return raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim()
}

function extractSseBlocks(buffer: string) {
  const parts = buffer.split(/\r?\n\r?\n/)
  return { blocks: parts.slice(0, -1), rest: parts.at(-1) ?? "" }
}

function getSseDataFromBlock(block: string) {
  const raw = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
    .trim()

  if (!raw || raw === "[DONE]") return null

  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return null
  }
}

function extractText(value: unknown): string {
  if (typeof value === "string") return value
  if (Array.isArray(value)) {
    return value.map(extractText).find((item) => item.length > 0) || ""
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).map(extractText).find((item) => item.length > 0) || ""
  }
  return ""
}

function getObjectRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function extractAdvisorQuery(body: unknown) {
  if (!body || typeof body !== "object") return ""
  const candidate = body as Record<string, unknown>
  if (typeof candidate.query === "string") {
    return candidate.query
  }
  const inputs = getObjectRecord(candidate.inputs)
  return typeof inputs?.contents === "string" ? inputs.contents : ""
}

async function persistLeadHunterStreamingMessage(input: {
  stream: ReadableStream<Uint8Array>
  userId: number
  advisorType: string
  conversationId: string
  query: string
}) {
  const reader = input.stream.getReader()
  const decoder = new TextDecoder("utf-8")
  let buffer = ""
  let accumulated = ""
  let workflowOutput: unknown = null

  const consumeBlocks = (blocks: string[]) => {
    let terminalEventSeen = false
    for (const block of blocks) {
      const data = getSseDataFromBlock(block)
      if (!data) continue

      const event = typeof data.event === "string" ? data.event : ""
      const payloadData = getObjectRecord(data.data)
      if (["message", "agent_message", "text_chunk"].includes(event)) {
        const chunk =
          extractText((data as { answer?: unknown }).answer) ||
          extractText(payloadData?.text)
        if (chunk.trim()) {
          accumulated += chunk.trim()
        }
      }

      if (event === "workflow_finished") {
        workflowOutput =
          payloadData?.outputs ||
          payloadData?.output ||
          payloadData?.result ||
          (data as { output?: unknown }).output ||
          (data as { result?: unknown }).result ||
          workflowOutput
      }

      if (event === "message_end") {
        terminalEventSeen = true
      }
    }
    return terminalEventSeen
  }

  let streamTerminalEventSeen = false
  while (!streamTerminalEventSeen) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parsed = extractSseBlocks(buffer)
    buffer = parsed.rest
    if (consumeBlocks(parsed.blocks)) {
      streamTerminalEventSeen = true
      break
    }
  }

  if (!streamTerminalEventSeen) {
    buffer += decoder.decode()
    if (buffer.trim()) {
      const parsed = extractSseBlocks(`${buffer}\n\n`)
      consumeBlocks(parsed.blocks)
    }
  }
  void reader.cancel().catch(() => null)

  const rawResult = accumulated.trim() ? accumulated : workflowOutput
  const answer = sanitizeAssistantContent(formatLeadHunterChatOutput(rawResult))
  await appendLeadHunterMessage(
    input.userId,
    input.advisorType,
    input.conversationId,
    input.query,
    answer || "No lead data returned.",
  )
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const normalizedLeadHunterType = normalizeLeadHunterAdvisorType(body?.advisorType)
    const resolvedAdvisorType = normalizedLeadHunterType || body?.advisorType
    const auth = await requireAdvisorAccess(req, body?.advisorType)
    if ("response" in auth) {
      return auth.response
    }

    const rateLimit = await checkRateLimit({
      key: `dify:chat:${auth.user.id}:${getRequestIp(req)}:${resolvedAdvisorType}`,
      limit: 30,
      windowMs: 60_000,
    })
    if (!rateLimit.ok) {
      logAuditEvent(req, "advisor.chat.rate_limited", { userId: auth.user.id, advisorType: resolvedAdvisorType })
      return createRateLimitResponse("Too many advisor requests", rateLimit)
    }

    const difyUser = buildDifyUserIdentity(auth.user.email, resolvedAdvisorType)
    const config = await getDifyConfigByAdvisorType(resolvedAdvisorType, {
      userId: auth.user.id,
      userEmail: auth.user.email,
    })
    if (!config) {
      logAuditEvent(req, "advisor.chat.config_missing", { userId: auth.user.id, advisorType: resolvedAdvisorType })
      return NextResponse.json({ error: "No Dify connection configured" }, { status: 500 })
    }

    if (body?.response_mode === "async") {
      const query = extractAdvisorQuery(body)
      if (!query.trim()) {
        return NextResponse.json({ error: "query is required" }, { status: 400 })
      }
      const memoryBridge = await buildDifyMemoryBridge({
        userId: auth.user.id,
        advisorType: resolvedAdvisorType,
        query,
      })

      const conversation =
        normalizedLeadHunterType
          ? await ensureLeadHunterConversation(
              auth.user.id,
              normalizedLeadHunterType,
              typeof body?.conversation_id === "string" ? body.conversation_id : null,
              query,
            )
          : null

      const task = await enqueueAssistantTask({
        userId: auth.user.id,
        workflowName: "advisor_turn",
        payload: {
          kind: "advisor_turn",
          userId: auth.user.id,
          userEmail: auth.user.email,
          advisorType: resolvedAdvisorType,
          query,
          conversationId:
            normalizedLeadHunterType
              ? String(conversation?.id || "")
              : typeof body?.conversation_id === "string"
                ? body.conversation_id
                : null,
          memoryContext: memoryBridge.memoryContext,
          soulCard: memoryBridge.soulCard,
          memoryAppliedIds: memoryBridge.memoryAppliedIds,
        },
      })

      return NextResponse.json({
        accepted: true,
        task_id: String(task.id),
        conversation_id:
          normalizedLeadHunterType
            ? String(conversation?.id || "")
            : typeof body?.conversation_id === "string"
              ? body.conversation_id
              : null,
      })
    }

    if (normalizedLeadHunterType) {
      const query = extractAdvisorQuery(body)
      if (!query.trim()) {
        return NextResponse.json({ error: "query is required" }, { status: 400 })
      }
      const memoryBridge = await buildDifyMemoryBridge({
        userId: auth.user.id,
        advisorType: resolvedAdvisorType,
        query,
      })
      const memoryInputs = mergeDifyInputsWithMemoryBridge({}, memoryBridge)
      const isStreaming = body?.response_mode === "streaming"
      const streamingConversation = isStreaming
        ? await ensureLeadHunterConversation(
            auth.user.id,
            normalizedLeadHunterType,
            typeof body?.conversation_id === "string" ? body.conversation_id : null,
            query,
          )
        : null

      const chatRes = await sendMessage(
        config,
        buildLeadHunterChatPayload({
          query,
          responseMode: isStreaming ? "streaming" : "blocking",
          user: difyUser,
          advisorType: normalizedLeadHunterType,
          extraInputs: memoryInputs,
        }),
      )

      if (!chatRes.ok) {
        const chatError = await chatRes.text().catch(() => "")
        return NextResponse.json({ error: "Dify Chat Error", details: chatError }, { status: chatRes.status })
      }

      if (isStreaming && chatRes.body) {
        const [clientStream, persistStream] = chatRes.body.tee()
        if (streamingConversation?.id) {
          void persistLeadHunterStreamingMessage({
            stream: persistStream,
            userId: auth.user.id,
            advisorType: normalizedLeadHunterType,
            conversationId: String(streamingConversation.id),
            query,
          }).catch((error) => {
            console.error("lead_hunter.stream.persist_failed", {
              userId: auth.user.id,
              conversationId: String(streamingConversation.id),
              message: error instanceof Error ? error.message : String(error),
            })
          })
        } else {
          void persistStream.cancel().catch(() => null)
        }
        return new Response(clientStream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            ...(streamingConversation?.id ? { "X-Conversation-Id": String(streamingConversation.id) } : {}),
          },
        })
      }

      const chatData = (await chatRes.json().catch(() => null)) as
        | { answer?: unknown; data?: { answer?: unknown } | null }
        | null

      return NextResponse.json({
        answer: formatLeadHunterChatOutput(chatData?.answer ?? chatData?.data?.answer ?? chatData),
      })
    }

    const query = extractAdvisorQuery(body)
    const memoryBridge = await buildDifyMemoryBridge({
      userId: auth.user.id,
      advisorType: resolvedAdvisorType,
      query,
    })
    const mergedInputs = mergeDifyInputsWithMemoryBridge(
      body?.inputs && typeof body.inputs === "object" ? (body.inputs as Record<string, unknown>) : null,
      memoryBridge,
    )
    const difyRes = await sendMessage(config, { ...body, inputs: mergedInputs, user: difyUser })

    if (!difyRes.ok) {
      const errorData = await difyRes.text()
      return NextResponse.json({ error: "Dify API Error", details: errorData }, { status: difyRes.status })
    }

    if (body.response_mode === "streaming" && difyRes.body) {
      return new Response(difyRes.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      })
    }

    const data = await difyRes.json()
    logAuditEvent(req, "advisor.chat.success", { userId: auth.user.id, advisorType: resolvedAdvisorType })
    return NextResponse.json(data)
  } catch (error: any) {
    logAuditEvent(req, "advisor.chat.error", { message: error?.message || "unknown" })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
