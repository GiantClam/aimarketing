import { NextRequest } from "next/server"

export const runtime = 'nodejs'
export const maxDuration = 600 // 增加到 10 分钟，允许用户长时间不操作

const AGENT_URL = process.env.AGENT_URL || process.env.NEXT_PUBLIC_AGENT_URL || "https://api.aimarketingsite.com"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const action = body.action

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 600000) // 增加到 10 分钟

    try {
      const response = await fetch(`${AGENT_URL}/crewai-chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "text/event-stream",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        return new Response(JSON.stringify({ error: "后端请求失败" }), {
          status: response.status,
          headers: { "Content-Type": "application/json" },
        })
      }

      if (!response.body) {
        return new Response(JSON.stringify({ error: "后端响应为空" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        })
      }

      const upstream = response.body
      const stream = new ReadableStream({
        start(controller) {
          const reader = upstream.getReader()
          const pump = async () => {
            try {
              const { done, value } = await reader.read()
              if (done) {
                controller.close()
                return
              }
              controller.enqueue(value)
              await pump()
            } catch (err) {
              controller.error(err)
            }
          }
          pump()
        },
        cancel() {
          try { controller.abort() } catch {}
        }
      })

      return new Response(stream, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          "Connection": "keep-alive",
          "X-Accel-Buffering": "no",
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
    console.error("CrewAI 聊天代理错误:", error)
    return new Response(JSON.stringify({ error: error.message || "内部服务器错误" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}
