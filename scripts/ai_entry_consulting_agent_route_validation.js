const fs = require("fs")
const path = require("path")

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return
  const source = fs.readFileSync(filePath, "utf8")
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const separatorIndex = line.indexOf("=")
    if (separatorIndex <= 0) continue
    const key = line.slice(0, separatorIndex).trim()
    if (!key || process.env[key]) continue
    let value = line.slice(separatorIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

function extractCookieHeader(response) {
  const fromUndici =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : []
  const legacyHeader = response.headers.get("set-cookie")
  const rawCookies = fromUndici.length > 0 ? fromUndici : legacyHeader ? [legacyHeader] : []
  if (!rawCookies.length) return ""

  const pairs = []
  for (const rawCookie of rawCookies) {
    const chunks = rawCookie.split(/,(?=[^;]+=[^;]+)/g)
    for (const chunk of chunks) {
      const pair = chunk.trim().split(";")[0]?.trim()
      if (!pair || !pair.includes("=")) continue
      pairs.push(pair)
    }
  }
  return pairs.join("; ")
}

async function requestJson(baseUrl, pathname, options = {}, cookieHeader = "") {
  const timeoutMs = Number.parseInt(
    process.env.AI_ENTRY_ROUTE_VALIDATE_TIMEOUT_MS || "30000",
    10,
  )
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 30000)

  let response
  try {
    response = await fetch(`${baseUrl}${pathname}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }

  const bodyText = await response.text()
  let payload = null
  try {
    payload = bodyText ? JSON.parse(bodyText) : null
  } catch {
    payload = null
  }

  return {
    status: response.status,
    ok: response.ok,
    payload,
    bodyText,
    cookieHeader: extractCookieHeader(response),
  }
}

function consumeSseBuffer(buffer) {
  const blocks = buffer.split(/\r?\n\r?\n/)
  const rest = blocks.pop() ?? ""
  const events = []

  for (const block of blocks) {
    const payload = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n")
      .trim()

    if (!payload || payload === "[DONE]") continue
    try {
      events.push(JSON.parse(payload))
    } catch {
      // ignore parse errors
    }
  }

  return { events, rest }
}

async function waitConversationInitEvent(response) {
  if (!response.body) {
    throw new Error("missing_stream_body")
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  const deadline = Date.now() + Number.parseInt(process.env.AI_ENTRY_ROUTE_VALIDATE_SSE_WAIT_MS || "15000", 10)

  while (Date.now() < deadline) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
    const parsed = consumeSseBuffer(buffer)
    buffer = parsed.rest

    const initEvent = parsed.events.find(
      (event) => event && typeof event === "object" && event.event === "conversation_init",
    )
    if (initEvent) {
      try {
        await reader.cancel()
      } catch {
        // ignore cancel errors
      }
      return initEvent
    }

    if (done) break
  }

  try {
    await reader.cancel()
  } catch {
    // ignore cancel errors
  }
  throw new Error("conversation_init_event_timeout")
}

async function requestConversationInit(baseUrl, cookieHeader, body) {
  const controller = new AbortController()
  const response = await fetch(`${baseUrl}/api/ai/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    body: JSON.stringify({
      stream: true,
      ...body,
    }),
    signal: controller.signal,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new Error(`chat_http_${response.status}:${text.slice(0, 300)}`)
  }

  const initEvent = await waitConversationInitEvent(response)
  controller.abort()
  return initEvent
}

function assertRoute(result, expectedAgentId) {
  const actualAgentId = typeof result?.agentId === "string" ? result.agentId.trim() : ""
  if (actualAgentId !== expectedAgentId) {
    throw new Error(`agent_mismatch expected=${expectedAgentId} actual=${actualAgentId}`)
  }
}

async function run() {
  loadDotEnv(path.resolve(process.cwd(), ".env"))

  const baseUrl = (process.env.BASE_URL || process.env.TEST_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/u, "")

  let cookieHeader = process.env.AI_ENTRY_TEST_COOKIE || ""
  if (!cookieHeader) {
    const demoRes = await requestJson(baseUrl, "/api/auth/demo", { method: "POST" })
    if (!demoRes.ok) {
      throw new Error(`auth_demo_failed:${demoRes.status}:${demoRes.bodyText.slice(0, 200)}`)
    }
    cookieHeader = demoRes.cookieHeader
  }
  if (!cookieHeader) {
    throw new Error("missing_auth_cookie")
  }

  const prompts = [
    { name: "brand", prompt: "我们要做品牌定位和价值主张重构，给我叙事框架。", expectedAgentId: "executive-brand" },
    { name: "growth", prompt: "请做增长漏斗诊断，给30天实验排期。", expectedAgentId: "executive-growth" },
    { name: "legal", prompt: "评估合同条款与劳动合规风险，列出红线。", expectedAgentId: "executive-legal-risk" },
    { name: "fallback", prompt: "帮我想想下一步怎么做", expectedAgentId: "executive-diagnostic" },
  ]

  const results = []
  let conversationId = null

  for (const item of prompts) {
    const initEvent = await requestConversationInit(baseUrl, cookieHeader, {
      messages: [{ role: "user", content: item.prompt }],
      ...(conversationId ? { conversationId } : {}),
      agentConfig: { entryMode: "consulting-advisor" },
    })

    const nextConversationId =
      typeof initEvent?.conversation_id === "string" ? initEvent.conversation_id.trim() : ""
    if (nextConversationId) {
      conversationId = nextConversationId
    }

    const route = initEvent?.agent_route || null
    const record = {
      name: item.name,
      prompt: item.prompt,
      expectedAgentId: item.expectedAgentId,
      agentId: typeof initEvent?.agent_id === "string" ? initEvent.agent_id : null,
      routeDecision: route,
      conversationId: conversationId || null,
    }

    assertRoute(record, item.expectedAgentId)
    results.push(record)
  }

  const summary = {
    baseUrl,
    scenario: "consulting-agent-route-validation",
    validatedAt: new Date().toISOString(),
    count: results.length,
    results: results.map((item) => ({
      name: item.name,
      expectedAgentId: item.expectedAgentId,
      agentId: item.agentId,
      confidence: item.routeDecision?.confidence || null,
      score: item.routeDecision?.score || null,
      fallback: item.routeDecision?.fallback || false,
      matchedSignals: Array.isArray(item.routeDecision?.matchedSignals)
        ? item.routeDecision.matchedSignals
        : [],
    })),
  }

  console.log("AI_ENTRY_CONSULTING_ROUTE_VALIDATION_START")
  console.log(JSON.stringify(summary, null, 2))
  console.log("AI_ENTRY_CONSULTING_ROUTE_VALIDATION_END")
}

run().catch((error) => {
  console.error(
    "ai_entry_consulting_agent_route_validation.failed",
    error instanceof Error ? error.message : String(error),
  )
  process.exitCode = 1
})
