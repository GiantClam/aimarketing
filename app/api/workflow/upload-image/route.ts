import { NextRequest } from "next/server"

export const runtime = 'nodejs'
export const maxDuration = 60

const AGENT_URL = process.env.AGENT_URL || process.env.NEXT_PUBLIC_AGENT_URL || "https://api.aimarketingsite.com"

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData()
    const file = form.get("file") as File | null
    if (!file) {
      return new Response(JSON.stringify({ error: "缺少文件" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const forward = new FormData()
    forward.append("file", file)

    const res = await fetch(`${AGENT_URL}/workflow/upload-image`, {
      method: "POST",
      body: forward,
    })

    const data = await res.json().catch(() => ({ error: "上传失败" }))
    if (!res.ok) {
      return new Response(JSON.stringify(data), {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      })
    }

    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error: any) {
    console.error("Upload image proxy error:", error)
    return new Response(JSON.stringify({ error: error?.message || "内部服务器错误" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}

