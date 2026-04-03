import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { listWriterMemories, saveWriterMemoryItem } from "@/lib/writer/memory/repository"
import { parseMemoryItemsQuery, validateCreateMemoryPayload } from "@/lib/writer/memory/validators"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSessionUser(req, "copywriting_generation")
    if ("response" in auth) {
      return auth.response
    }

    const parsedQuery = parseMemoryItemsQuery(req.nextUrl.searchParams)
    if (!parsedQuery.ok) {
      return NextResponse.json({ error: parsedQuery.error }, { status: parsedQuery.status })
    }

    const items = await listWriterMemories({
      userId: auth.user.id,
      agentType: parsedQuery.data.agentType,
      type: parsedQuery.data.type,
      limit: parsedQuery.data.limit,
      cursor: parsedQuery.data.cursor,
    })

    const nextCursor = items.length > 0 && items.length >= parsedQuery.data.limit ? String(items[items.length - 1].id) : null

    return NextResponse.json({
      data: items,
      limit: parsedQuery.data.limit,
      has_more: Boolean(nextCursor),
      next_cursor: nextCursor,
    })
  } catch (error: any) {
    console.error("writer.memory.items.get.error", error)
    return NextResponse.json({ error: error?.message || "writer_memory_items_get_failed" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSessionUser(req, "copywriting_generation")
    if ("response" in auth) {
      return auth.response
    }

    const body = await req.json().catch(() => null)
    const parsedBody = validateCreateMemoryPayload(body)
    if (!parsedBody.ok) {
      return NextResponse.json({ error: parsedBody.error }, { status: parsedBody.status })
    }

    const created = await saveWriterMemoryItem({
      userId: auth.user.id,
      ...parsedBody.data,
    })

    return NextResponse.json({ data: created }, { status: 201 })
  } catch (error: any) {
    console.error("writer.memory.items.post.error", error)
    return NextResponse.json({ error: error?.message || "writer_memory_items_post_failed" }, { status: 500 })
  }
}

