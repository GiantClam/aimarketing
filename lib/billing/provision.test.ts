import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let getUserAuthPayloadResult: Record<string, unknown> | null = null
let ensureDemoBillingCreditFloorCalls = 0

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "@/lib/enterprise/server") {
    return {
      getUserAuthPayload: async () => getUserAuthPayloadResult,
    }
  }
  if (request === "./default-free-plan" || request === "@/lib/billing/default-free-plan") {
    return {
      ensureDemoBillingCreditFloor: async (user: Record<string, unknown>) => {
        ensureDemoBillingCreditFloorCalls += 1
        return {
          user,
          creditAccount: {
            id: 99,
            balance: 300,
          },
        }
      },
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let provisionDefaultBillingForUserId: typeof import("./provision").provisionDefaultBillingForUserId

test.before(async () => {
  ({ provisionDefaultBillingForUserId } = await import("./provision"))
})

test.beforeEach(() => {
  getUserAuthPayloadResult = null
  ensureDemoBillingCreditFloorCalls = 0
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("provision helper loads auth payload and provisions default billing", async () => {
  getUserAuthPayloadResult = {
    id: 7,
    email: "user@example.com",
    name: "User",
    enterpriseId: 11,
    enterpriseCode: "enterprise",
    enterpriseName: "Enterprise",
    enterpriseRole: "admin",
    enterpriseStatus: "active",
    isDemo: false,
    permissions: {},
  }

  const result = await provisionDefaultBillingForUserId(7) as unknown as {
    user: { id: number }
    creditAccount: { id: number }
  }

  assert.equal(ensureDemoBillingCreditFloorCalls, 1)
  assert.equal(result.creditAccount.id, 99)
  assert.equal(result.user.id, 7)
})

test("provision helper fails when the user no longer exists", async () => {
  await assert.rejects(() => provisionDefaultBillingForUserId(404), /billing_user_not_found/)
  assert.equal(ensureDemoBillingCreditFloorCalls, 0)
})
