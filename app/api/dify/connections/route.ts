import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"

import { getSessionUser } from "@/lib/auth/session"
import { db } from "@/lib/db"
import { difyConnections } from "@/lib/db/schema"

export async function GET(req: NextRequest) {
  try {
    const currentUser = await getSessionUser(req)
    if (!currentUser) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const connections = await db
      .select()
      .from(difyConnections)
      .where(eq(difyConnections.userId, currentUser.id))

    return NextResponse.json({ data: connections })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const currentUser = await getSessionUser(req)
    if (!currentUser) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { name, baseUrl, apiKey, isDefault } = body

    if (!name || !baseUrl) {
      return NextResponse.json({ error: "name and baseUrl are required" }, { status: 400 })
    }

    if (isDefault) {
      await db
        .update(difyConnections)
        .set({ isDefault: false })
        .where(eq(difyConnections.userId, currentUser.id))
    }

    const [newConnection] = await db
      .insert(difyConnections)
      .values({
        userId: currentUser.id,
        name,
        baseUrl,
        apiKey: apiKey || "",
        isDefault: Boolean(isDefault),
      })
      .returning()

    return NextResponse.json({ data: newConnection })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
