import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import {
  getWriterMemoryItemById,
  softDeleteWriterMemoryItem,
  updateWriterMemoryItem,
} from "@/lib/writer/memory/repository"
import {
  isMemoryOwnedByScope,
  parseAgentTypeParam,
  parseMemoryIdParam,
  validatePatchMemoryPayload,
} from "@/lib/writer/memory/validators"

export const runtime = "nodejs"

export async function GET(req: NextRequest, context: { params: Promise<{ memoryId: string }> }) {
  try {
    const auth = await requireSessionUser(req, "copywriting_generation")
    if ("response" in auth) {
      return auth.response
    }

    const params = await context.params
    const memoryId = parseMemoryIdParam(params.memoryId)
    if (!memoryId.ok) {
      return NextResponse.json({ error: memoryId.error }, { status: memoryId.status })
    }
    const agentType = parseAgentTypeParam(req.nextUrl.searchParams.get("agentType"))
    if (!agentType.ok) {
      return NextResponse.json({ error: agentType.error }, { status: agentType.status })
    }

    const item = await getWriterMemoryItemById({
      userId: auth.user.id,
      agentType: agentType.data,
      memoryId: memoryId.data,
    })
    if (!isMemoryOwnedByScope(item, { userId: auth.user.id, agentType: agentType.data })) {
      return NextResponse.json({ error: "memory_not_found" }, { status: 404 })
    }

    return NextResponse.json({ data: item })
  } catch (error: any) {
    console.error("writer.memory.item.get.error", error)
    return NextResponse.json({ error: error?.message || "writer_memory_item_get_failed" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ memoryId: string }> }) {
  try {
    const auth = await requireSessionUser(req, "copywriting_generation")
    if ("response" in auth) {
      return auth.response
    }

    const params = await context.params
    const memoryId = parseMemoryIdParam(params.memoryId)
    if (!memoryId.ok) {
      return NextResponse.json({ error: memoryId.error }, { status: memoryId.status })
    }

    const body = await req.json().catch(() => null)
    const parsed = validatePatchMemoryPayload(body)
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status })
    }

    const updated = await updateWriterMemoryItem(
      {
        userId: auth.user.id,
        agentType: parsed.data.agentType,
        memoryId: memoryId.data,
      },
      parsed.data.patch,
    )
    if (!updated) {
      return NextResponse.json({ error: "memory_not_found" }, { status: 404 })
    }

    return NextResponse.json({ data: updated })
  } catch (error: any) {
    console.error("writer.memory.item.patch.error", error)
    return NextResponse.json({ error: error?.message || "writer_memory_item_patch_failed" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ memoryId: string }> }) {
  try {
    const auth = await requireSessionUser(req, "copywriting_generation")
    if ("response" in auth) {
      return auth.response
    }

    const params = await context.params
    const memoryId = parseMemoryIdParam(params.memoryId)
    if (!memoryId.ok) {
      return NextResponse.json({ error: memoryId.error }, { status: memoryId.status })
    }

    const body = await req.json().catch(() => null)
    const bodyAgentType =
      body && typeof body === "object" && "agentType" in (body as Record<string, unknown>)
        ? String((body as Record<string, unknown>).agentType || "")
        : null
    const queryAgentType = req.nextUrl.searchParams.get("agentType")
    const agentType = parseAgentTypeParam(bodyAgentType || queryAgentType)
    if (!agentType.ok) {
      return NextResponse.json({ error: agentType.error }, { status: agentType.status })
    }

    const deleted = await softDeleteWriterMemoryItem({
      userId: auth.user.id,
      agentType: agentType.data,
      memoryId: memoryId.data,
    })
    if (!deleted) {
      return NextResponse.json({ error: "memory_not_found" }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error("writer.memory.item.delete.error", error)
    return NextResponse.json({ error: error?.message || "writer_memory_item_delete_failed" }, { status: 500 })
  }
}

