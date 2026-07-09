import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { requireSessionUser } from "@/lib/auth/guards"
import { exportAiEntryPptDeckArtifact } from "@/lib/ai-entry/ppt-tools"
import { movePlatformArtifactToAssetLibrary } from "@/lib/platform/task-run-store"

export const runtime = "nodejs"
export const maxDuration = 1200

const exportRequestSchema = z.object({
  previewSessionId: z.string().trim().min(1),
  selectedVariantKey: z.string().trim().min(1).nullable().optional(),
  saveToAssets: z.boolean().optional(),
  agentId: z.string().trim().min(1).nullable().optional(),
})

function readErrorMessage(error: unknown) {
  if (error && typeof error === "object") {
    const record = error as { message?: unknown; code?: unknown }
    if (typeof record.message === "string" && record.message.trim()) return record.message
    if (typeof record.code === "string" && record.code.trim()) return record.code
  }
  if (typeof error === "string" && error.trim()) return error
  return "ppt_export_failed"
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSessionUser(request)
    if ("response" in auth) return auth.response

    const parsed = exportRequestSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "invalid_request_body" }, { status: 400 })
    }

    const exported = await exportAiEntryPptDeckArtifact({
      currentUser: auth.user,
      previewSessionId: parsed.data.previewSessionId,
      selectedVariantKey: parsed.data.selectedVariantKey ?? undefined,
      agentId: parsed.data.agentId ?? undefined,
    })

    if (exported.ok === false) {
      return NextResponse.json(exported, { status: 400 })
    }

    let assetLibrary: Record<string, unknown> | null = null
    if (parsed.data.saveToAssets) {
      const artifactId = typeof exported.artifactId === "number" ? exported.artifactId : null
      if (!artifactId) {
        return NextResponse.json(
          {
            ...exported,
            ok: false,
            error: {
              code: "missing_export_artifact",
              message: "PPT export succeeded but no artifact id was returned for asset-library storage.",
            },
          },
          { status: 500 },
        )
      }

      if (!auth.user.enterpriseId) {
        return NextResponse.json({ ok: false, error: "enterprise_context_required" }, { status: 403 })
      }

      const moved = await movePlatformArtifactToAssetLibrary(artifactId, auth.user.enterpriseId)
      if (!moved) {
        return NextResponse.json({ ok: false, error: "artifact_not_found" }, { status: 404 })
      }

      assetLibrary = {
        saved: true,
        href: "/dashboard/assets",
        deletedWorkItemIds: moved.deletedWorkItemIds,
      }
    }

    return NextResponse.json({
      ...exported,
      assetLibrary,
    })
  } catch (error) {
    console.error("AI entry PPT preview export failed:", error)
    return NextResponse.json({ ok: false, error: readErrorMessage(error) }, { status: 500 })
  }
}
