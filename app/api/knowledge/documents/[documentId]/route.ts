import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import {
  getKnowledgeDocumentSnapshot,
  migrateKnowledgeDocumentDataset,
  removeKnowledgeDocument,
} from "@/lib/knowledge/service"

export const runtime = "nodejs"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ documentId: string }> },
) {
  try {
    const currentUser = await getSessionUser(request).catch(() => null)
    if (!currentUser?.enterpriseId) {
      return NextResponse.json({ error: "enterprise_context_required" }, { status: 403 })
    }

    const { documentId } = await context.params
    const detail = await getKnowledgeDocumentSnapshot(Number.parseInt(documentId, 10), currentUser.enterpriseId)
    if (!detail) {
      return NextResponse.json({ error: "knowledge_document_not_found" }, { status: 404 })
    }

    return NextResponse.json({ data: detail })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "knowledge_document_read_failed" },
      { status: 500 },
    )
  }
}

export async function DELETE(
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

    const { documentId } = await context.params
    const deleted = await removeKnowledgeDocument(Number.parseInt(documentId, 10), currentUser.enterpriseId)

    return NextResponse.json({ data: deleted })
  } catch (error) {
    const message = error instanceof Error ? error.message : "knowledge_document_delete_failed"
    const status = message === "knowledge_document_not_found" ? 404 : 500
    return NextResponse.json({ error: message }, { status })
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

    const body = (await request.json().catch(() => ({}))) as { datasetId?: unknown }
    const targetDatasetId =
      typeof body.datasetId === "number"
        ? body.datasetId
        : typeof body.datasetId === "string" && body.datasetId.trim()
          ? Number.parseInt(body.datasetId, 10)
          : NaN
    if (!Number.isInteger(targetDatasetId) || targetDatasetId <= 0) {
      return NextResponse.json({ error: "knowledge_dataset_required" }, { status: 400 })
    }

    const { documentId } = await context.params
    const updated = await migrateKnowledgeDocumentDataset(
      Number.parseInt(documentId, 10),
      currentUser.enterpriseId,
      targetDatasetId,
    )

    return NextResponse.json({ data: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : "knowledge_document_update_failed"
    const status =
      message === "knowledge_document_not_found"
        ? 404
        : message === "knowledge_dataset_required" || message === "knowledge_dataset_not_found"
          ? 400
          : 500
    return NextResponse.json({ error: message }, { status })
  }
}
