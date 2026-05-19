import { NextRequest } from "next/server"
import {
  handleBillingSubscriptionGet,
  handleBillingSubscriptionPost,
} from "@/modules/billing-kit/server/subscription-route"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  return handleBillingSubscriptionGet(request)
}

export async function POST(request: NextRequest) {
  return handleBillingSubscriptionPost(request)
}
