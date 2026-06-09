import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import { getPlatformRuntimeSnapshot } from "@/lib/platform/runtime"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const auth = await requireSessionUser(request)
  if ("response" in auth) {
    return auth.response
  }

  return NextResponse.json({
    data: getPlatformRuntimeSnapshot(),
  })
}
