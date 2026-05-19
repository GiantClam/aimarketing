import type { BillingKitRequireSessionUser } from "../host/types"

export const requireSessionUser: BillingKitRequireSessionUser = async () => {
  throw new Error("Replace example auth adapter with your app's session guard")
}

