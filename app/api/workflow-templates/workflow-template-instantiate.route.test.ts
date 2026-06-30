import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let currentUser: any = { id: 4, enterpriseId: 19 }
let templateState: any = {
  slug: "campaign-launch",
  title: "Campaign Launch",
  summary: "A reusable launch flow",
  bindingTarget: "campaign-launch",
}
let createArgs: any = null

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "next/server") {
    class TestNextRequest {
      url: string
      headers: Headers

      constructor(url: string | URL, init?: { headers?: HeadersInit }) {
        this.url = String(url)
        this.headers = new Headers(init?.headers)
      }
    }

    return {
      NextRequest: TestNextRequest,
      NextResponse: {
        json: (body: unknown, init?: { status?: number }) => ({
          status: init?.status || 200,
          body,
        }),
      },
    }
  }

  if (request === "@/lib/auth/session") {
    return {
      getSessionUser: async () => currentUser,
    }
  }

  if (request === "@/lib/platform/registry-entry-execution") {
    return {
      getPlatformRegistryEntryExecutionState: async () => templateState,
    }
  }

  if (request === "@/lib/workflows/store") {
    return {
      createWorkflowDefinition: async (args: unknown) => {
        createArgs = args
        return {
          id: 88,
          enterpriseId: 19,
          ownerUserId: 4,
          title: "Campaign Launch",
          slug: "campaign-launch-88",
          status: "draft",
          triggerType: "manual",
          description: "A reusable launch flow",
          metadata: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          nodes: [],
          edges: [],
        }
      },
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let POST: typeof import("./[slug]/instantiate/route").POST

test.before(async () => {
  const route = await import("./[slug]/instantiate/route")
  POST = route.POST
})

test.beforeEach(() => {
  currentUser = { id: 4, enterpriseId: 19 }
  templateState = {
    slug: "campaign-launch",
    title: "Campaign Launch",
    summary: "A reusable launch flow",
    bindingTarget: "campaign-launch",
  }
  createArgs = null
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("instantiate route creates a workflow from a visible template", async () => {
  const response = await POST(
    {
      url: "http://127.0.0.1:3000/api/workflow-templates/campaign-launch/instantiate?locale=en",
      headers: new Headers(),
    } as any,
    { params: Promise.resolve({ slug: "campaign-launch" }) },
  )

  assert.equal((response as any).status, 201)
  assert.equal(createArgs?.enterpriseId, 19)
  assert.equal(createArgs?.ownerUserId, 4)
  assert.equal(createArgs?.title, "Campaign Launch")
  assert.equal(createArgs?.metadata?.sourceTemplateSlug, "campaign-launch")
  assert.equal(Array.isArray(createArgs?.nodes), true)
  assert.equal(createArgs?.nodes.some((node: any) => node.nodeKey === "brand-agent"), true)
})

test("instantiate route rejects missing templates", async () => {
  templateState = null

  const response = await POST(
    {
      url: "http://127.0.0.1:3000/api/workflow-templates/missing/instantiate?locale=en",
      headers: new Headers(),
    } as any,
    { params: Promise.resolve({ slug: "missing" }) },
  )

  assert.equal((response as any).status, 404)
  assert.equal((response as any).body?.error, "workflow_template_not_found")
})
