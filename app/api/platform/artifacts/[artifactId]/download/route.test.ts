import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let currentUser: any = { id: 7, enterpriseId: 3, enterpriseRole: "admin", enterpriseStatus: "active" }
let artifact: any = null
const originalFetch = globalThis.fetch

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "next/server") {
    class MockNextResponse {
      status: number
      body: unknown
      headers: Headers

      constructor(body: unknown, init?: { status?: number; headers?: HeadersInit }) {
        this.status = init?.status || 200
        this.body = body
        this.headers = new Headers(init?.headers)
      }

      static json(body: unknown, init?: { status?: number; headers?: HeadersInit }) {
        return new MockNextResponse(body, {
          status: init?.status,
          headers: {
            "content-type": "application/json",
            ...(init?.headers ?? {}),
          },
        })
      }
    }

    return {
      NextResponse: MockNextResponse,
    }
  }

  if (request === "@/lib/auth/session") {
    return {
      getSessionUser: async () => currentUser,
    }
  }

  if (request === "@/lib/platform/artifact-actions") {
    return {
      assertArtifactEnterpriseAccess: (_user: unknown, item: unknown) => {
        if (!currentUser) {
          throw new Error("authentication_required")
        }
        if (!item || (item as { enterpriseId?: number }).enterpriseId !== currentUser.enterpriseId) {
          throw new Error("artifact_not_found")
        }
        return item
      },
      resolvePlatformArtifactSourceUrl: (item: { externalUrl?: string | null; storageKey?: string | null }) => item.externalUrl ?? null,
      normalizePlatformArtifactContentType: (contentType: string | null | undefined) => {
        const normalized = typeof contentType === "string" ? contentType.trim() : ""
        if (!normalized) return "application/octet-stream"
        if (normalized.toLowerCase().includes("charset=")) return normalized
        if (normalized.toLowerCase().startsWith("text/")) return `${normalized}; charset=utf-8`
        return normalized
      },
    }
  }

  if (request === "@/lib/platform/task-run-store") {
    return {
      getPlatformArtifact: async () => artifact,
    }
  }

  if (request === "@/lib/platform/minimax-audio") {
    return {
      buildAttachmentContentDisposition: (title: string) => `attachment; filename="${title}"`,
      buildInlineContentDisposition: (title: string) => `inline; filename="${title}"`,
    }
  }

  if (request === "@/lib/utils/binary") {
    return {
      toUint8Array: (value: Uint8Array | Buffer) => new Uint8Array(value),
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let GET: typeof import("./route").GET

test.before(async () => {
  const route = await import("./route")
  GET = route.GET
})

test.beforeEach(() => {
  currentUser = { id: 7, enterpriseId: 3, enterpriseRole: "admin", enterpriseStatus: "active" }
  artifact = {
    id: 145,
    enterpriseId: 3,
    ownerUserId: 7,
    title: "Content Repurpose text output 1",
    kind: "text",
    mimeType: "text/plain",
    storageKey: null,
    externalUrl: null,
    payload: {
      source: "workflow",
      text: "Hello from workflow text output",
    },
  }
})

test.after(() => {
  nodeModule._load = originalLoad
  globalThis.fetch = originalFetch
})

test("artifact download returns payload.text for workflow text artifacts without file storage", async () => {
  const response = await GET(
    new Request("http://localhost:3000/api/platform/artifacts/145/download?download=1") as any,
    { params: Promise.resolve({ artifactId: "145" }) },
  )

  assert.equal((response as any).status, 200)
  assert.equal((response as any).headers.get("content-type"), "text/plain; charset=utf-8")
  assert.equal((response as any).headers.get("content-disposition"), "attachment; filename=\"Content Repurpose text output 1\"")
  assert.equal(Buffer.from((response as any).body as Uint8Array).toString("utf8"), "Hello from workflow text output")
})

test("artifact download normalizes upstream markdown responses to utf-8", async () => {
  artifact = {
    ...artifact,
    kind: "file",
    title: "workflow-input.md",
    mimeType: "text/markdown",
    externalUrl: "https://s.aimarketingsite.com/workflow-inputs/96/workflow-input.md",
    payload: {
      source: "workflow",
    },
  }

  globalThis.fetch = async () =>
    ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/markdown" }),
      body: Buffer.from("# 中文 Markdown", "utf8"),
    }) as any

  const response = await GET(
    new Request("http://localhost:3000/api/platform/artifacts/145/download") as any,
    { params: Promise.resolve({ artifactId: "145" }) },
  )

  assert.equal((response as any).status, 200)
  assert.equal((response as any).headers.get("content-type"), "text/markdown; charset=utf-8")
  assert.equal((response as any).headers.get("content-disposition"), "inline; filename=\"workflow-input.md\"")
})

test("artifact download still reports unavailable when no source or inline content exists", async () => {
  artifact = {
    ...artifact,
    payload: {
      source: "workflow",
    },
  }

  const response = await GET(
    new Request("http://localhost:3000/api/platform/artifacts/145/download") as any,
    { params: Promise.resolve({ artifactId: "145" }) },
  )

  assert.equal((response as any).status, 404)
  assert.deepEqual((response as any).body, { error: "artifact_source_unavailable" })
})
