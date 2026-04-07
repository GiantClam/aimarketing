import { NextRequest, NextResponse } from "next/server"

import { requireAdvisorAccess } from "@/lib/auth/guards"
import {
  buildAdvisorConversationListCacheKey,
  getAdvisorConversationListCache,
  invalidateAdvisorConversationListCacheByScope,
  setAdvisorConversationListCache,
} from "@/lib/advisor/conversation-list-cache"
import { getConversations } from "@/lib/dify/client"
import { buildDifyUserIdentity, getDifyConfigByAdvisorType } from "@/lib/dify/config"
import { createLeadHunterConversation, listLeadHunterConversations } from "@/lib/lead-hunter/repository"
import { normalizeLeadHunterAdvisorType } from "@/lib/lead-hunter/types"
import { LOCALE_COOKIE_NAME, resolveRequestLocale } from "@/lib/i18n/config"

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const lastId = searchParams.get("last_id") || undefined
  const limit = parseInt(searchParams.get("limit") || "20", 10)

  try {
    const advisorType = searchParams.get("advisorType")
    const normalizedLeadHunterType = normalizeLeadHunterAdvisorType(advisorType)
    const resolvedAdvisorType = normalizedLeadHunterType || advisorType
    const auth = await requireAdvisorAccess(req, advisorType)
    if ("response" in auth) {
      return auth.response
    }

    if (normalizedLeadHunterType) {
      const data = await listLeadHunterConversations(auth.user.id, normalizedLeadHunterType, lastId, limit)
      return NextResponse.json(data)
    }

    const cacheKey = buildAdvisorConversationListCacheKey({
      userId: auth.user.id,
      advisorType: resolvedAdvisorType,
      lastId,
      limit,
    })
    const freshCache = getAdvisorConversationListCache(cacheKey, "fresh")
    if (freshCache) {
      return NextResponse.json(freshCache.payload, {
        headers: { "X-Advisor-List-Cache": "hit" },
      })
    }

    const difyUser = buildDifyUserIdentity(auth.user.email, resolvedAdvisorType)
    const config = await getDifyConfigByAdvisorType(resolvedAdvisorType, {
      userId: auth.user.id,
      userEmail: auth.user.email,
    })
    if (!config) {
      const staleCache = getAdvisorConversationListCache(cacheKey, "stale")
      if (staleCache) {
        return NextResponse.json(staleCache.payload, {
          headers: { "X-Advisor-List-Cache": "stale" },
        })
      }
      return NextResponse.json({
        data: [],
        has_more: false,
        limit,
        source: "unavailable",
      })
    }

    try {
      const difyRes = await getConversations(config, difyUser, lastId, limit)

      if (!difyRes.ok) {
        const staleCache = getAdvisorConversationListCache(cacheKey, "stale")
        if (staleCache) {
          return NextResponse.json(staleCache.payload, {
            headers: { "X-Advisor-List-Cache": "stale" },
          })
        }

        if (difyRes.status === 401 || difyRes.status === 503) {
          return NextResponse.json({
            data: [],
            has_more: false,
            limit,
            source: "credential_blocked",
          })
        }
        const errorData = await difyRes.text()
        return NextResponse.json({ error: "Dify API Error", details: errorData }, { status: difyRes.status })
      }

      const data = await difyRes.json()
      setAdvisorConversationListCache(cacheKey, data)
      return NextResponse.json(data, {
        headers: { "X-Advisor-List-Cache": "miss" },
      })
    } catch (error: any) {
      const staleCache = getAdvisorConversationListCache(cacheKey, "stale")
      if (staleCache) {
        return NextResponse.json(staleCache.payload, {
          headers: { "X-Advisor-List-Cache": "stale" },
        })
      }
      throw error
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const advisorType = body?.advisorType
    const normalizedLeadHunterType = normalizeLeadHunterAdvisorType(advisorType)
    const auth = await requireAdvisorAccess(req, advisorType)
    if ("response" in auth) {
      return auth.response
    }

    if (!normalizedLeadHunterType) {
      return NextResponse.json(
        { error: "advisor_session_creation_requires_first_message" },
        { status: 409 },
      )
    }

    const locale = resolveRequestLocale(req.cookies.get(LOCALE_COOKIE_NAME)?.value, req.headers.get("accept-language"))
    const title = typeof body?.name === "string" && body.name.trim()
      ? body.name.trim()
      : locale === "zh"
        ? "新建会话"
        : "New conversation"
    const conversation = await createLeadHunterConversation(auth.user.id, normalizedLeadHunterType, title)
    invalidateAdvisorConversationListCacheByScope(auth.user.id, normalizedLeadHunterType)

    return NextResponse.json({
      data: {
        id: String(conversation.id),
        name: conversation.title,
        status: "normal",
        created_at: Math.floor((conversation.createdAt?.getTime?.() || Date.now()) / 1000),
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "conversation_create_failed" }, { status: 500 })
  }
}
