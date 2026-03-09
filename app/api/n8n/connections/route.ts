import { NextResponse } from "next/server"

function disabled() {
  return NextResponse.json({ error: "n8n connection management has been removed" }, { status: 410 })
}

export async function GET() {
  return disabled()
}

export async function POST() {
  return disabled()
}
