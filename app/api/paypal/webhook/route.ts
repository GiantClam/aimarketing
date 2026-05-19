import { NextRequest } from "next/server"
import { handlePayPalWebhookPost } from "@/modules/billing-kit/server/paypal-webhook-route"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  return handlePayPalWebhookPost(request)
}
