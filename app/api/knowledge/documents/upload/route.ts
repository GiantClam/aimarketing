import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { ingestKnowledgeFile } from "@/lib/knowledge/service"
import type { KnowledgeScope } from "@/lib/knowledge/types"

export const runtime = "nodejs"

function normalizeScope(value: string | null): KnowledgeScope {
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

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request).catch(() => null)
    if (!currentUser?.enterpriseId) {
      return NextResponse.json({ error: "enterprise_context_required" }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get("file")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "knowledge_file_required" }, { status: 400 })
    }

    const datasetIdValue = formData.get("datasetId")
    const categoryValue = formData.get("category")
    const created = await ingestKnowledgeFile({
      enterpriseId: currentUser.enterpriseId,
      datasetId:
        typeof datasetIdValue === "string" && datasetIdValue.trim()
          ? Number.parseInt(datasetIdValue, 10)
          : null,
      category: normalizeScope(typeof categoryValue === "string" ? categoryValue : null),
      fileName: file.name,
      contentType: file.type,
      bytes: Buffer.from(await file.arrayBuffer()),
    })

    return NextResponse.json({ data: created })
  } catch (error) {
    const message = error instanceof Error ? error.message : "knowledge_document_upload_failed"
    const status =
      message === "knowledge_source_not_configured" || message === "knowledge_dataset_required" ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
