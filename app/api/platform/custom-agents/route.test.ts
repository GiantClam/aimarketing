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
let listArgs: any = null
let createArgs: any = null

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
      canManageCustomAgents: () => true,
      listCustomAgentsForUser: async (args: unknown) => {
        listArgs = args
        return [{ id: 3, name: "Launch Agent", status: "draft" }]
      },
      createCustomAgent: async (args: unknown) => {
        createArgs = args
        return { id: 5, name: "Launch Agent", status: "draft" }
      },
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let GET: typeof import("./route").GET
let POST: typeof import("./route").POST

test.before(async () => {
  const route = await import("./route")
  GET = route.GET
  POST = route.POST
})

test.beforeEach(() => {
  currentUser = { id: 21, enterpriseId: 8, enterpriseRole: "admin", enterpriseStatus: "active" }
  listArgs = null
  createArgs = null
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("custom agents GET lists agents for current enterprise user", async () => {
  const response = await GET({} as any)

  assert.equal((response as any).status, 200)
  assert.deepEqual(listArgs, {
    enterpriseId: 8,
    userId: 21,
    isEnterpriseAdmin: true,
  })
  assert.equal((response as any).body?.data?.items?.[0]?.id, 3)
})

test("custom agents POST creates an agent for the current user", async () => {
  const response = await POST({
    json: async () => ({
      name: "Launch Agent",
      summary: "Campaign helper",
      systemPrompt: "Act as a launch specialist",
      linkedWorkflowId: 12,
      visibility: "shared",
      knowledgeBindings: [4, 7],
      knowledgeRetrievalPolicy: {
        retrievalMode: "hybrid",
        maxChunks: 5,
        requiredCitations: true,
        enterpriseDatasetIds: [11, 13],
      },
      artifactKinds: ["brief", "copy"],
      metadata: {
        menuExposure: true,
        visibilityPolicy: {
          publicVisible: false,
          workspaceVisible: true,
          bindingTarget: "campaign-launch",
          bindingMode: "existing_runtime",
        },
      },
    }),
  } as any)

  assert.equal((response as any).status, 201)
  assert.deepEqual(createArgs, {
    enterpriseId: 8,
    ownerUserId: 21,
    sourceAgentId: null,
    linkedWorkflowId: 12,
    name: "Launch Agent",
    summary: "Campaign helper",
    systemPrompt: "Act as a launch specialist",
    systemPromptSummary: null,
    goal: null,
    scope: null,
    guardrails: null,
    defaultOutputType: null,
    runtimeModelOptions: null,
    knowledgeBindings: [4, 7],
    knowledgeRetrievalPolicy: {
      retrievalMode: "hybrid",
      maxChunks: 5,
      requiredCitations: true,
      enterpriseDatasetIds: [11, 13],
    },
    toolBindings: null,
    skillBindings: null,
    mcpBindings: null,
    artifactKinds: ["brief", "copy"],
    visibility: "shared",
    status: "draft",
    metadata: {
      menuExposure: true,
      visibilityPolicy: {
        publicVisible: false,
        workspaceVisible: true,
        bindingTarget: "campaign-launch",
        bindingMode: "existing_runtime",
      },
    },
  })
})

test("custom agents POST lets an enterprise member create a private draft agent for themselves", async () => {
  currentUser = { id: 34, enterpriseId: 8, enterpriseRole: "member", enterpriseStatus: "active" }

  const response = await POST({
    json: async () => ({
      name: "Member Agent",
      summary: "Private helper",
    }),
  } as any)

  assert.equal((response as any).status, 201)
  assert.deepEqual(createArgs, {
    enterpriseId: 8,
    ownerUserId: 34,
    sourceAgentId: null,
    linkedWorkflowId: null,
    name: "Member Agent",
    summary: "Private helper",
    systemPrompt: null,
    systemPromptSummary: null,
    goal: null,
    scope: null,
    guardrails: null,
    defaultOutputType: null,
    runtimeModelOptions: null,
    knowledgeBindings: null,
    knowledgeRetrievalPolicy: null,
    toolBindings: null,
    skillBindings: null,
    mcpBindings: null,
    artifactKinds: null,
    visibility: "private",
    status: "draft",
    metadata: null,
  })
})

test("custom agents routes require enterprise context", async () => {
  currentUser = { id: 21, enterpriseId: null }

  const response = await GET({} as any)
  assert.equal((response as any).status, 403)
})
