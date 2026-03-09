import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({ error: "task center has been removed" }, { status: 410 })
}
