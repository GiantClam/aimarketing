import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"

export const runtime = "nodejs"
export const maxDuration = 60

function isBlockedHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase()
  if (!normalized) return true
  if (normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1") return true
  if (normalized.startsWith("10.") || normalized.startsWith("192.168.")) return true
  const private172 = normalized.match(/^172\.(\d+)\./)
  if (private172) {
    const segment = Number.parseInt(private172[1] || "", 10)
    if (segment >= 16 && segment <= 31) return true
  }
  return false
}

function parseProxyUrl(rawUrl: string | null) {
  if (!rawUrl) return null
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
    if (isBlockedHostname(parsed.hostname)) return null
    return parsed
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSessionUser(req, "image_design_generation")
    if ("response" in auth) {
      return auth.response
    }

    const targetUrl = parseProxyUrl(req.nextUrl.searchParams.get("url"))
    if (!targetUrl) {
      return NextResponse.json({ error: "invalid_asset_url" }, { status: 400 })
    }

    const upstream = await fetch(targetUrl.toString(), {
      cache: "no-store",
      redirect: "follow",
    })

    if (!upstream.ok) {
      return NextResponse.json({ error: "asset_fetch_failed" }, { status: upstream.status })
    }

    const contentType = upstream.headers.get("content-type") || "application/octet-stream"
    const arrayBuffer = await upstream.arrayBuffer()

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=300",
      },
    })
  } catch (error: any) {
    console.error("image-assistant.assets.proxy.error", error)
    return NextResponse.json({ error: error?.message || "asset_proxy_failed" }, { status: 500 })
  }
}
