import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { tasks } from "@/lib/db/schema"
import { and, eq } from "drizzle-orm"

export async function GET(req: NextRequest) {
	const userId = Number(req.nextUrl.searchParams.get("userId") || 0)
	if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 })
	const status = req.nextUrl.searchParams.get("status") || undefined
	const where = status ? and(eq(tasks.userId, userId), eq(tasks.status, status)) : eq(tasks.userId, userId)
	const rows = await db.select().from(tasks).where(where).orderBy(tasks.createdAt as any)
	return NextResponse.json(rows)
}


