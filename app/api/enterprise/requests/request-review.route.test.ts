import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let selectQueue: any[][] = []
let updates: Array<{ values: Record<string, unknown> }> = []
let upsertPermissionsCalls = 0
let workspaceSnapshot = {
  activeMemberCount: 2,
  seatLimit: 2,
  seatsRemaining: 0,
  effectivePlan: { code: "starter" },
}

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
  if (request === "drizzle-orm") {
    return {
      and: (...args: unknown[]) => args,
      eq: (...args: unknown[]) => args,
    }
  }
  if (request === "@/lib/auth/session") {
    return {
      getSessionUser: async () => ({ id: 7 }),
    }
  }
  if (request === "@/lib/billing/workspace") {
    return {
      getWorkspaceBillingSnapshot: async () => workspaceSnapshot,
      hasAvailableWorkspaceSeat: (snapshot: { activeMemberCount: number; seatLimit: number }) =>
        snapshot.activeMemberCount < snapshot.seatLimit,
    }
  }
  if (request === "@/lib/db") {
    return {
      db: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => selectQueue.shift() || [],
            }),
          }),
        }),
        update: () => ({
          set: (values: Record<string, unknown>) => ({
            where: async () => {
              updates.push({ values })
              return []
            },
          }),
        }),
      },
    }
  }
  if (request === "@/lib/db/schema") {
    return {
      enterpriseJoinRequests: {
        id: "enterpriseJoinRequests.id",
        userId: "enterpriseJoinRequests.userId",
        enterpriseId: "enterpriseJoinRequests.enterpriseId",
        status: "enterpriseJoinRequests.status",
      },
      users: {
        id: "users.id",
        enterpriseId: "users.enterpriseId",
        enterpriseStatus: "users.enterpriseStatus",
      },
    }
  }
  if (request === "@/lib/enterprise/constants") {
    return {
      buildPermissionMap: () => ({ expert_advisor: false }),
    }
  }
  if (request === "@/lib/enterprise/server") {
    return {
      isEnterpriseAdmin: async () => true,
      upsertPermissions: async () => {
        upsertPermissionsCalls += 1
      },
    }
  }
  if (request === "@/lib/server/audit") {
    return {
      logAuditEvent: () => {},
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let POST!: typeof import("./[requestId]/route").POST

test.before(async () => {
  const route = await import("./[requestId]/route")
  POST = route.POST
})

test.beforeEach(() => {
  selectQueue = [
    [{ id: 5, userId: 12, enterpriseId: 11, status: "pending" }],
    [{ enterpriseId: 11 }],
  ]
  updates = []
  upsertPermissionsCalls = 0
  workspaceSnapshot = {
    activeMemberCount: 2,
    seatLimit: 2,
    seatsRemaining: 0,
    effectivePlan: { code: "starter" },
  }
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("enterprise request approval blocks when workspace seats are full", async () => {
  const response = (await POST(
    {
      json: async () => ({ action: "approve" }),
    } as any,
    { params: Promise.resolve({ requestId: "5" }) },
  )) as any

  assert.equal(response.status, 409)
  assert.equal(response.body?.error, "billing_member_limit_reached")
  assert.equal(response.body?.activeMemberCount, 2)
  assert.equal(response.body?.seatLimit, 2)
  assert.equal(response.body?.planCode, "starter")
  assert.equal(updates.length, 0)
  assert.equal(upsertPermissionsCalls, 0)
})
