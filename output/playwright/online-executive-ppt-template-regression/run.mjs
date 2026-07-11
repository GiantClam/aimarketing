import fs from "node:fs"
import path from "node:path"

const BASE_URL = (process.env.BASE_URL || "https://www.aimarketingsite.com").replace(/\/+$/u, "")
const OUT_DIR = path.resolve(
  process.cwd(),
  "output/playwright/online-executive-ppt-template-regression",
  String(Date.now()),
)

const STALE_TEMPLATE_IDS = new Set([
  "auto-4",
  "long-table",
  "neo-grid-bold",
  "swiss-grid",
  "academic-defense",
])

function writeJson(name, value) {
  fs.writeFileSync(path.join(OUT_DIR, name), `${JSON.stringify(value, null, 2)}\n`)
}

function extractCookieHeader(response) {
  const fromUndici =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : []
  const legacyHeader = response.headers.get("set-cookie")
  const rawCookies = fromUndici.length > 0 ? fromUndici : legacyHeader ? [legacyHeader] : []
  const pairs = []

  for (const rawCookie of rawCookies) {
    for (const chunk of rawCookie.split(/,(?=[^;]+=[^;]+)/g)) {
      const pair = chunk.trim().split(";")[0]?.trim()
      if (pair && pair.includes("=")) pairs.push(pair)
    }
  }

  return pairs.join("; ")
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 180000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function login() {
  const response = await fetchWithTimeout(
    `${BASE_URL}/api/auth/demo`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      redirect: "manual",
    },
    30000,
  )
  const body = await response.text().catch(() => "")
  const cookieHeader = extractCookieHeader(response)
  writeJson("00-login.json", {
    status: response.status,
    ok: response.ok,
    hasCookie: Boolean(cookieHeader),
    bodySample: body.slice(0, 500),
  })
  if (!response.ok || !cookieHeader) {
    throw new Error(`demo_login_failed:${response.status}:${body.slice(0, 180)}`)
  }
  return cookieHeader
}

function parseSseChunk(chunk) {
  const dataLines = chunk
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice(6))
  if (dataLines.length === 0) return null
  try {
    return JSON.parse(dataLines.join("\n"))
  } catch {
    return null
  }
}

function pickResultTemplateId(events) {
  for (const event of events) {
    if (event?.event !== "tool_result" && event?.event !== "tool_call_done") continue
    const result = event?.data?.result
    if (typeof result?.selectedTemplateId === "string" && result.selectedTemplateId.trim()) {
      return result.selectedTemplateId.trim()
    }
  }
  return null
}

function collectRecommendedTemplateIds(events) {
  const ids = []
  for (const event of events) {
    if (event?.event !== "tool_result" && event?.event !== "tool_call_done") continue
    const result = event?.data?.result
    const templates = Array.isArray(result?.recommendedTemplates) ? result.recommendedTemplates : []
    for (const item of templates) {
      if (typeof item?.templateId === "string" && item.templateId.trim()) {
        ids.push(item.templateId.trim())
      }
    }
  }
  return [...new Set(ids)]
}

function pickBackgroundTask(events) {
  for (const event of events) {
    if (event?.event !== "tool_result" && event?.event !== "tool_call_done") continue
    const task = event?.data?.result?.backgroundTask
    if (typeof task?.taskId === "string" && task.taskId.trim()) return task
  }
  return null
}

async function runChat(cookieHeader) {
  const body = {
    stream: true,
    conversationScope: "consulting",
    messages: [
      {
        role: "user",
        content:
          "Please generate a Chinese editable PPT preview about Yusuan Intelligence enterprise AI business workspace. Audience: executive leadership. Goal: sales deck and decision sync. Scenario: sales-deck. Language: Chinese. Page count: 4. Directly generate the editable PPT preview.",
      },
    ],
    agentConfig: {
      agentId: "executive-ppt",
      agentName: "Editable PPT Assistant",
      entryMode: "consulting-advisor",
    },
  }
  writeJson("01-chat-request.json", body)

  const response = await fetchWithTimeout(`${BASE_URL}/api/ai/chat`, {
    method: "POST",
    headers: {
      Accept: "text/event-stream",
      "Content-Type": "application/json",
      Cookie: cookieHeader,
    },
    body: JSON.stringify(body),
  })

  if (!response.body) {
    const text = await response.text().catch(() => "")
    throw new Error(`chat_missing_body:${response.status}:${text.slice(0, 200)}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const events = []
  let raw = ""
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const text = decoder.decode(value, { stream: true })
    raw += text
    buffer += text

    const chunks = buffer.split(/\n\n/u)
    buffer = chunks.pop() || ""
    for (const chunk of chunks) {
      const parsed = parseSseChunk(chunk)
      if (parsed) events.push(parsed)
    }
  }

  if (buffer.trim()) {
    const parsed = parseSseChunk(buffer)
    if (parsed) events.push(parsed)
  }

  fs.writeFileSync(path.join(OUT_DIR, "02-raw-sse.txt"), raw)
  writeJson("03-sse-events.json", events)

  const toolResults = events.filter((event) => event?.event === "tool_result")
  const toolDone = events.filter((event) => event?.event === "tool_call_done")
  const messageEnd = [...events].reverse().find((event) => event?.event === "message_end") || null
  const selectedTemplateId = pickResultTemplateId(events)
  const recommendedTemplateIds = collectRecommendedTemplateIds(events)
  const backgroundTask = pickBackgroundTask(events)

  return {
    status: response.status,
    ok: response.ok,
    eventCount: events.length,
    eventNames: [...new Set(events.map((event) => event?.event).filter(Boolean))],
    conversationId:
      typeof messageEnd?.conversation_id === "string"
        ? messageEnd.conversation_id
        : typeof events[0]?.conversation_id === "string"
          ? events[0].conversation_id
          : null,
    provider: messageEnd?.provider || null,
    providerModel: messageEnd?.provider_model || null,
    agentId: messageEnd?.agent_id || null,
    selectedSkills: events.find((event) => event?.event === "conversation_init")?.selected_skills || null,
    toolResultCount: toolResults.length,
    toolDoneCount: toolDone.length,
    toolResult: toolResults.at(-1) || null,
    selectedTemplateId,
    recommendedTemplateIds,
    backgroundTask,
    staleIdsInRawSse: [...STALE_TEMPLATE_IDS].filter((id) => raw.includes(id)),
    hasAuto4InRawSse: raw.includes("auto-4"),
  }
}

async function pollTask(cookieHeader, taskId) {
  const snapshots = []
  const startedAt = Date.now()
  const maxMs = Number.parseInt(process.env.POLL_MAX_MS || "240000", 10)

  while (Date.now() - startedAt < maxMs) {
    const response = await fetchWithTimeout(
      `${BASE_URL}/api/ai/task-runs/status`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookieHeader,
        },
        body: JSON.stringify({ taskRunIds: [taskId] }),
      },
      30000,
    )
    const text = await response.text().catch(() => "")
    let payload = null
    try {
      payload = text ? JSON.parse(text) : null
    } catch {
      payload = { parseError: text.slice(0, 500) }
    }
    const summary = Array.isArray(payload?.data) ? payload.data[0] || null : null
    snapshots.push({ status: response.status, ok: response.ok, payload })
    writeJson(`04-task-poll-${String(snapshots.length).padStart(2, "0")}.json`, {
      status: response.status,
      ok: response.ok,
      payload,
    })

    if (summary?.status === "success" || summary?.status === "failed") break
    await new Promise((resolve) => setTimeout(resolve, 10000))
  }

  const latest = snapshots.at(-1) || null
  const latestSummary = Array.isArray(latest?.payload?.data) ? latest.payload.data[0] || null : null
  return {
    pollCount: snapshots.length,
    latestStatus: latestSummary?.status || null,
    selectedTemplateId: latestSummary?.selected_template_id || null,
    previewSessionId: latestSummary?.preview_session_id || null,
    error: latestSummary?.error || latestSummary?.error_message || null,
    latest: latestSummary,
  }
}

function assertRegression(result) {
  const selectedFromSse = result.chat.selectedTemplateId
  const selectedFromTask = result.task?.selectedTemplateId || null
  const selected = selectedFromSse || selectedFromTask
  const staleHits = new Set(result.chat.staleIdsInRawSse)
  if (selectedFromSse && STALE_TEMPLATE_IDS.has(selectedFromSse)) staleHits.add(selectedFromSse)
  if (selectedFromTask && STALE_TEMPLATE_IDS.has(selectedFromTask)) staleHits.add(selectedFromTask)

  const failures = []
  if (!result.chat.ok) failures.push(`chat_http_${result.chat.status}`)
  if (!result.chat.eventNames.includes("conversation_init")) failures.push("missing_conversation_init")
  if (!result.chat.eventNames.includes("skill_selected")) failures.push("missing_skill_selected")
  if (!result.chat.eventNames.includes("tool_result")) failures.push("missing_tool_result")
  if (!result.chat.backgroundTask?.taskId) failures.push("missing_background_task")
  if (!selected) failures.push("missing_selected_template_id")
  if (selected && !selected.startsWith("ppt169_") && selected !== "ai_ops") {
    failures.push(`selected_template_not_ppt_master:${selected}`)
  }
  if (staleHits.size > 0) failures.push(`stale_template_ids_seen:${[...staleHits].join(",")}`)
  if (result.chat.recommendedTemplateIds.some((id) => STALE_TEMPLATE_IDS.has(id))) {
    failures.push("stale_recommended_template_id")
  }

  return {
    passed: failures.length === 0,
    failures,
    selectedTemplateId: selected,
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const cookieHeader = await login()
  const chat = await runChat(cookieHeader)
  const taskId = chat.backgroundTask?.taskId
  const task = taskId ? await pollTask(cookieHeader, taskId) : null
  const result = {
    baseUrl: BASE_URL,
    outputDir: OUT_DIR,
    chat,
    task,
  }
  const assertion = assertRegression(result)
  const finalResult = { ...result, assertion }
  writeJson("05-result.json", finalResult)
  console.log(JSON.stringify(finalResult, null, 2))
  if (!assertion.passed) {
    process.exitCode = 1
  }
}

main().catch((error) => {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  writeJson("99-error.json", {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null,
  })
  console.error(error)
  process.exit(1)
})
