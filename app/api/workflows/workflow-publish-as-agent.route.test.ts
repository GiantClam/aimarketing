import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let currentUser: any = { id: 4, enterpriseId: 19 }
let publishArgs: any = null

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "next/server") {
    return {
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

  if (request === "@/lib/platform/custom-agents") {
    return {
      publishWorkflowAsCustomAgent: async (args: unknown) => {
        publishArgs = args
        return { id: 41, linkedWorkflowId: 15 }
      },
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let POST: typeof import("./[workflowId]/publish-as-agent/route").POST

test.before(async () => {
  const route = await import("./[workflowId]/publish-as-agent/route")
  POST = route.POST
})

test.beforeEach(() => {
  currentUser = { id: 4, enterpriseId: 19 }
  publishArgs = null
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("publish-as-agent route creates an agent from workflow", async () => {
  const response = await POST(
    {
      json: async () => ({
        name: "Sales Discovery Agent",
        summary: "Workflow-backed agent",
        systemPrompt: "Guide discovery calls",
        visibility: "shared",
      }),
    } as any,
    { params: Promise.resolve({ workflowId: "15" }) },
  )

  assert.equal((response as any).status, 201)
  assert.deepEqual(publishArgs, {
    workflowId: 15,
    enterpriseId: 19,
    ownerUserId: 4,
    name: "Sales Discovery Agent",
    summary: "Workflow-backed agent",
    systemPrompt: "Guide discovery calls",
    visibility: "shared",
  })
  assert.equal((response as any).body?.data?.id, 41)
})

test("publish-as-agent rejects invalid workflow ids", async () => {
  const response = await POST(
    { json: async () => ({ name: "x" }) } as any,
    { params: Promise.resolve({ workflowId: "abc" }) },
  )

  assert.equal((response as any).status, 400)
  assert.equal((response as any).body?.error, "invalid_workflow_id")
})
