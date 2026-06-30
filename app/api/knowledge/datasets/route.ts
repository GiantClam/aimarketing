import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import {
  createKnowledgeDataset,
  listKnowledgeDatasetsGovernanceSnapshot,
  listKnowledgeDatasetsSnapshot,
} from "@/lib/knowledge/service"
import type { KnowledgeScope } from "@/lib/knowledge/types"

export const runtime = "nodejs"

function normalizeScope(value: unknown): KnowledgeScope {
  if (
    value === "brand" ||
    value === "product" ||
    value === "case-study" ||
    value === "compliance" ||
    value === "campaign"
  ) {
    return value
  }
  return "general"
}

export async function GET(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request).catch(() => null)
    if (!currentUser?.enterpriseId) {
      return NextResponse.json({ error: "enterprise_context_required" }, { status: 403 })
    }

    const includeBindings = request.nextUrl?.searchParams?.get("includeBindings") === "1"
    const datasets = includeBindings
      ? await listKnowledgeDatasetsGovernanceSnapshot(currentUser.enterpriseId)
      : await listKnowledgeDatasetsSnapshot(currentUser.enterpriseId)
    return NextResponse.json({ data: { items: datasets } })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "knowledge_datasets_failed" },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request).catch(() => null)
    if (!currentUser?.enterpriseId) {
      return NextResponse.json({ error: "enterprise_context_required" }, { status: 403 })
    }
    if (currentUser.enterpriseRole !== "admin") {
      return NextResponse.json({ error: "admin_required" }, { status: 403 })
    }

    const body = (await request.json().catch(() => ({}))) as {
      name?: unknown
      category?: unknown
      chunkMethod?: unknown
      description?: unknown
    }
    const name = typeof body.name === "string" ? body.name.trim() : ""
    if (!name) {
      return NextResponse.json({ error: "knowledge_dataset_name_required" }, { status: 400 })
    }

    const created = await createKnowledgeDataset({
      enterpriseId: currentUser.enterpriseId,
      name,
      category: normalizeScope(body.category),
      chunkMethod: typeof body.chunkMethod === "string" ? body.chunkMethod : null,
      description: typeof body.description === "string" ? body.description : null,
    })

    return NextResponse.json({ data: created })
  } catch (error) {
    const message = error instanceof Error ? error.message : "knowledge_dataset_create_failed"
    const status =
      message === "knowledge_dataset_name_required" || message === "knowledge_source_not_configured"
        ? 400
        : 500
    return NextResponse.json({ error: message }, { status })
  }
}
