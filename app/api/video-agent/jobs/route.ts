import { NextRequest } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import {
  fetchVideoAgentUpstream,
  getVideoAgentErrorMessage,
  readJsonResponse,
} from "@/lib/video-agent/upstream"

const AGENT_URL = process.env.AGENT_URL || process.env.NEXT_PUBLIC_AGENT_URL || "https://api.aimarketingsite.com"

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSessionUser(request, "video_generation")
    if ("response" in auth) {
      return auth.response
    }

    const body = await request.json()

    const response = await fetchVideoAgentUpstream(
      `${AGENT_URL}/jobs`,
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
        label: "video_agent.jobs.create",
        timeoutMs: 120_000,
        attempts: 3,
      },
    )

    if (!response.ok) {
      const payload = await readJsonResponse(response)
      return new Response(JSON.stringify({ error: getVideoAgentErrorMessage(payload, "创建任务失败") }), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      })
    }

    const data = await response.json().catch(() => null)

    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("创建任务错误:", error)
    return new Response(JSON.stringify({ error: "内部服务器错误" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSessionUser(request, "video_generation")
    if ("response" in auth) {
      return auth.response
    }

    const { searchParams } = new URL(request.url)
    const runId = searchParams.get("run_id")

    if (runId) {
      const response = await fetchVideoAgentUpstream(
        `${AGENT_URL}/jobs/${runId}`,
        {
          method: "GET",
        },
        {
          label: "video_agent.jobs.status",
          timeoutMs: 30_000,
          attempts: 3,
        },
      )
      if (!response.ok) {
        const payload = await readJsonResponse(response)
        return new Response(JSON.stringify({ error: getVideoAgentErrorMessage(payload, "查询任务失败") }), {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        })
      }
      const data = await response.json().catch(() => null)
      return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
      })
    }

    return new Response(JSON.stringify({ error: "缺少 run_id 参数" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("查询任务错误:", error)
    return new Response(JSON.stringify({ error: "内部服务器错误" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
