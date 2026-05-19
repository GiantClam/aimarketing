import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/modules/billing-kit/host/auth"
import {
  createPayPalBrowserSafeClientToken,
  getPayPalEnv,
  getPayPalWebSdkBase,
  isPayPalSubscriptionEnabledForEmail,
} from "@/lib/billing/paypal"

export async function handlePayPalBrowserSafeClientTokenPost(request: NextRequest) {
  const auth = await requireSessionUser(request)
  if ("response" in auth) return auth.response

  if (!isPayPalSubscriptionEnabledForEmail(auth.user.email)) {
    return NextResponse.json({ error: "paypal_subscriptions_disabled" }, { status: 503 })
  }

  try {
    const clientToken = await createPayPalBrowserSafeClientToken()
    return NextResponse.json({
      clientToken,
      sdkBaseUrl: getPayPalWebSdkBase(getPayPalEnv()),
      env: getPayPalEnv(),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "paypal_browser_safe_client_token_failed" },
      { status: 500 },
    )
  }
}
