import { NextResponse } from "next/server"

export async function POST() {
  return NextResponse.json({ error: "workflow trigger has been removed" }, { status: 410 })
}
