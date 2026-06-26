import { NextResponse, type NextRequest } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { normalizeToolChoice, resolveAgentProxyProvider } from "@/app/api/ai/agent-proxy/provider"

// page-agent is an in-browser DOM agent that calls an OpenAI-compatible
// chat/completions endpoint. To avoid leaking provider API keys to the browser,
// page-agent points at this same-origin route; we resolve the active provider
// server-side and pipe the upstream OpenAI response through verbatim. The
// client-supplied apiKey is ignored — auth is the user's session cookie.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ChatCompletionsBody = {
  model?: unknown
  messages?: Array<{ role: string; content: string }>
  stream?: boolean
  tool_choice?: unknown
  [key: string]: unknown
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const auth = await requireSessionUser(request)
  if ("response" in auth) return auth.response

  const { path } = await params
  // Accept both ".../chat/completions" and ".../v1/chat/completions".
  const joined = path.join("/")
  if (!joined.endsWith("chat/completions")) {
    return NextResponse.json({ error: "unsupported_path" }, { status: 404 })
  }

  const provider = resolveAgentProxyProvider()
  if (!provider) {
    return NextResponse.json({ error: "no_llm_provider_configured" }, { status: 503 })
  }

  const body = (await request.json().catch(() => null)) as ChatCompletionsBody | null
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: "messages_required" }, { status: 400 })
  }

  // Override the model with the server-configured one (the browser's model id
  // may not be valid for this provider) and normalize tool_choice per provider.
  const upstreamBody: Record<string, unknown> = { ...body, model: provider.model }
  if (body.tool_choice !== undefined) {
    upstreamBody.tool_choice = normalizeToolChoice(body.tool_choice, provider.toolChoiceShape)
  }
  if (provider.extraBody) {
    for (const [key, value] of Object.entries(provider.extraBody)) {
      if (upstreamBody[key] === undefined) upstreamBody[key] = value
    }
  }

  const upstreamUrl = `${provider.baseURL.replace(/\/+$/, "")}/chat/completions`
  const upstream = await fetch(upstreamUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
      ...(provider.headers ?? {}),
    },
    body: JSON.stringify(upstreamBody),
  })

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "")
    return NextResponse.json(
      {
        error: "llm_provider_error",
        status: upstream.status,
        detail: text.slice(0, 1000) || undefined,
      },
      { status: upstream.status >= 400 ? upstream.status : 502 },
    )
  }

  const contentType = upstream.headers.get("content-type") ?? ""

  // Streaming: pipe the upstream OpenAI SSE chunks through untouched.
  if (contentType.includes("text/event-stream")) {
    return new Response(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    })
  }

  // Non-streaming: return the upstream JSON verbatim.
  const data = await upstream.json().catch(() => null)
  return NextResponse.json(data ?? { error: "llm_provider_empty" }, {
    status: data ? 200 : 502,
  })
}
