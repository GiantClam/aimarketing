import type { BillingKitSessionUser, BillingKitUserLookup } from "../host/types"

export type AuthUserPayload = BillingKitSessionUser

export const getUserAuthPayload: BillingKitUserLookup = async () => {
  throw new Error("Replace example enterprise adapter with your app's user lookup")
}

