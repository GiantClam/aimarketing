import { NextRequest } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"

export const runtime = 'nodejs'
export const maxDuration = 60

const AGENT_URL = process.env.AGENT_URL || process.env.NEXT_PUBLIC_AGENT_URL || "https://api.aimarketingsite.com"

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSessionUser(request, "video_generation")
    if ("response" in auth) {
      return auth.response
    }

    const body = await request.json()
    const runId = body.run_id
    const confirmed = body.confirmed // true 或 false
    const feedback = body.feedback || "" // 用户反馈（可选）

    if (!runId) {
      return new Response(JSON.stringify({ error: "缺少 run_id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const res = await fetch(`${AGENT_URL}/crewai/storyboard/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        run_id: runId,
        confirmed: confirmed,
        feedback: feedback,
        user_id: auth.user.id,
        user_email: auth.user.email,
      }),
    })

    if (!res.ok) {
      return new Response(JSON.stringify({ error: "确认失败" }), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      })
    }

    const data = await res.json()
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error: any) {
    console.error("Storyboard confirm error:", error)
    return new Response(JSON.stringify({ error: error.message || "内部服务器错误" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}

