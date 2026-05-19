import { NextRequest } from "next/server"
import { handleProviderCheckoutPost } from "@/modules/billing-kit/server/provider-checkout-route"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  return handleProviderCheckoutPost(request, "paypal")
}
