import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { assertEnterpriseWorkspaceUser } from "@/lib/platform/artifact-actions"
import { deletePlatformWorkItem } from "@/lib/platform/task-run-store"

export const runtime = "nodejs"

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ workItemId: string }> },
) {
  try {
    const currentUser = await getSessionUser(request).catch(() => null)
    assertEnterpriseWorkspaceUser(currentUser)

    const { workItemId } = await context.params
    const numericWorkItemId = Number(workItemId)

    if (!Number.isInteger(numericWorkItemId) || numericWorkItemId <= 0) {
      return NextResponse.json({ error: "invalid_work_item_id" }, { status: 400 })
    }

    const deleted = await deletePlatformWorkItem(numericWorkItemId, currentUser.enterpriseId)
    if (!deleted) {
      return NextResponse.json({ error: "work_item_not_found" }, { status: 404 })
    }

    return NextResponse.json({
      data: {
        workItemId: deleted.id,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "delete_work_item_failed"
    const status = message === "authentication_required" ? 401 : message === "enterprise_context_required" ? 403 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
