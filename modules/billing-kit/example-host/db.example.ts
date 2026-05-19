import type { BillingKitDbPool } from "../host/types"

export const pool: BillingKitDbPool = {
  async query() {
    throw new Error("Replace example db adapter with your app's database pool")
  },
  async connect() {
    throw new Error("Replace example db adapter with your app's database client")
  },
}

