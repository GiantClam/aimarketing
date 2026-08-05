import { getUserAuthPayload } from "@/modules/billing-kit/host/enterprise"

import { ensureDemoBillingCreditFloor } from "./default-free-plan"

const billingProvisionState = globalThis as typeof globalThis & {
  __billingProvisionPromises__?: Map<number, Promise<Awaited<ReturnType<typeof ensureDemoBillingCreditFloor>>>>
}

const billingProvisionPromises = billingProvisionState.__billingProvisionPromises__ || new Map()
billingProvisionState.__billingProvisionPromises__ = billingProvisionPromises

export async function provisionDefaultBillingForUserId(userId: number) {
  const existing = billingProvisionPromises.get(userId)
  if (existing) return existing

  const next = provisionDefaultBillingForUserIdOnce(userId)
  billingProvisionPromises.set(userId, next)
  try {
    return await next
  } finally {
    if (billingProvisionPromises.get(userId) === next) {
      billingProvisionPromises.delete(userId)
    }
  }
}

async function provisionDefaultBillingForUserIdOnce(userId: number) {
  const user = await getUserAuthPayload(userId)
  if (!user) {
    throw new Error("billing_user_not_found")
  }

  return ensureDemoBillingCreditFloor(user)
}
