import { NextResponse } from "next/server"

function disabled() {
  return NextResponse.json({ error: "Templates feature has been removed" }, { status: 410 })
}

export async function GET() {
  return disabled()
}

export async function PUT() {
  return disabled()
}

export async function DELETE() {
  return disabled()
}
