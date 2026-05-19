import { NextRequest } from "next/server"
import { handleBillingPlansGet } from "@/modules/billing-kit/server/plans-route"

export async function GET(request: NextRequest) {
  return handleBillingPlansGet(request)
}
