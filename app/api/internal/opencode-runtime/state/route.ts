import { NextRequest, NextResponse } from "next/server"

import { recordAiEntryRuntimeProjectSnapshot } from "@/lib/ai-entry/repository"
import { isValidRuntimeProjectSnapshot } from "@/lib/ai-runtime/contracts"
import {
  appendRailwayOpenCodeRuntimeEvent,
  getOpenCodeRuntimeRunByRuntimeId,
  getRailwayOpenCodeRuntimeState,
  updateRailwayOpenCodeRuntimeState,
  type OpenCodeRuntimeRunStatus,
} from "@/lib/platform/opencode-runtime-store"
import { getPlatformTaskRun } from "@/lib/platform/task-run-store"

function authorized(request: NextRequest) {
  const expected = process.env.RUNTIME_STATE_TOKEN?.trim() || process.env.OPENCODE_RUNTIME_STATE_TOKEN?.trim() || ""
  return Boolean(expected) && request.headers.get("authorization") === `Bearer ${expected}`
}

function validRunId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f-]{36}$/iu.test(value)
}

function validStatus(value: unknown): value is OpenCodeRuntimeRunStatus {
  return value === "queued" || value === "running" || value === "waiting" || value === "succeeded" || value === "failed" || value === "cancelled" || value === "timed_out"
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "runtime_state_unauthorized" }, { status: 401 })
  let payload: { runId?: unknown; status?: unknown; event?: unknown; error?: unknown }
  try { payload = await request.json() as typeof payload } catch { return NextResponse.json({ error: "runtime_state_invalid_json" }, { status: 400 }) }
  if (!validRunId(payload.runId)) return NextResponse.json({ error: "runtime_state_run_id_invalid" }, { status: 400 })
  if (payload.status !== undefined && !validStatus(payload.status)) return NextResponse.json({ error: "runtime_state_status_invalid" }, { status: 400 })
  const status = payload.status as OpenCodeRuntimeRunStatus | undefined
  if (payload.event !== undefined && (!payload.event || typeof payload.event !== "object" || Array.isArray(payload.event))) return NextResponse.json({ error: "runtime_state_event_invalid" }, { status: 400 })
  try {
    if (!payload.event) {
      const state = await updateRailwayOpenCodeRuntimeState(payload.runId, { status, error: typeof payload.error === "string" ? payload.error : payload.error === null ? null : undefined })
      return NextResponse.json({ ok: true, state })
    }
    const state = await appendRailwayOpenCodeRuntimeEvent({
      runtimeRunId: payload.runId,
      event: payload.event as Record<string, unknown>,
      status,
      error: typeof payload.error === "string" ? payload.error : payload.error === null ? null : undefined,
    })
    const checkpoint = (payload.event as Record<string, unknown>).checkpoint
    const projectSnapshot = checkpoint && typeof checkpoint === "object" && !Array.isArray(checkpoint)
      ? (checkpoint as Record<string, unknown>).projectSnapshot
      : null
    if (isValidRuntimeProjectSnapshot(projectSnapshot)) {
      const runtimeRun = await getOpenCodeRuntimeRunByRuntimeId(payload.runId)
      const platformRun = runtimeRun ? await getPlatformTaskRun(runtimeRun.taskRunId) : null
      if (runtimeRun?.conversationId && platformRun) {
        await recordAiEntryRuntimeProjectSnapshot({
          userId: platformRun.userId,
          conversationId: runtimeRun.conversationId,
          projectSnapshot,
          scope: "chat",
          agentId: runtimeRun.agentId,
        }).catch((error) => {
          console.warn("opencode-runtime.project_snapshot.persist_failed", {
            runId: payload.runId,
            conversationId: runtimeRun.conversationId,
            message: error instanceof Error ? error.message : String(error),
          })
        })
      }
    }
    return NextResponse.json({ ok: true, state })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "runtime_state_write_failed" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "runtime_state_unauthorized" }, { status: 401 })
  const runId = request.nextUrl.searchParams.get("runId")
  const after = Number.parseInt(request.nextUrl.searchParams.get("after") || "0", 10)
  if (!validRunId(runId)) return NextResponse.json({ error: "runtime_state_run_id_invalid" }, { status: 400 })
  const state = await getRailwayOpenCodeRuntimeState(runId, Number.isFinite(after) ? after : 0)
  if (!state) return NextResponse.json({ error: "run_not_found" }, { status: 404 })
  return NextResponse.json(state)
}
