import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { tasks } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
	const id = Number(params.id)
	if (!id) return NextResponse.json({ error: "invalid id" }, { status: 400 })
	const rows = await db.select().from(tasks).where(eq(tasks.id, id))
	return NextResponse.json(rows[0] || null)
}


