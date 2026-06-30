import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import {
  createPersonalKnowledgeDataset,
  listPersonalKnowledgeDatasets,
} from "@/lib/knowledge/personal-datasets"
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
    if (!currentUser) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const items = await listPersonalKnowledgeDatasets(currentUser.id)
    return NextResponse.json({ data: { items } })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "personal_knowledge_datasets_failed" },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getSessionUser(request).catch(() => null)
    if (!currentUser) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as {
      name?: unknown
      category?: unknown
      description?: unknown
      metadata?: unknown
    }

    const created = await createPersonalKnowledgeDataset({
      userId: currentUser.id,
      enterpriseId: currentUser.enterpriseId ?? null,
      name: typeof body.name === "string" ? body.name : "",
      category: normalizeScope(body.category),
      description: typeof body.description === "string" ? body.description : null,
      metadata: body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : null,
    })

    return NextResponse.json({ data: created }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "personal_knowledge_dataset_create_failed"
    const status = message === "knowledge_dataset_name_required" ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
