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
const originalPlatformArtifactBucket = process.env.PLATFORM_ARTIFACT_R2_BUCKET
let r2BucketName = "saleagent"
let r2HeadByBucket: Record<string, { contentType?: string | null } | null> = {}
let r2ObjectByBucket: Record<string, { bytes: Uint8Array; contentType?: string | null } | null> = {}
let r2SignedUrl: string | null = null
let r2HeadCalls: string[] = []
let r2SignedUrlCalls: string[] = []
let r2ObjectCalls: string[] = []

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

      static redirect(url: string, init?: { status?: number; headers?: HeadersInit }) {
        return new MockNextResponse(null, {
          status: init?.status,
          headers: {
            location: url,
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

  if (request === "@/lib/r2") {
    return {
      getR2BucketName: () => r2BucketName,
      getR2SignedUrl: async (_storageKey: string, options?: { bucketName?: string }) => {
        r2SignedUrlCalls.push(options?.bucketName || "")
        return r2SignedUrl
      },
      headR2Object: async (_storageKey: string, options?: { bucketName?: string }) => {
        const bucket = options?.bucketName || ""
        r2HeadCalls.push(bucket)
        return r2HeadByBucket[bucket] ?? null
      },
      getR2Object: async (_storageKey: string, options?: { bucketName?: string }) => {
        const bucket = options?.bucketName || ""
        r2ObjectCalls.push(bucket)
        return r2ObjectByBucket[bucket] ?? null
      },
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
  if (originalPlatformArtifactBucket === undefined) delete process.env.PLATFORM_ARTIFACT_R2_BUCKET
  else process.env.PLATFORM_ARTIFACT_R2_BUCKET = originalPlatformArtifactBucket
  r2BucketName = "saleagent"
  r2HeadByBucket = {}
  r2ObjectByBucket = {}
  r2SignedUrl = null
  r2HeadCalls = []
  r2SignedUrlCalls = []
  r2ObjectCalls = []
  globalThis.fetch = originalFetch
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
  if (originalPlatformArtifactBucket === undefined) delete process.env.PLATFORM_ARTIFACT_R2_BUCKET
  else process.env.PLATFORM_ARTIFACT_R2_BUCKET = originalPlatformArtifactBucket
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

test("artifact download prefers the persisted external URL for runtime files", async () => {
  const externalUrl = "https://s.aimarketingsite.com/platform-artifacts/final-deck.pptx"
  artifact = {
    ...artifact,
    kind: "file",
    title: "final-deck.pptx",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    storageKey: "platform-artifacts/3/145/opencode/final-deck.pptx",
    externalUrl,
    payload: { source: "opencode" },
  }

  let fetchedUrl = ""
  globalThis.fetch = async (input) => {
    fetchedUrl = String(input)
    return {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": artifact.mimeType }),
      body: Buffer.from("pptx-bytes"),
    } as any
  }

  const response = await GET(
    new Request("http://localhost:3000/api/platform/artifacts/145/download?download=1") as any,
    { params: Promise.resolve({ artifactId: "145" }) },
  )

  assert.equal((response as any).status, 200)
  assert.equal(fetchedUrl, externalUrl)
  assert.deepEqual(r2HeadCalls, [])
  assert.equal(Buffer.from((response as any).body as Uint8Array).toString("utf8"), "pptx-bytes")
})

test("artifact download falls back from the runtime bucket to the upload bucket", async () => {
  process.env.PLATFORM_ARTIFACT_R2_BUCKET = "aimarketing-opencode-runtime"
  artifact = {
    ...artifact,
    kind: "file",
    title: "final-deck.pptx",
    mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    storageKey: "platform-artifacts/3/145/opencode/final-deck.pptx",
    payload: { source: "opencode" },
  }
  r2HeadByBucket.saleagent = { contentType: artifact.mimeType }
  r2SignedUrl = "https://signed.example/final-deck.pptx"

  const response = await GET(
    new Request("http://localhost:3000/api/platform/artifacts/145/download?download=1") as any,
    { params: Promise.resolve({ artifactId: "145" }) },
  )

  assert.equal((response as any).status, 307)
  assert.equal((response as any).headers.get("location"), r2SignedUrl)
  assert.deepEqual(r2HeadCalls, ["aimarketing-opencode-runtime", "saleagent"])
  assert.deepEqual(r2SignedUrlCalls, ["saleagent"])
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
