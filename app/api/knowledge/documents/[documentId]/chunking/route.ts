import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { updateKnowledgeDocumentChunking } from "@/lib/knowledge/service"
import type { KnowledgeChunkingConfig } from "@/lib/knowledge/types"

export const runtime = "nodejs"

function normalizeChunkingConfig(body: Record<string, unknown>): KnowledgeChunkingConfig {
  const chunkSize = Number(body.chunkSize)
  const overlap = Number(body.overlap)
  return {
    method: typeof body.method === "string" && body.method.trim() ? body.method.trim() : "general",
    chunkSize: Number.isFinite(chunkSize) && chunkSize > 0 ? Math.round(chunkSize) : 512,
    overlap: Number.isFinite(overlap) && overlap >= 0 ? overlap : 0.1,
    delimiter: typeof body.delimiter === "string" ? body.delimiter : "\\n",
    parser: typeof body.parser === "string" && body.parser.trim() ? body.parser.trim() : null,
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ documentId: string }> },
) {
  try {
    const currentUser = await getSessionUser(request).catch(() => null)
    if (!currentUser?.enterpriseId) {
      return NextResponse.json({ error: "enterprise_context_required" }, { status: 403 })
    }
    if (currentUser.enterpriseRole !== "admin") {
      return NextResponse.json({ error: "admin_required" }, { status: 403 })
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const { documentId } = await context.params
    const document = await updateKnowledgeDocumentChunking(
      Number.parseInt(documentId, 10),
      currentUser.enterpriseId,
      normalizeChunkingConfig(body),
    )

    return NextResponse.json({ data: document })
  } catch (error) {
    const message = error instanceof Error ? error.message : "knowledge_document_chunking_update_failed"
    const status = message === "knowledge_document_not_found" ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
