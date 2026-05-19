import { NextRequest } from "next/server"
import { handleStripeWebhookPost } from "@/modules/billing-kit/server/stripe-webhook-route"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  return handleStripeWebhookPost(request)
}
