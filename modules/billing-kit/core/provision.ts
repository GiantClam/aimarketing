import { getUserAuthPayload } from "@/modules/billing-kit/host/enterprise"

import { ensureDemoBillingCreditFloor } from "./default-free-plan"

export async function provisionDefaultBillingForUserId(userId: number) {
  const user = await getUserAuthPayload(userId)
  if (!user) {
    throw new Error("billing_user_not_found")
  }

  return ensureDemoBillingCreditFloor(user)
}
