import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/modules/billing-kit/host/auth"
import { listCheckoutPlansForEmail } from "@/lib/billing/catalog"

export async function handleBillingPlansGet(request: NextRequest) {
  const auth = await requireSessionUser(request)
  if ("response" in auth) return auth.response

  return NextResponse.json({
    plans: listCheckoutPlansForEmail(auth.user.email),
  })
}
