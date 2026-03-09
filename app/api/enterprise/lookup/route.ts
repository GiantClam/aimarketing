import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { enterprises } from "@/lib/db/schema"

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code")?.trim().toLowerCase()
    if (!code) {
      return NextResponse.json({ error: "code is required" }, { status: 400 })
    }

    const rows = await db
      .select({ id: enterprises.id, enterpriseCode: enterprises.enterpriseCode, name: enterprises.name })
      .from(enterprises)
      .where(eq(enterprises.enterpriseCode, code))
      .limit(1)

    if (rows.length === 0) {
      return NextResponse.json({ found: false })
    }

    return NextResponse.json({ found: true, enterprise: rows[0] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "lookup failed" }, { status: 500 })
  }
}
