import { NextRequest, NextResponse } from "next/server"

import { requireSessionUser } from "@/lib/auth/guards"
import {
  getBusinessWorkbenchState,
  sanitizeBusinessWorkbenchStateInput,
  upsertBusinessWorkbenchState,
} from "@/lib/platform/business-workbench-state"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSessionUser(request)
    if ("response" in auth) return auth.response

    const state = await getBusinessWorkbenchState(auth.user.id)
    return NextResponse.json({ data: state })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "business_workbench_state_read_failed",
      },
      { status: 500 },
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireSessionUser(request)
    if ("response" in auth) return auth.response

    const body = await request.json().catch(() => ({}))
    const state = sanitizeBusinessWorkbenchStateInput(body)
    const updated = await upsertBusinessWorkbenchState(auth.user.id, state)
    return NextResponse.json({ data: updated })
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "business_workbench_state_write_failed",
      },
      { status: 500 },
    )
  }
}
