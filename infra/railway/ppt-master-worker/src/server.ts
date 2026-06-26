import { createServer } from "node:http"

import { routeRequest } from "./routes.js"

async function readBody(req: import("node:http").IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let data = ""
    req.setEncoding("utf8")
    req.on("data", (chunk) => {
      data += chunk
    })
    req.on("end", () => resolve(data))
    req.on("error", reject)
  })
}

const port = Number(process.env.PORT || 8080)

createServer(async (req, res) => {
  try {
    const body = await readBody(req)
    const request = new Request(`http://127.0.0.1:${port}${req.url || "/"}`, {
      method: req.method,
      headers: req.headers as HeadersInit,
      body: body || undefined,
    })

    const response = await routeRequest(request)
    const responseBody = await response.text()
    const responseHeaders: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value
    })

    res.writeHead(response.status, responseHeaders)
    res.end(responseBody)
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "worker_server_error"
    res.writeHead(500, { "content-type": "application/json" })
    res.end(JSON.stringify({ message }))
  }
}).listen(port)
