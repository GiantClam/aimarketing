import { NextRequest } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"

export const runtime = 'nodejs'
export const maxDuration = 30

const AGENT_URL = process.env.AGENT_URL || process.env.NEXT_PUBLIC_AGENT_URL || "https://api.aimarketingsite.com"

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSessionUser(request, "video_generation")
    if ("response" in auth) {
      return auth.response
    }

    const body = await request.json().catch(() => ({}))
    const res = await fetch(`${AGENT_URL}/tools/r2/presign-upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(body || {}),
        user_id: auth.user.id,
        user_email: auth.user.email,
      }),
    })
    const data = await res.json().catch(() => ({ error: "presign failed" }))
    if (!res.ok) {
      return new Response(JSON.stringify(data), { status: res.status, headers: { "Content-Type": "application/json" } })
    }
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } })
  } catch (error: any) {
    console.error("R2 presign proxy error:", error)
    return new Response(JSON.stringify({ error: error?.message || "内部服务器错误" }), { status: 500, headers: { "Content-Type": "application/json" } })
  }
}
