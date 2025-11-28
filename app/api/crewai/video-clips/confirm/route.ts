import { NextRequest } from "next/server"

export const maxDuration = 300 // 5 分钟

const AGENT_URL = process.env.AGENT_URL || process.env.NEXT_PUBLIC_AGENT_URL || "http://localhost:8000"

export async function POST(request: NextRequest) {
  try {
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
    const res = await fetch(`${AGENT_URL}/crewai/video-clips/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        run_id: run_id,
        confirmed: confirmed,
      }),
    })

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: "确认失败" }))
      return new Response(JSON.stringify(errorData), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      })
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

