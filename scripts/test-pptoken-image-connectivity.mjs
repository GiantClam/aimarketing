import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"

function parseArgs(argv) {
  const result = {}
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue
    const [key, ...rest] = raw.slice(2).split("=")
    result[key] = rest.length > 0 ? rest.join("=") : "true"
  }
  return result
}

function trimText(value) {
  return typeof value === "string" ? value.trim() : ""
}

function buildSafePreview(value, maxLength = 240) {
  if (typeof value !== "string") return null
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
}

function collectImageCandidates(payload) {
  if (!payload || typeof payload !== "object") return []
  const directData = Array.isArray(payload.data) ? payload.data : []
  const nestedData =
    payload.data && typeof payload.data === "object" && Array.isArray(payload.data.data)
      ? payload.data.data
      : []
  return [...directData, ...nestedData].filter((item) => item && typeof item === "object")
}

async function persistFirstImage(payload, label) {
  const candidates = collectImageCandidates(payload)
  const first = candidates[0]
  if (!first || typeof first !== "object") return null

  const b64 = trimText(first.b64_json)
  if (!b64) return null

  const outputPath = path.join(os.tmpdir(), `${label}-${Date.now()}.png`)
  await fs.writeFile(outputPath, Buffer.from(b64, "base64"))
  return outputPath
}

async function runRequest({ label, endpoint, headers, body, timeoutMs }) {
  const startedAt = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error(`${label}_timeout`)), timeoutMs)

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await response.text()
    let parsed = null
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = null
    }

    const imagePath = parsed ? await persistFirstImage(parsed, label) : null
    const candidates = parsed ? collectImageCandidates(parsed) : []

    return {
      label,
      ok: response.ok,
      status: response.status,
      elapsedMs: Date.now() - startedAt,
      imageCount: candidates.length,
      savedImagePath: imagePath,
      topLevelKeys: parsed && typeof parsed === "object" ? Object.keys(parsed) : [],
      errorMessage:
        trimText(parsed?.error) ||
        trimText(parsed?.message) ||
        trimText(parsed?.data?.error?.message) ||
        null,
      bodyPreview: parsed ? null : buildSafePreview(text),
    }
  } finally {
    clearTimeout(timeout)
  }
}

const args = parseArgs(process.argv.slice(2))
const apiKey =
  trimText(process.env.IMAGE_ASSISTANT_PPTOKEN_LOGIN_TOKEN) ||
  trimText(process.env.IMAGE_ASSISTANT_PPTOKEN_API_KEY)
if (!apiKey) {
  throw new Error("Missing IMAGE_ASSISTANT_PPTOKEN_API_KEY or IMAGE_ASSISTANT_PPTOKEN_LOGIN_TOKEN")
}

const baseUrl = trimText(process.env.IMAGE_ASSISTANT_PPTOKEN_BASE_URL) || "https://api.pptoken.cc/v1"
const apiRoot = baseUrl.replace(/\/v1\/?$/, "")
const model =
  trimText(process.env.IMAGE_ASSISTANT_PPTOKEN_MODEL) ||
  trimText(process.env.PPTOKEN_IMAGE_MODEL) ||
  "gpt-image-2"
const prompt =
  trimText(process.env.PPTOKEN_TEST_PROMPT) ||
  "A single red apple on a wooden table, soft studio lighting, photorealistic, clean background."
const savedKeyId = trimText(process.env.IMAGE_ASSISTANT_PPTOKEN_SAVED_KEY_ID) || "2416"
const timeoutSeconds = Number.parseInt(trimText(process.env.PPTOKEN_TEST_TIMEOUT_SECONDS) || "", 10) || 300
const timeoutMs = timeoutSeconds * 1000
const mode = trimText(args.mode || process.env.PPTOKEN_TEST_MODE) || "proxy"

const directEndpoint = `${apiRoot}/v1/images/generations`
const proxyEndpoint = "https://www.pptoken.cc/tool-api/images/generations"

const directBody = {
  model,
  prompt,
  n: 1,
  size: "1024x1024",
  quality: "auto",
  background: "auto",
  output_format: "png",
  moderation: "auto",
}

const proxyBody = {
  manual_key: "",
  saved_key_id: savedKeyId,
  payload: directBody,
}

const headers = {
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
}

console.log(
  JSON.stringify({
    mode,
    host: new URL(apiRoot).host,
    directEndpoint,
    proxyEndpoint,
    model,
    timeoutSeconds,
    savedKeyId,
  }),
)

if (mode === "direct" || mode === "both") {
  const directResult = await runRequest({
    label: "direct",
    endpoint: directEndpoint,
    headers,
    body: directBody,
    timeoutMs,
  })
  console.log(JSON.stringify(directResult))
}

if (mode === "proxy" || mode === "both") {
  const proxyResult = await runRequest({
    label: "proxy",
    endpoint: proxyEndpoint,
    headers,
    body: proxyBody,
    timeoutMs,
  })
  console.log(JSON.stringify(proxyResult))
}
