import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"

import { getSessionUser } from "@/lib/auth/session"
import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(request)
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    return NextResponse.json({ user })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "failed" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const name = String(body?.name || "").trim()

    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }

    await db.update(users).set({ name, updatedAt: new Date() }).where(eq(users.id, currentUser.id))
    const user = await getSessionUser(request)
    return NextResponse.json({ user })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "failed" }, { status: 500 })
  }
}
