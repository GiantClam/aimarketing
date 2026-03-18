import { NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth/session"

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    return NextResponse.json(
      { error: "datasets_pull_disabled" },
      { status: 403 },
    )
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "failed" }, { status: 500 })
  }
}
