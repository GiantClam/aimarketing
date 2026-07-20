import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"

import { getSessionUser } from "@/lib/auth/session"
import {
  buildLeadToolPreview,
  LeadToolRuntimeError,
  shouldUseAsyncPptPreview,
  submitLeadToolPptPreviewJob,
} from "@/lib/lead-tools/runtime"

type ToolRouteContext = {
  params: Promise<{ slug: string }>
}

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(request: NextRequest, context: ToolRouteContext) {
  const { slug } = await context.params

  try {
    const body = await request.json()
    const user = await getSessionUser(request).catch(() => null)
    if (shouldUseAsyncPptPreview(slug, body)) {
      const submitted = await submitLeadToolPptPreviewJob(slug, body, user)
      return NextResponse.json({ ...submitted, async: true }, { status: 202 })
    }
    const result = await buildLeadToolPreview(slug, body, user)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "Invalid request body" }, { status: 400 })
    }

    if (error instanceof LeadToolRuntimeError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Lead tool preview failed:", error)
    return NextResponse.json({ error: "Failed to generate tool preview" }, { status: 500 })
  }
}
