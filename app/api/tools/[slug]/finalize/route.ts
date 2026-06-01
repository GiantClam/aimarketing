import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"

import { requireAuthenticatedUser } from "@/lib/auth/session"
import { buildLeadToolFinalize, LeadToolRuntimeError } from "@/lib/lead-tools/runtime"

type ToolRouteContext = {
  params: Promise<{ slug: string }>
}

export async function POST(request: NextRequest, context: ToolRouteContext) {
  const { slug } = await context.params

  try {
    const body = await request.json()
    const user = await requireAuthenticatedUser(request)
    const result = await buildLeadToolFinalize(slug, body, user)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "Invalid request body" }, { status: 400 })
    }

    if (error instanceof LeadToolRuntimeError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Lead tool finalize failed:", error)
    return NextResponse.json({ error: "Failed to queue tool finalize action" }, { status: 500 })
  }
}
