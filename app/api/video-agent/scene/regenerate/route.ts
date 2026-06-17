import { NextRequest } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import {
  fetchVideoAgentUpstream,
  getVideoAgentErrorMessage,
  readJsonResponse,
} from "@/lib/video-agent/upstream"

export const runtime = 'nodejs'
export const maxDuration = 120

const AGENT_URL = process.env.AGENT_URL || process.env.NEXT_PUBLIC_AGENT_URL || "https://api.aimarketingsite.com"

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSessionUser(request, "video_generation")
    if ("response" in auth) {
      return auth.response
    }

    const body = await request.json()

    const res = await fetchVideoAgentUpstream(
      `${AGENT_URL}/video-agent/scene/regenerate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...body,
          user_id: auth.user.id,
          user_email: auth.user.email,
        }),
      },
      {
        label: "video_agent.scene.regenerate",
        timeoutMs: 120_000,
        attempts: 3,
      },
    )

    if (!res.ok) {
      const payload = await readJsonResponse(res)
      return new Response(JSON.stringify({ error: getVideoAgentErrorMessage(payload, "重新生成失败") }), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      })
    }

    const data = await res.json()
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error: any) {
    console.error("Scene regenerate error:", error)
    return new Response(JSON.stringify({ error: error.message || "内部服务器错误" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
