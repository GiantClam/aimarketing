import { NextRequest } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"

const AGENT_URL = process.env.AGENT_URL || process.env.NEXT_PUBLIC_AGENT_URL || "https://api.aimarketingsite.com"

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSessionUser(request, "video_generation")
    if ("response" in auth) {
      return auth.response
    }

    const body = await request.json()
    const { action, ...payload } = body

    let endpoint = ""
    switch (action) {
      case "plan":
        endpoint = "/workflow/plan"
        break
      case "keyframes":
        endpoint = "/workflow/keyframes"
        break
      case "confirm":
        endpoint = "/workflow/confirm"
        break
      case "run-clips":
        endpoint = "/workflow/run-clips"
        break
      case "stitch":
        endpoint = "/workflow/stitch"
        break
      case "crew-run":
        endpoint = "/workflow/crew-run"
        break
      default:
        return new Response(JSON.stringify({ error: "未知的操作" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        })
    }

    const response = await fetch(`${AGENT_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...payload,
        user_id: auth.user.id,
        user_email: auth.user.email,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return new Response(JSON.stringify({ error: data.error || "请求失败" }), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      })
    }

    // 如果是 SSE 流（run-clips），直接返回流
    if (action === "run-clips" && request.headers.get("accept") === "text/event-stream") {
      return new Response(response.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      })
    }

    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("工作流代理错误:", error)
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
    const action = searchParams.get("action")

    if (action === "status" && runId) {
      const response = await fetch(`${AGENT_URL}/workflow/crew-status/${runId}`)
      const data = await response.json()
      return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
      })
    }

    return new Response(JSON.stringify({ error: "缺少参数" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    console.error("工作流查询错误:", error)
    return new Response(JSON.stringify({ error: "内部服务器错误" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}

