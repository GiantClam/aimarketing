import { NextRequest } from "next/server"
import { handleStripeConfirmCheckoutSessionPost } from "@/modules/billing-kit/server/stripe-confirm-checkout-session-route"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  return handleStripeConfirmCheckoutSessionPost(request)
}
