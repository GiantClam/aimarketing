import { NextRequest } from "next/server"

import { handleStripeBillingPortalPost } from "@/modules/billing-kit/server/stripe-billing-portal-route"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  return handleStripeBillingPortalPost(request)
}
