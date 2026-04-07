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
      if (!pair) continue
      if (!pair.includes("=")) continue
      pairs.push(pair)
    }
  }

  return pairs.join("; ")
}

async function requestJson(baseUrl, pathname, options = {}, cookieHeader = "") {
  const defaultTimeoutMs = pathname.startsWith("/api/ai/chat") ? 90000 : 15000
  const timeoutMs = Number.parseInt(
    process.env.AI_ENTRY_SMOKE_TIMEOUT_MS || String(defaultTimeoutMs),
    10,
  )
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 15000)

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
  } catch (error) {
    clearTimeout(timeout)
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`request_timeout:${pathname}`)
    }
    throw error
  }
  clearTimeout(timeout)

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

function buildModelCandidates(catalogPayload) {
  const providerId =
    typeof catalogPayload?.providerId === "string" ? catalogPayload.providerId : null
  const models = Array.isArray(catalogPayload?.models) ? catalogPayload.models : []
  const selectedModelId =
    typeof catalogPayload?.selectedModelId === "string"
      ? catalogPayload.selectedModelId
      : null

  if (!providerId) {
    throw new Error("ai_entry_models_missing_provider_id")
  }
  if (models.length === 0) {
    throw new Error("ai_entry_models_empty")
  }

  const dedupe = new Set()
  const candidateIds = []
  const pushCandidate = (value) => {
    if (typeof value !== "string") return
    const modelId = value.trim()
    if (!modelId || dedupe.has(modelId)) return
    dedupe.add(modelId)
    candidateIds.push(modelId)
  }

  pushCandidate(selectedModelId || "")
  for (const item of models) {
    if (candidateIds.length >= 12) break
    pushCandidate(item?.id)
  }

  if (candidateIds.length === 0) {
    throw new Error("ai_entry_models_missing_model_id")
  }

  return { providerId, candidateIds }
}

function shouldTryNextModel(chatRes) {
  if (chatRes.ok) return false
  const rawError =
    typeof chatRes?.payload?.error === "string"
      ? chatRes.payload.error
      : typeof chatRes?.bodyText === "string"
        ? chatRes.bodyText
        : ""

  const normalized = rawError.toLowerCase()
  if (!normalized) return false

  return (
    normalized.includes("not implemented") ||
    normalized.includes("terms of service") ||
    normalized.includes("model not found") ||
    normalized.includes("unsupported model")
  )
}

async function run() {
  loadDotEnv(path.resolve(process.cwd(), ".env"))

  const baseUrl = (process.env.BASE_URL || process.env.TEST_BASE_URL || "http://127.0.0.1:3000").replace(/\/+$/u, "")

  let cookieHeader = process.env.AI_ENTRY_TEST_COOKIE || ""
  if (!cookieHeader) {
    const demoRes = await requestJson(baseUrl, "/api/auth/demo", { method: "POST" })
    if (!demoRes.ok) {
      throw new Error(
        `auth_demo_failed:${demoRes.status}:${demoRes.bodyText.slice(0, 200)}`,
      )
    }
    cookieHeader = demoRes.cookieHeader
  }

  if (!cookieHeader) {
    throw new Error("ai_entry_missing_auth_cookie")
  }

  const modelsRes = await requestJson(baseUrl, "/api/ai/models", { method: "GET" }, cookieHeader)
  if (!modelsRes.ok) {
    throw new Error(`ai_entry_models_failed:${modelsRes.status}:${modelsRes.bodyText.slice(0, 200)}`)
  }

  const modelSelection = buildModelCandidates(modelsRes.payload)
  const attemptErrors = []
  let chosenModelId = null
  let chatRes = null

  for (const modelId of modelSelection.candidateIds) {
    const nextRes = await requestJson(
      baseUrl,
      "/api/ai/chat",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stream: false,
          messages: [{ role: "user", content: "Reply with exactly: smoke test passed." }],
          modelConfig: {
            providerId: modelSelection.providerId,
            modelId,
          },
        }),
      },
      cookieHeader,
    )

    if (nextRes.ok) {
      chatRes = nextRes
      chosenModelId = modelId
      break
    }

    attemptErrors.push({
      modelId,
      status: nextRes.status,
      error:
        typeof nextRes?.payload?.error === "string"
          ? nextRes.payload.error
          : nextRes.bodyText.slice(0, 200),
    })

    if (!shouldTryNextModel(nextRes)) {
      throw new Error(
        `ai_entry_chat_failed:${nextRes.status}:${nextRes.bodyText.slice(0, 500)}`,
      )
    }
  }

  if (!chatRes || !chatRes.ok) {
    throw new Error(
      `ai_entry_chat_failed_all_candidates:${JSON.stringify(attemptErrors).slice(0, 1200)}`,
    )
  }

  const answer = typeof chatRes.payload?.message === "string" ? chatRes.payload.message.trim() : ""
  if (!answer) {
    throw new Error("ai_entry_chat_missing_answer")
  }

  const summary = {
    providerId: chatRes.payload?.provider || modelSelection.providerId,
    providerModel: chatRes.payload?.providerModel || chosenModelId,
    conversationId: chatRes.payload?.conversationId || null,
    fallbackAttemptCount: attemptErrors.length,
    answerPreview: answer.slice(0, 120),
  }

  console.log("AI_ENTRY_MODEL_SELECTION_SMOKE_TEST_START")
  console.log(JSON.stringify(summary, null, 2))
  console.log("AI_ENTRY_MODEL_SELECTION_SMOKE_TEST_END")
}

run().catch((error) => {
  console.error("ai_entry_model_selection_smoke_test.failed", error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})


