import { NextRequest } from "next/server"
import { handlePayPalBrowserSafeClientTokenPost } from "@/modules/billing-kit/server/paypal-browser-safe-client-token-route"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  return handlePayPalBrowserSafeClientTokenPost(request)
}
