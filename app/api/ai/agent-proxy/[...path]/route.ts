import { NextResponse, type NextRequest } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { getAiEntryCurrentProviderConfig } from "@/lib/ai-entry/provider-routing"

// page-agent is an in-browser DOM agent that calls an OpenAI-compatible
// chat/completions endpoint. To avoid leaking provider API keys to the browser,
// page-agent points at this same-origin route; we resolve the active provider
// server-side and pipe the upstream OpenAI response through verbatim. The
// client-supplied apiKey is ignored — auth is the user's session cookie.
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ToolChoiceShape = "flat" | "nested"

type AgentProxyProvider = {
  id: string
  apiKey: string
  baseURL: string
  model: string
  headers?: Record<string, string>
  // How this provider wants a forced named tool_choice serialized:
  //  - "flat":   {type:"function", name:"X"}             (pptoken-style)
  //  - "nested": {type:"function", function:{name:"X"}}  (DeepSeek / OpenAI standard)
  toolChoiceShape: ToolChoiceShape
  // Extra request-body fields to merge for this provider (e.g. DeepSeek thinking).
  extraBody?: Record<string, unknown>
}

function normalizeEnv(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

// DeepSeek is preferred when configured — it supports the forced named
// tool_choice that page-agent emits every step (MiniMax does not). Otherwise
// fall back to the active AI-entry text provider (pptoken/aiberm/crazyroute),
// which wants the flat tool_choice shape.
export function resolveAgentProxyProvider(): AgentProxyProvider | null {
  const dsKey = normalizeEnv(process.env.DEEPSEEK_API_KEY)
  if (dsKey) {
    const thinkingEnabled = normalizeEnv(process.env.DEEPSEEK_THINKING)?.toLowerCase() === "enabled"
    return {
      id: "deepseek",
      apiKey: dsKey,
      baseURL: normalizeEnv(process.env.DEEPSEEK_BASE_URL) || "https://api.deepseek.com",
      model: normalizeEnv(process.env.DEEPSEEK_MODEL) || "deepseek-v4-flash",
      toolChoiceShape: "nested",
      // Disable thinking by default: page-agent already captures reasoning in
      // the AgentOutput reflection fields, and non-thinking is faster and avoids
      // reasoning_content parsing concerns. Set DEEPSEEK_THINKING=enabled to opt in.
      ...(thinkingEnabled ? {} : { extraBody: { thinking: { type: "disabled" } } }),
    }
  }

  const current = getAiEntryCurrentProviderConfig()
  if (!current || !current.apiKey || !current.baseURL) return null
  return { ...current, toolChoiceShape: "flat" }
}

// Normalizes a forced named tool_choice to the shape the provider expects.
// page-agent emits the nested OpenAI shape; pptoken wants the flat shape, while
// DeepSeek / OpenAI want the nested shape. Non-named choices (strings such as
// "auto" / "required" / "none") are passed through untouched.
export function normalizeToolChoice(choice: unknown, shape: ToolChoiceShape): unknown {
  if (!choice || typeof choice !== "object") return choice
  const c = choice as { type?: string; name?: unknown; function?: { name?: unknown } }
  if (c.type !== "function") return choice

  if (shape === "flat") {
    if (!c.name && c.function && typeof c.function.name === "string") {
      return { type: "function", name: c.function.name }
    }
    return choice
  }

  // nested
  if (!c.function && typeof c.name === "string") {
    return { type: "function", function: { name: c.name } }
  }
  return choice
}

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
