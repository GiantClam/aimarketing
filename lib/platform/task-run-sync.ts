import { and, desc, eq, inArray } from "drizzle-orm"

import { db } from "@/lib/db"
import { platformTaskRuns } from "@/lib/db/schema"
import { queryMiniMaxAudioTask, type MiniMaxNormalizedTask } from "@/lib/platform/minimax-audio"
import { queryRunningHubTask, type RunningHubTaskResponse } from "@/lib/platform/runninghub"
import { queryRunningHubVideoTask, type RunningHubVideoTask } from "@/lib/platform/runninghub-video"
import { appendPlatformRunEvent, type PlatformTaskRunRecord, type PlatformTaskRunStatus } from "@/lib/platform/task-run-store"

type SyncablePlatformRun = Pick<
  PlatformTaskRunRecord,
  | "id"
  | "enterpriseId"
  | "userId"
  | "kind"
  | "itemSlug"
  | "status"
  | "externalSystem"
  | "externalRunId"
  | "createdAt"
  | "normalizedResult"
>

export type PlatformRunSyncResult = {
  status: "queued" | "running" | "succeeded" | "failed"
  providerStatus: string | null
  results: Array<{ url?: string | null; outputType?: string | null; title?: string | null }>
  raw: Record<string, unknown> | null
}

type PlatformRunSyncSummary = {
  scanned: number
  updated: number
  failed: number
}

type PlatformRunSyncPatch = {
  status?: PlatformTaskRunStatus
  normalizedResult?: Record<string, unknown> | null
  externalSystem?: string | null
  externalRunId?: string | null
  finishedAt?: Date | null
}

type PlatformRunSyncDeps = {
  now?: () => number
  listRuns?: (limit: number) => Promise<SyncablePlatformRun[]>
  appendEvent?: typeof appendPlatformRunEvent
  patchRun?: (runId: number, patch: PlatformRunSyncPatch) => Promise<void>
  queryMiniMaxAudioTask?: typeof queryMiniMaxAudioTask
  queryRunningHubVideoTask?: typeof queryRunningHubVideoTask
  queryRunningHubTask?: typeof queryRunningHubTask
}

function normalizeTaskRunStatus(value: string | null | undefined): PlatformRunSyncResult["status"] {
  const normalized = String(value || "").trim().toUpperCase()
  if (normalized === "SUCCESS" || normalized === "SUCCEEDED") return "succeeded"
  if (normalized === "FAILED" || normalized === "CANCELLED") return "failed"
  if (normalized === "QUEUED" || normalized === "PENDING") return "queued"
  return "running"
}

function normalizeSyncResults(results: unknown): PlatformRunSyncResult["results"] {
  if (!Array.isArray(results)) return []

  return results
    .map((item) => {
      if (!item || typeof item !== "object") return null
      const record = item as Record<string, unknown>
      return {
        url: typeof record.url === "string" ? record.url : null,
        outputType: typeof record.outputType === "string" ? record.outputType : null,
        title: typeof record.title === "string" ? record.title : null,
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
}

function normalizeTaskLikeResult(task: {
  status?: string | null
  results?: unknown
  raw?: Record<string, unknown> | null
}): PlatformRunSyncResult {
  return {
    status: normalizeTaskRunStatus(task.status),
    providerStatus: typeof task.status === "string" ? task.status : null,
    results: normalizeSyncResults(task.results),
    raw: task.raw && typeof task.raw === "object" ? task.raw : null,
  }
}

function normalizeRunningHubQueryResult(query: RunningHubTaskResponse): PlatformRunSyncResult {
  return {
    status: normalizeTaskRunStatus(query.status),
    providerStatus: typeof query.status === "string" ? query.status : null,
    results: normalizeSyncResults(query.results),
    raw: query as Record<string, unknown>,
  }
}

async function listRecentPlatformRuns(limit: number) {
  const rows = await db
    .select({
      id: platformTaskRuns.id,
      enterpriseId: platformTaskRuns.enterpriseId,
      userId: platformTaskRuns.userId,
      kind: platformTaskRuns.kind,
      itemSlug: platformTaskRuns.itemSlug,
      status: platformTaskRuns.status,
      externalSystem: platformTaskRuns.externalSystem,
      externalRunId: platformTaskRuns.externalRunId,
      createdAt: platformTaskRuns.createdAt,
      normalizedResult: platformTaskRuns.normalizedResult,
    })
    .from(platformTaskRuns)
    .where(and(inArray(platformTaskRuns.kind, ["workflow", "media"]), inArray(platformTaskRuns.status, ["queued", "running"])))
    .orderBy(desc(platformTaskRuns.createdAt))
    .limit(limit)

  return rows satisfies SyncablePlatformRun[]
}

async function patchPlatformRunRecord(runId: number, patch: PlatformRunSyncPatch) {
  const nextValues: Partial<typeof platformTaskRuns.$inferInsert> & { updatedAt: Date } = {
    updatedAt: new Date(),
  }

  if (patch.status !== undefined) nextValues.status = patch.status
  if (patch.normalizedResult !== undefined) nextValues.normalizedResult = patch.normalizedResult
  if (patch.externalSystem !== undefined) nextValues.externalSystem = patch.externalSystem
  if (patch.externalRunId !== undefined) nextValues.externalRunId = patch.externalRunId
  if (patch.finishedAt !== undefined) nextValues.finishedAt = patch.finishedAt

  await db.update(platformTaskRuns).set(nextValues).where(eq(platformTaskRuns.id, runId))
}

function buildGenericRunningHubNormalizedResult(run: SyncablePlatformRun, result: PlatformRunSyncResult) {
  const currentNormalizedResult =
    run.normalizedResult && typeof run.normalizedResult === "object" ? (run.normalizedResult as Record<string, unknown>) : {}

  return {
    ...currentNormalizedResult,
    provider: "runninghub",
    status: result.providerStatus,
    results: result.results,
    raw: result.raw,
  }
}

async function appendUnsupportedSyncEvent(run: SyncablePlatformRun, deps: PlatformRunSyncDeps) {
  const appendEvent = deps.appendEvent ?? appendPlatformRunEvent
  await appendEvent(run.id, {
    level: "warn",
    message: "platform_task_sync_unsupported_upstream",
    payload: {
      kind: run.kind,
      itemSlug: run.itemSlug,
      externalSystem: run.externalSystem,
      externalRunId: run.externalRunId,
    },
  })
}

export function isSyncablePlatformRun(run: {
  kind: string
  status: string
  externalSystem: string | null
  externalRunId: string | null
  createdAt: Date | string | null
}) {
  if (run.kind !== "workflow" && run.kind !== "media") return false
  if (run.status !== "queued" && run.status !== "running") return false
  if (!run.externalSystem || !run.externalRunId) return false
  const createdAt = run.createdAt instanceof Date ? run.createdAt : new Date(run.createdAt || 0)
  return Date.now() - createdAt.getTime() <= 24 * 60 * 60 * 1000
}

export async function syncPlatformTaskRuns(
  input: {
    limit?: number
  } = {},
  deps: PlatformRunSyncDeps = {},
): Promise<PlatformRunSyncSummary> {
  const limit = Math.max(1, Math.min(100, input.limit ?? 25))
  const listRuns = deps.listRuns ?? listRecentPlatformRuns
  const patchRun = deps.patchRun ?? patchPlatformRunRecord
  const appendEvent = deps.appendEvent ?? appendPlatformRunEvent
  const minimaxQuery = deps.queryMiniMaxAudioTask ?? queryMiniMaxAudioTask
  const runningHubVideoQuery = deps.queryRunningHubVideoTask ?? queryRunningHubVideoTask
  const runningHubQuery = deps.queryRunningHubTask ?? queryRunningHubTask
  const now = deps.now ?? Date.now

  const runs = await listRuns(limit)
  let scanned = 0
  let updated = 0
  let failed = 0

  for (const run of runs) {
    if (
      !isSyncablePlatformRun({
        kind: run.kind,
        status: run.status,
        externalSystem: run.externalSystem,
        externalRunId: run.externalRunId,
        createdAt: run.createdAt,
      })
    ) {
      continue
    }

    if (now() - new Date(run.createdAt || 0).getTime() > 24 * 60 * 60 * 1000) {
      continue
    }

    scanned += 1

    try {
      if (run.externalSystem === "minimax" && (run.itemSlug === "ai-music" || run.itemSlug === "voice-clone" || run.itemSlug === "voice-synthesis")) {
        const result = await minimaxQuery({
          currentUser: {
            id: run.userId,
            enterpriseId: run.enterpriseId,
          },
          runId: run.id,
        })

        const normalized = normalizeTaskLikeResult(result as MiniMaxNormalizedTask)
        if (normalized.providerStatus) {
          updated += 1
        }
        continue
      }

      if (run.externalSystem === "runninghub" && run.itemSlug === "ai-video") {
        const result = await runningHubVideoQuery({
          currentUser: {
            id: run.userId,
            enterpriseId: run.enterpriseId,
          },
          runId: run.id,
        })

        const normalized = normalizeTaskLikeResult(result as RunningHubVideoTask)
        if (normalized.providerStatus) {
          updated += 1
        }
        continue
      }

      if (run.externalSystem === "runninghub" && run.externalRunId) {
        const query = await runningHubQuery(run.externalRunId)
        if (!query) {
          continue
        }
        const normalized = normalizeRunningHubQueryResult(query)
        await patchRun(run.id, {
          status: normalized.status,
          externalSystem: "runninghub",
          externalRunId: run.externalRunId,
          normalizedResult: buildGenericRunningHubNormalizedResult(run, normalized),
          finishedAt: normalized.status === "succeeded" || normalized.status === "failed" ? new Date() : null,
        })
        await appendEvent(run.id, {
          level: normalized.status === "failed" ? "error" : "info",
          message:
            normalized.status === "succeeded"
              ? "platform_task_sync_succeeded"
              : normalized.status === "failed"
                ? "platform_task_sync_failed"
                : "platform_task_sync_running",
          payload: {
            providerStatus: normalized.providerStatus,
            externalSystem: run.externalSystem,
            externalRunId: run.externalRunId,
            resultCount: normalized.results.length,
          },
        })
        updated += 1
        continue
      }

      await appendUnsupportedSyncEvent(run, deps)
    } catch (error) {
      failed += 1
      await appendEvent(run.id, {
        level: "error",
        message: "platform_task_sync_error",
        payload: {
          externalSystem: run.externalSystem,
          externalRunId: run.externalRunId,
          error: error instanceof Error ? error.message : String(error),
        },
      })
    }
  }

  return {
    scanned,
    updated,
    failed,
  }
}
