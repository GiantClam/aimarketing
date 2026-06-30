import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let currentUser: any = {
  id: 21,
  enterpriseId: 8,
  enterpriseRole: "admin",
  enterpriseStatus: "active",
}
let updateArgs: any = null
let getArgs: any = null
let getResult: any = { id: 5, name: "Launch Agent" }

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
      getCustomAgentForUser: async (args: unknown) => {
        getArgs = args
        return getResult
      },
      updateCustomAgent: async (args: unknown) => {
        updateArgs = args
        return { id: 5, name: "Launch Agent", status: "draft" }
      },
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let GET: typeof import("./route").GET
let PATCH: typeof import("./route").PATCH

test.before(async () => {
  const route = await import("./route")
  GET = route.GET
  PATCH = route.PATCH
})

test.beforeEach(() => {
  currentUser = { id: 21, enterpriseId: 8, enterpriseRole: "admin", enterpriseStatus: "active" }
  updateArgs = null
  getArgs = null
  getResult = { id: 5, name: "Launch Agent" }
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("custom agent GET forwards enterprise member scope and returns detail", async () => {
  currentUser = { id: 31, enterpriseId: 8, enterpriseRole: "member", enterpriseStatus: "active" }

  const response = await GET({} as any, { params: Promise.resolve({ agentId: "5" }) })

  assert.equal((response as any).status, 200)
  assert.deepEqual(getArgs, {
    agentId: 5,
    enterpriseId: 8,
    userId: 31,
    isEnterpriseAdmin: false,
  })
  assert.equal((response as any).body?.data?.id, 5)
})

test("custom agent GET returns not found when agent is not visible to current user", async () => {
  currentUser = { id: 31, enterpriseId: 8, enterpriseRole: "member", enterpriseStatus: "active" }
  getResult = null

  const response = await GET({} as any, { params: Promise.resolve({ agentId: "5" }) })

  assert.equal((response as any).status, 404)
  assert.equal((response as any).body?.error, "custom_agent_not_found")
})

test("custom agent PATCH forwards metadata updates for saved test records", async () => {
  const response = await PATCH(
    {
      json: async () => ({
        metadata: {
          menuExposure: true,
          visibilityPolicy: {
            publicVisible: false,
            workspaceVisible: true,
            bindingTarget: "agent-platform",
            bindingMode: "existing_runtime",
          },
          recentTestRecords: [
            {
              id: "test-1",
              mode: "direct_agent",
              prompt: "Give me a launch outline",
              status: "succeeded",
              resultSummary: "Structured launch outline returned",
              createdAt: "2026-06-30T08:00:00.000Z",
            },
          ],
        },
      }),
    } as any,
    { params: Promise.resolve({ agentId: "5" }) },
  )

  assert.equal((response as any).status, 200)
  assert.deepEqual(updateArgs, {
    agentId: 5,
    enterpriseId: 8,
    actorUserId: 21,
    isEnterpriseAdmin: true,
    linkedWorkflowId: undefined,
    name: undefined,
    summary: undefined,
    systemPrompt: undefined,
    systemPromptSummary: undefined,
    goal: undefined,
    scope: undefined,
    guardrails: undefined,
    defaultOutputType: undefined,
    runtimeModelOptions: undefined,
    knowledgeBindings: undefined,
    knowledgeRetrievalPolicy: undefined,
    toolBindings: undefined,
    skillBindings: undefined,
    mcpBindings: undefined,
    artifactKinds: undefined,
    visibility: undefined,
    metadata: {
      menuExposure: true,
      visibilityPolicy: {
        publicVisible: false,
        workspaceVisible: true,
        bindingTarget: "agent-platform",
        bindingMode: "existing_runtime",
      },
      recentTestRecords: [
        {
          id: "test-1",
          mode: "direct_agent",
          prompt: "Give me a launch outline",
          status: "succeeded",
          resultSummary: "Structured launch outline returned",
          createdAt: "2026-06-30T08:00:00.000Z",
        },
      ],
    },
  })
})

test("custom agent PATCH forwards linked workflow binding updates", async () => {
  const response = await PATCH(
    {
      json: async () => ({
        linkedWorkflowId: 12,
        summary: "Workflow-backed launch agent",
      }),
    } as any,
    { params: Promise.resolve({ agentId: "5" }) },
  )

  assert.equal((response as any).status, 200)
  assert.equal(updateArgs?.agentId, 5)
  assert.equal(updateArgs?.enterpriseId, 8)
  assert.equal(updateArgs?.linkedWorkflowId, 12)
  assert.equal(updateArgs?.summary, "Workflow-backed launch agent")
})

test("custom agent PATCH allows unbinding the linked workflow back to direct mode", async () => {
  const response = await PATCH(
    {
      json: async () => ({
        linkedWorkflowId: null,
      }),
    } as any,
    { params: Promise.resolve({ agentId: "5" }) },
  )

  assert.equal((response as any).status, 200)
  assert.equal(updateArgs?.linkedWorkflowId, null)
})
