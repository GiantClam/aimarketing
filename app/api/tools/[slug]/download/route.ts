import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"

import { requireAuthenticatedUser } from "@/lib/auth/session"
import { exportPptVariantToPptx } from "@/lib/lead-tools/pptx-export"
import { buildLeadToolDownload, LeadToolRuntimeError } from "@/lib/lead-tools/runtime"

type ToolRouteContext = {
  params: Promise<{ slug: string }>
}

function toAsciiDownloadFileName(fileName: string) {
  const normalized = fileName
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^[-.\s]+|[-.\s]+$)/g, "")

  if (normalized) {
    return normalized
  }

  return "lead-tool-export.pptx"
}

function buildContentDisposition(fileName: string) {
  const asciiFileName = toAsciiDownloadFileName(fileName)
  const encodedFileName = encodeURIComponent(fileName)

  return `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodedFileName}`
}

export async function POST(request: NextRequest, context: ToolRouteContext) {
  const { slug } = await context.params

  try {
    const body = await request.json()
    const user = await requireAuthenticatedUser(request)
    const result = await buildLeadToolDownload(slug, body, user)
    const artifact =
      "artifact" in result && result.artifact
        ? result.artifact
        : await exportPptVariantToPptx({
            deck: result.deck,
            variant: result.variant,
          })

    return new NextResponse(new Uint8Array(artifact.buffer), {
      status: 200,
      headers: {
        "Content-Type": artifact.contentType,
        "Content-Disposition": buildContentDisposition(artifact.fileName),
      },
    })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "Invalid request body" }, { status: 400 })
    }

    if (error instanceof LeadToolRuntimeError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error("Lead tool download failed:", error)
    return NextResponse.json({ error: "Failed to export tool artifact" }, { status: 500 })
  }
}
