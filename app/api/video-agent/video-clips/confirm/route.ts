import { NextRequest } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import {
  fetchVideoAgentUpstream,
  getVideoAgentErrorMessage,
  readJsonResponse,
} from "@/lib/video-agent/upstream"

export const maxDuration = 300 // 5 分钟

const AGENT_URL = process.env.AGENT_URL || process.env.NEXT_PUBLIC_AGENT_URL || "https://api.aimarketingsite.com"

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSessionUser(request, "video_generation")
    if ("response" in auth) {
      return auth.response
    }

    const body = await request.json()
    const { run_id, confirmed } = body

    if (!run_id) {
      return new Response(JSON.stringify({ error: "缺少 run_id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    if (confirmed !== true) {
      return new Response(JSON.stringify({ error: "需要确认所有视频片段" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    // 调用后端API获取所有视频片段并拼接
    const res = await fetchVideoAgentUpstream(
      `${AGENT_URL}/video-agent/video-clips/confirm`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          run_id: run_id,
          confirmed: confirmed,
          user_id: auth.user.id,
          user_email: auth.user.email,
        }),
      },
      {
        label: "video_agent.video_clips.confirm",
        timeoutMs: 300_000,
        attempts: 3,
      },
    )

    if (!res.ok) {
      const errorData = await readJsonResponse(res)
      return new Response(
        JSON.stringify({
          error: getVideoAgentErrorMessage(errorData, "确认失败"),
        }),
        {
          status: res.status,
          headers: { "Content-Type": "application/json" },
        },
      )
    }

    const data = await res.json()
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error: any) {
    console.error("Video clips confirm error:", error)
    return new Response(JSON.stringify({ error: error.message || "内部服务器错误" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
