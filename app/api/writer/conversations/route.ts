import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import {
  buildWriterConversationListCacheKey,
  getWriterConversationListCache,
  invalidateWriterConversationListCacheByUser,
  setWriterConversationListCache,
} from "@/lib/writer/conversation-list-cache"
import { normalizeWriterLanguage, normalizeWriterMode, normalizeWriterPlatform } from "@/lib/writer/config"
import { createWriterConversation, listWriterConversations } from "@/lib/writer/repository"

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const limit = parseInt(searchParams.get("limit") || "20", 10)
  const cursor = searchParams.get("cursor")
  let authenticatedUserId: number | null = null

  try {
    const auth = await requireSessionUser(req, "copywriting_generation")
    if ("response" in auth) {
      return auth.response
    }
    authenticatedUserId = auth.user.id

    const cacheKey = buildWriterConversationListCacheKey({
      userId: authenticatedUserId,
      limit,
      cursor,
    })
    const freshCache = getWriterConversationListCache(cacheKey, "fresh")
    if (freshCache) {
      return NextResponse.json(freshCache.payload, {
        headers: { "X-Writer-List-Cache": "hit" },
      })
    }

    const data = await listWriterConversations(authenticatedUserId, limit, cursor)
    setWriterConversationListCache(cacheKey, data)
    return NextResponse.json(data, {
      headers: { "X-Writer-List-Cache": "miss" },
    })
  } catch (error: any) {
    if (authenticatedUserId) {
      const cacheKey = buildWriterConversationListCacheKey({
        userId: authenticatedUserId,
        limit,
        cursor,
      })
      const staleCache = getWriterConversationListCache(cacheKey, "stale")
      if (staleCache) {
        return NextResponse.json(staleCache.payload, {
          headers: { "X-Writer-List-Cache": "stale" },
        })
      }
    }

    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSessionUser(req, "copywriting_generation")
    if ("response" in auth) {
      return auth.response
    }

    const body = await req.json().catch(() => ({}))
    const platform = normalizeWriterPlatform(body?.platform)
    const mode = normalizeWriterMode(platform, body?.mode)
    const language = normalizeWriterLanguage(body?.language)

    const data = await createWriterConversation({
      userId: auth.user.id,
      title: typeof body?.title === "string" ? body.title : null,
      platform,
      mode,
      language,
      status: "drafting",
      imagesRequested: false,
    })
    invalidateWriterConversationListCacheByUser(auth.user.id)

    return NextResponse.json({ data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "writer_session_create_failed" }, { status: 500 })
  }
}
