import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { n8nConnections } from "@/lib/db/schema"

export async function GET(req: NextRequest) {
	const userId = Number(req.nextUrl.searchParams.get("userId") || 0)
	if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 })
	const rows = await db.select().from(n8nConnections)
	return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
	try {
		const body = await req.json()
		const { userId, name, baseUrl, apiKey, webhookSecret, isDefault } = body || {}
		if (!userId || !name || !baseUrl) return NextResponse.json({ error: "userId, name, baseUrl required" }, { status: 400 })
		const [row] = await db
			.insert(n8nConnections)
			.values({ userId, name, baseUrl, apiKey, webhookSecret, isDefault: !!isDefault })
			.returning()
		return NextResponse.json(row)
	} catch (e: any) {
		return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 })
	}
}


