const fs = require("fs")
const path = require("path")
const https = require("https")

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

function request(method, url, headers = {}, payload) {
  return new Promise((resolve) => {
    const target = new URL(url)
    const bodyText = payload ? JSON.stringify(payload) : ""
    const req = https.request(
      {
        method,
        hostname: target.hostname,
        path: `${target.pathname}${target.search}`,
        headers: {
          ...headers,
          ...(bodyText
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(bodyText),
              }
            : {}),
        },
      },
      (res) => {
        let responseText = ""
        res.on("data", (chunk) => {
          responseText += chunk.toString("utf8")
        })
        res.on("end", () => {
          resolve({
            status: res.statusCode || 0,
            body: responseText.slice(0, 500),
          })
        })
      },
    )

    req.on("error", (error) => {
      resolve({
        status: 0,
        body: error instanceof Error ? error.message : String(error),
      })
    })

    if (bodyText) {
      req.write(bodyText)
    }
    req.end()
  })
}

function buildOpenRouterHeaders() {
  const apiKey = process.env.OPENROUTER_API_KEY || ""
  const appUrl =
    process.env.OPENROUTER_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost")
  const appName = process.env.OPENROUTER_APP_NAME || "AI Marketing"

  return {
    Authorization: `Bearer ${apiKey}`,
    "HTTP-Referer": appUrl,
    "X-Title": appName,
  }
}

function summarizeResult(name, result) {
  return {
    name,
    status: result.status,
    ok: result.status >= 200 && result.status < 300,
    unauthorized: result.status === 401,
    bodyPreview: result.body,
  }
}

async function verifyOpenRouter() {
  const apiKey = process.env.OPENROUTER_API_KEY || ""
  const baseUrl = (process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, "")
  const textModel = process.env.OPENROUTER_TEXT_MODEL || "google/gemini-3-flash-preview"
  const imageModel = process.env.OPENROUTER_IMAGE_MODEL || "google/gemini-3.1-flash-image-preview"

  if (!apiKey) {
    return [
      {
        name: "openrouter.text",
        status: -1,
        ok: false,
        unauthorized: false,
        bodyPreview: "OPENROUTER_API_KEY is missing",
      },
      {
        name: "openrouter.image",
        status: -1,
        ok: false,
        unauthorized: false,
        bodyPreview: "OPENROUTER_API_KEY is missing",
      },
    ]
  }

  const headers = buildOpenRouterHeaders()
  const textResult = await request(
    "POST",
    `${baseUrl}/chat/completions`,
    headers,
    {
      model: textModel,
      messages: [{ role: "user", content: "Reply with OK only." }],
      max_tokens: 16,
    },
  )
  const imageResult = await request(
    "POST",
    `${baseUrl}/chat/completions`,
    headers,
    {
      model: imageModel,
      modalities: ["image", "text"],
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "Generate a minimal blue banner image, 16:9." }],
        },
      ],
      image_config: {
        aspect_ratio: "16:9",
      },
    },
  )

  return [
    summarizeResult("openrouter.text", textResult),
    summarizeResult("openrouter.image", imageResult),
  ]
}

async function verifyDify() {
  const baseUrl = (process.env.DIFY_DEFAULT_BASE_URL || "").replace(/\/$/, "")
  const brandApiKey = process.env.DIFY_DEFAULT_BRAND_API_KEY || ""
  const growthApiKey = process.env.DIFY_DEFAULT_GROWTH_API_KEY || ""

  if (!baseUrl) {
    return [
      {
        name: "dify.brand.conversations",
        status: -1,
        ok: false,
        unauthorized: false,
        bodyPreview: "DIFY_DEFAULT_BASE_URL is missing",
      },
      {
        name: "dify.growth.conversations",
        status: -1,
        ok: false,
        unauthorized: false,
        bodyPreview: "DIFY_DEFAULT_BASE_URL is missing",
      },
    ]
  }

  const checks = []

  if (!brandApiKey) {
    checks.push({
      name: "dify.brand.conversations",
      status: -1,
      ok: false,
      unauthorized: false,
      bodyPreview: "DIFY_DEFAULT_BRAND_API_KEY is missing",
    })
  } else {
    const brandResult = await request(
      "GET",
      `${baseUrl}/conversations?user=demo@example.com_brand-strategy&limit=1`,
      {
        Authorization: `Bearer ${brandApiKey}`,
      },
    )
    checks.push(summarizeResult("dify.brand.conversations", brandResult))
  }

  if (!growthApiKey) {
    checks.push({
      name: "dify.growth.conversations",
      status: -1,
      ok: false,
      unauthorized: false,
      bodyPreview: "DIFY_DEFAULT_GROWTH_API_KEY is missing",
    })
  } else {
    const growthResult = await request(
      "GET",
      `${baseUrl}/conversations?user=demo@example.com_growth&limit=1`,
      {
        Authorization: `Bearer ${growthApiKey}`,
      },
    )
    checks.push(summarizeResult("dify.growth.conversations", growthResult))
  }

  return checks
}

async function run() {
  loadDotEnv(path.resolve(process.cwd(), ".env"))

  const [openRouterChecks, difyChecks] = await Promise.all([verifyOpenRouter(), verifyDify()])
  const results = [...openRouterChecks, ...difyChecks]

  const hasUnauthorized = results.some((item) => item.unauthorized)
  const hasFailure = results.some((item) => !item.ok)

  console.log(JSON.stringify({ results }, null, 2))

  if (hasUnauthorized) {
    console.error("verify.upstream_credentials.failed: unauthorized_401_detected")
    process.exitCode = 1
    return
  }

  if (hasFailure) {
    console.error("verify.upstream_credentials.failed: non_success_status_detected")
    process.exitCode = 1
    return
  }

  console.log("verify.upstream_credentials.passed")
}

run().catch((error) => {
  console.error(
    JSON.stringify(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  )
  process.exitCode = 1
})
