import assert from "node:assert/strict"
import { createServer } from "node:http"
import { once } from "node:events"
import { spawn } from "node:child_process"
import test from "node:test"

const scriptPath = `${import.meta.dirname}/test-pptoken-image-connectivity.mjs`

function runConnectivity(baseUrl, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, "--mode=direct"], {
      cwd: `${import.meta.dirname}/..`,
      env: {
        ...process.env,
        IMAGE_ASSISTANT_PPTOKEN_API_KEY: "fixture-pptoken-key",
        IMAGE_ASSISTANT_PPTOKEN_BASE_URL: baseUrl,
        PPTOKEN_TEST_TIMEOUT_SECONDS: "5",
        PPTOKEN_TEST_IMAGE_SIZE: "",
        ...extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk })
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk })
    child.once("error", reject)
    child.once("exit", (code, signal) => resolve({ code, signal, stdout, stderr }))
  })
}

test("PPTOKEN connectivity smoke uses gpt-image-2 at low resolution", async () => {
  let requestBody
  const server = createServer((request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/images/generations") {
      response.writeHead(404)
      response.end()
      return
    }
    let body = ""
    request.setEncoding("utf8")
    request.on("data", (chunk) => { body += chunk })
    request.on("end", () => {
      requestBody = JSON.parse(body)
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify({ data: [{ b64_json: "aW1hZ2U=" }] }))
    })
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const port = server.address().port
  try {
    const result = await runConnectivity(`http://127.0.0.1:${port}/v1`)
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`)
    assert.equal(requestBody.model, "gpt-image-2")
    assert.equal(requestBody.size, "256x256")
    assert.match(result.stdout, /"imageSize":"256x256"/u)
    assert.match(result.stdout, /"success":true/u)
    assert.equal(result.stdout.includes("fixture-pptoken-key"), false)
  } finally {
    server.close()
    await once(server, "close").catch(() => undefined)
  }
})

test("PPTOKEN connectivity smoke fails when the selected model returns an upstream error", async () => {
  const server = createServer((request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/images/generations") {
      response.writeHead(404)
      response.end()
      return
    }
    response.writeHead(401, { "content-type": "application/json" })
    response.end(JSON.stringify({ message: "Invalid token" }))
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const port = server.address().port
  try {
    const result = await runConnectivity(`http://127.0.0.1:${port}/v1`)
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`)
    assert.match(result.stdout, /"success":false/u)
    assert.match(result.stdout, /Invalid token/u)
  } finally {
    server.close()
    await once(server, "close").catch(() => undefined)
  }
})

test("PPTOKEN connectivity smoke requires image data in an otherwise successful response", async () => {
  const server = createServer((request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/images/generations") {
      response.writeHead(404)
      response.end()
      return
    }
    response.writeHead(200, { "content-type": "application/json" })
    response.end(JSON.stringify({ data: [] }))
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const port = server.address().port
  try {
    const result = await runConnectivity(`http://127.0.0.1:${port}/v1`)
    assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`)
    assert.match(result.stdout, /"ok":true/u)
    assert.match(result.stdout, /"schemaOk":false/u)
    assert.match(result.stdout, /"success":false/u)
  } finally {
    server.close()
    await once(server, "close").catch(() => undefined)
  }
})

test("PPTOKEN connectivity smoke rejects unsupported image sizes before requesting", async () => {
  let requestCount = 0
  const server = createServer((request, response) => {
    requestCount += 1
    response.writeHead(500)
    response.end()
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const port = server.address().port
  try {
    const result = await runConnectivity(`http://127.0.0.1:${port}/v1`, { PPTOKEN_TEST_IMAGE_SIZE: "2048x2048" })
    assert.equal(result.code, 1)
    assert.match(`${result.stdout}\n${result.stderr}`, /pptoken_image_size_unsupported:2048x2048/u)
    assert.equal(requestCount, 0)
  } finally {
    server.close()
    await once(server, "close").catch(() => undefined)
  }
})
