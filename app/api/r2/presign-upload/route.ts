import { NextRequest } from "next/server"

export const runtime = 'nodejs'
export const maxDuration = 30

const AGENT_URL = process.env.AGENT_URL || process.env.NEXT_PUBLIC_AGENT_URL || "https://api.aimarketingsite.com"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const res = await fetch(`${AGENT_URL}/tools/r2/presign-upload`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
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

