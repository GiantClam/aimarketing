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

const SUPPORTED_IMAGE_SIZES = new Set(["256x256", "512x512", "1024x1024", "1536x1024", "1024x1536"])

function resolveImageSize(value) {
  const imageSize = trimText(value) || "256x256"
  if (!SUPPORTED_IMAGE_SIZES.has(imageSize)) {
    throw new Error(`pptoken_image_size_unsupported:${imageSize}`)
  }
  return imageSize
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
      schemaOk: response.ok && candidates.length > 0,
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
  } catch (error) {
    return {
      label,
      ok: false,
      schemaOk: false,
      status: null,
      elapsedMs: Date.now() - startedAt,
      imageCount: 0,
      savedImagePath: null,
      topLevelKeys: [],
      errorCode: trimText(error?.cause?.code) || trimText(error?.code) || "request_failed",
      errorMessage: trimText(error?.message) || "request_failed",
      bodyPreview: null,
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
// The connectivity check intentionally exercises one known image model only.
// Other models shown by the upstream catalog are not part of this smoke path.
const model = "gpt-image-2"
const imageSize = resolveImageSize(process.env.PPTOKEN_TEST_IMAGE_SIZE)
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
  size: imageSize,
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
    imageSize,
    timeoutSeconds,
    savedKeyId,
  }),
)

const results = []

if (mode === "direct" || mode === "both") {
  const directResult = await runRequest({
    label: "direct",
    endpoint: directEndpoint,
    headers,
    body: directBody,
    timeoutMs,
  })
  console.log(JSON.stringify(directResult))
  results.push(directResult)
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
  results.push(proxyResult)
}

const success = results.some((result) => result.schemaOk === true)
console.log(JSON.stringify({ success, attempted: results.length, model, imageSize }))
if (!success) process.exitCode = 1
