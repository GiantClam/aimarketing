#!/usr/bin/env node

function parseArgs(argv) {
  const args = new Map()
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index]
    const value = argv[index + 1]
    if (!key.startsWith("--")) continue
    args.set(key.slice(2), value && !value.startsWith("--") ? value : "true")
    if (value && !value.startsWith("--")) index += 1
  }
  return args
}

async function login(baseUrl, email, password) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    redirect: "manual",
  })
  if (!response.ok && response.status !== 302) {
    throw new Error(`login_failed_${response.status}`)
  }
  const cookies = response.headers.getSetCookie?.() || []
  const fallbackCookie = response.headers.get("set-cookie")
  return (cookies.length ? cookies : fallbackCookie ? [fallbackCookie] : [])
    .map((item) => item.split(";")[0])
    .join("; ")
}

async function runScenario(baseUrl, cookie, scenario) {
  const response = await fetch(`${baseUrl}/api/ai/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify(scenario.body),
  })
  if (!response.ok || !response.body) {
    const raw = await response.text().catch(() => "")
    throw new Error(`${scenario.name}_failed_${response.status}:${raw.slice(0, 160)}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const startedAt = Date.now()
  const events = []
  const sources = []
  let firstTokenMs = null
  let answer = ""
  let provider = null
  let providerModel = null
  let buffer = ""

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split("\n\n")
    buffer = chunks.pop() || ""
    for (const chunk of chunks) {
      const line = chunk.split("\n").find((item) => item.startsWith("data: "))
      if (!line) continue
      const event = JSON.parse(line.slice(6))
      events.push(event.event)
      if (event.event === "provider_selected" || event.event === "provider_fallback") {
        provider = event.provider || provider
        providerModel = event.provider_model || providerModel
      }
      if (event.event === "tool_result" && Array.isArray(event.data?.result?.results)) {
        for (const item of event.data.result.results) {
          if (item?.url) sources.push(item.url)
        }
      }
      if (event.event === "message" && typeof event.answer === "string") {
        if (firstTokenMs === null) firstTokenMs = Date.now() - startedAt
        answer += event.answer
      }
      if (event.event === "message_end" && typeof event.answer === "string") {
        answer = event.answer
        provider = event.provider || provider
        providerModel = event.provider_model || providerModel
      }
    }
  }

  return {
    name: scenario.name,
    provider,
    providerModel,
    firstTokenMs,
    totalMs: Date.now() - startedAt,
    answerChars: answer.length,
    hasKnowledgeQuery: events.includes("knowledge_query_start"),
    hasWebSearch: events.includes("tool_call") || events.includes("tool_result"),
    sourceCount: sources.length,
    answerSample: answer.slice(0, 220).replace(/\s+/g, " "),
  }
}

async function main() {
  const args = parseArgs(process.argv)
  const baseUrl = (args.get("base-url") || process.env.AI_ENTRY_PROBE_BASE_URL || "http://localhost:3018").replace(/\/+$/u, "")
  const email = args.get("email") || process.env.AI_ENTRY_PROBE_EMAIL
  const password = args.get("password") || process.env.AI_ENTRY_PROBE_PASSWORD
  if (!email || !password) {
    throw new Error("Set AI_ENTRY_PROBE_EMAIL and AI_ENTRY_PROBE_PASSWORD, or pass --email and --password.")
  }

  const cookie = await login(baseUrl, email, password)
  const scenarios = [
    {
      name: "normal_chat_no_agent",
      body: {
        stream: true,
        conversationScope: "chat",
        message: "Please give three practical ways to improve B2B marketing email conversion rates.",
      },
    },
    {
      name: "consulting_quality",
      body: {
        stream: true,
        conversationScope: "consulting",
        message: "Deeply analyze why a B2B website receives few inbound leads and rank the priorities.",
        agentConfig: {
          entryMode: "consulting-advisor",
        },
      },
    },
    {
      name: "fresh_info_web_search",
      body: {
        stream: true,
        conversationScope: "chat",
        message: "What are the latest changes in AI search advertising today? Please cite sources.",
      },
    },
  ]

  const results = []
  for (const scenario of scenarios) {
    results.push(await runScenario(baseUrl, cookie, scenario))
  }
  console.table(results)
  console.log(JSON.stringify({ baseUrl, results }, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
