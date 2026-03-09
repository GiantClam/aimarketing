import { NextRequest } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"

// 设置运行时配置，避免超时
export const runtime = 'nodejs'
export const maxDuration = 300 // 5 分钟（最大 300 秒）

const AGENT_URL = process.env.AGENT_URL || process.env.NEXT_PUBLIC_AGENT_URL || "https://api.aimarketingsite.com"

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSessionUser(request, "video_generation")
    if ("response" in auth) {
      return auth.response
    }

    const body = await request.json()

    // 代理请求到 CrewAI 后端，使用较长的超时时间
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 300000) // 5 分钟超时

    try {
      const response = await fetch(`${AGENT_URL}/crewai-agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...body,
          user_id: auth.user.id,
          user_email: auth.user.email,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        return new Response(JSON.stringify({ error: "后端请求失败" }), {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        })
      }

      // 检查响应体是否存在
      if (!response.body) {
        return new Response(JSON.stringify({ error: "后端响应为空" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      }

      // 返回 SSE 流，直接传递响应体
      // 使用 passthrough 模式，让 Next.js 直接转发流
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no", // 禁用 Nginx 缓冲
        },
      })
    } catch (fetchError: any) {
      clearTimeout(timeoutId)
      
      if (fetchError.name === 'AbortError') {
        return new Response(JSON.stringify({ error: "请求超时" }), {
          status: 504,
          headers: { "Content-Type": "application/json" },
        })
      }
      throw fetchError
    }
  } catch (error: any) {
    console.error("CrewAI 代理错误:", error)
    return new Response(JSON.stringify({ error: error.message || "内部服务器错误" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
