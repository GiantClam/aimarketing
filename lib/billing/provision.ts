import { getUserAuthPayload } from "@/lib/enterprise/server"

import { ensureDefaultFreeBillingForUser } from "./default-free-plan"

export async function provisionDefaultBillingForUserId(userId: number) {
  const user = await getUserAuthPayload(userId)
  if (!user) {
    throw new Error("billing_user_not_found")
  }

  return ensureDefaultFreeBillingForUser(user)
}
