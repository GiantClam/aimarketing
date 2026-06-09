import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let authenticated = true

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "next/server") {
    return {
      NextRequest: class {},
      NextResponse: {
        json: (body: unknown, init?: { status?: number }) => ({
          status: init?.status || 200,
          body,
        }),
      },
    }
  }
  if (request === "@/lib/auth/guards") {
    return {
      requireSessionUser: async () =>
        authenticated
          ? { user: { id: 1, email: "test@example.com" } }
          : { response: { status: 401, body: { error: "Authentication required" } } },
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}

let POST: (request: { formData: () => Promise<FormData> }) => Promise<{ status: number; body: any }>

function buildRequest(file: File) {
  const formData = new FormData()
  formData.set("file", file)
  return {
    formData: async () => formData,
  }
}

test.before(async () => {
  const route = await import("./route")
  POST = route.POST as unknown as typeof POST
})

test.beforeEach(() => {
  authenticated = true
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("extract route returns text attachment payload", async () => {
  const file = new File([Buffer.from("Brief text")], "brief.txt", { type: "text/plain" })
  const response = await POST(buildRequest(file))

  assert.equal(response.status, 200)
  assert.equal(response.body.data.name, "brief.txt")
  assert.equal(response.body.data.mediaType, "text/plain")
  assert.equal(response.body.data.text, "Brief text")
})

test("extract route requires auth", async () => {
  authenticated = false
  const file = new File([Buffer.from("Brief text")], "brief.txt", { type: "text/plain" })
  const response = await POST(buildRequest(file))

  assert.equal(response.status, 401)
})

test("extract route rejects unsupported files", async () => {
  const file = new File([Buffer.from("legacy")], "legacy.doc", { type: "application/msword" })
  const response = await POST(buildRequest(file))

  assert.equal(response.status, 400)
  assert.equal(response.body.error, "unsupported_file_type")
})

