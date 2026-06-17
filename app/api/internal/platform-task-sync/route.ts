import { NextRequest, NextResponse } from "next/server"

import { syncPlatformTaskRuns } from "@/lib/platform/task-run-sync"

export const runtime = "nodejs"
export const maxDuration = 600

const TASK_SYNC_SECRET = process.env.PLATFORM_TASK_SYNC_SECRET || process.env.CRON_SECRET || ""

function authorizeRequest(request: NextRequest) {
  if (!TASK_SYNC_SECRET) {
    if (process.env.NODE_ENV === "production") {
      return {
        ok: false,
        status: 500,
        error: "platform_task_sync_secret_missing",
      } as const
    }

    return { ok: true } as const
  }

  const authorization = request.headers.get("authorization") || ""
  if (authorization === `Bearer ${TASK_SYNC_SECRET}`) {
    return { ok: true } as const
  }

  return {
    ok: false,
    status: 401,
    error: "unauthorized",
  } as const
}

function parseLimit(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("limit")
  const parsed = Number.parseInt(raw || "", 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined
  return Math.max(1, Math.min(100, parsed))
}

export async function POST(request: NextRequest) {
  const auth = authorizeRequest(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const result = await syncPlatformTaskRuns({
      limit: parseLimit(request),
    })

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "platform_task_sync_failed",
      },
      { status: 500 },
    )
  }
}
