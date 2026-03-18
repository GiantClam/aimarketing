const fs = require("fs")
const path = require("path")

const REPO_ROOT = path.resolve(__dirname, "..")
const ENV_PATH = path.join(REPO_ROOT, ".env")
const ARTIFACT_DIR = path.join(REPO_ROOT, "artifacts", "openrouter-smoke")

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

function maskKey(value) {
  if (!value) return ""
  if (value.length <= 10) return `${value.slice(0, 3)}***`
  return `${value.slice(0, 7)}***${value.slice(-4)}`
}

function buildHeaders() {
  const apiKey = process.env.OPENROUTER_API_KEY || ""
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is missing")
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  }

  const appUrl =
    process.env.OPENROUTER_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "")
  const appName = process.env.OPENROUTER_APP_NAME || "AI Marketing"

  if (appUrl) {
    headers["HTTP-Referer"] = appUrl
  }
  if (appName) {
    headers["X-Title"] = appName
  }

  return headers
}

function extractText(data) {
  const choice = Array.isArray(data?.choices) ? data.choices[0] : null
  const content = choice?.message?.content

  if (typeof content === "string" && content.trim()) {
    return content.trim()
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part?.text === "string") return part.text
        if (typeof part?.content === "string") return part.content
        return ""
      })
      .join("")
      .trim()

    if (text) return text
  }

  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim()
  }

  return ""
}

function extractImages(data) {
  const choice = Array.isArray(data?.choices) ? data.choices[0] : null
  const images = Array.isArray(choice?.message?.images) ? choice.message.images : []

  return images
    .map((image) => {
      if (typeof image?.image_url?.url === "string" && image.image_url.url.trim()) {
        return image.image_url.url.trim()
      }
      if (typeof image?.imageUrl?.url === "string" && image.imageUrl.url.trim()) {
        return image.imageUrl.url.trim()
      }
      return ""
    })
    .filter(Boolean)
}

async function requestChatCompletions(payload) {
  const baseUrl = (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, "")
  const startedAt = Date.now()
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  })
  const durationMs = Date.now() - startedAt
  const text = await response.text()

  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }

  return {
    ok: response.ok,
    status: response.status,
    durationMs,
    data,
    text,
  }
}

async function run() {
  loadDotEnv(ENV_PATH)

  const textModel = process.env.OPENROUTER_TEXT_MODEL || "google/gemini-3-flash-preview"
  const imageModel = process.env.OPENROUTER_IMAGE_MODEL || "google/gemini-3.1-flash-image-preview"
  const expectedText = "OPENROUTER_TEXT_SMOKE_OK"

  const report = {
    timestamp: new Date().toISOString(),
    baseUrl: (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, ""),
    apiKey: maskKey(process.env.OPENROUTER_API_KEY || ""),
    textModel,
    imageModel,
    expectedText,
    text: null,
    image: null,
  }

  const textResponse = await requestChatCompletions({
    model: textModel,
    messages: [
      {
        role: "system",
        content: "Reply with the exact string from the user and nothing else.",
      },
      {
        role: "user",
        content: expectedText,
      },
    ],
    temperature: 0,
    max_tokens: 24,
  })

  report.text = {
    ok: textResponse.ok,
    status: textResponse.status,
    durationMs: textResponse.durationMs,
    text: extractText(textResponse.data),
    matchedExpectedText: extractText(textResponse.data) === expectedText,
    usage: textResponse.data?.usage || null,
    error: textResponse.ok ? null : textResponse.data?.error || textResponse.text,
  }

  const imageResponse = await requestChatCompletions({
    model: imageModel,
    modalities: ["image", "text"],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Create a simple marketing hero image: blue gradient background, one glowing product box, clean headline space on the left, 16:9 layout.",
          },
        ],
      },
    ],
    image_config: {
      aspect_ratio: "16:9",
    },
  })

  const images = extractImages(imageResponse.data)
  report.image = {
    ok: imageResponse.ok,
    status: imageResponse.status,
    durationMs: imageResponse.durationMs,
    imageCount: images.length,
    firstImagePrefix: images[0] ? images[0].slice(0, 64) : "",
    text: extractText(imageResponse.data),
    usage: imageResponse.data?.usage || null,
    error: imageResponse.ok ? null : imageResponse.data?.error || imageResponse.text,
  }

  fs.mkdirSync(ARTIFACT_DIR, { recursive: true })
  const fileName = `openrouter-smoke-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  const outputPath = path.join(ARTIFACT_DIR, fileName)
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8")

  console.log(JSON.stringify({ outputPath, report }, null, 2))

  if (!report.text.ok || !report.image.ok || !report.text.matchedExpectedText) {
    process.exitCode = 1
  }
}

run().catch((error) => {
  console.error(
    JSON.stringify(
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : null,
      },
      null,
      2,
    ),
  )
  process.exitCode = 1
})
