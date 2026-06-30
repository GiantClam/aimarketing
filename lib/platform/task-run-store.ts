import { and, desc, eq, inArray, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { createRetryableDbErrorMatcher, withDbRetry } from "@/lib/db/retry"
import {
  platformArtifacts,
  platformKnowledgeSaveJobs,
  platformTaskRunEvents,
  platformTaskRuns,
  platformWorkItems,
} from "@/lib/db/schema"
import { ensureEnterpriseAuthTables } from "@/lib/enterprise/server"

export type PlatformTaskRunKind = "workflow" | "media" | "tool" | "agent"
export type PlatformTaskRunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled"
export type PlatformRunEventLevel = "info" | "warn" | "error"
export type PlatformArtifactKind = "file" | "link" | "text" | "json"
export type PlatformWorkItemType = "deck" | "article" | "image_set" | "video" | "audio" | "document"
export type PlatformKnowledgeSaveJobStatus = "queued" | "running" | "succeeded" | "failed" | "rejected"

export type PlatformTaskRunRecord = typeof platformTaskRuns.$inferSelect
export type PlatformTaskRunEventRecord = typeof platformTaskRunEvents.$inferSelect
export type PlatformArtifactRecord = typeof platformArtifacts.$inferSelect
export type PlatformWorkItemRecord = typeof platformWorkItems.$inferSelect
export type PlatformKnowledgeSaveJobRecord = typeof platformKnowledgeSaveJobs.$inferSelect
export type PlatformWorkLibraryItemRecord = {
  workItem: PlatformWorkItemRecord
  artifact: PlatformArtifactRecord
  referenceCount: number
}
export type DeletePlatformArtifactResult = {
  artifactId: number
  deletedWorkItemIds: number[]
  deletedStorage: boolean
}
export type MovePlatformArtifactToAssetLibraryResult = {
  artifact: PlatformArtifactRecord
  deletedWorkItemIds: number[]
}

export type HydratedPlatformTaskRun = PlatformTaskRunRecord & {
  events: PlatformTaskRunEventRecord[]
  artifacts: PlatformArtifactRecord[]
  workItems: PlatformWorkItemRecord[]
  knowledgeSaveJobs: PlatformKnowledgeSaveJobRecord[]
}

export type CreatePlatformTaskRunInput = {
  enterpriseId: number
  userId: number
  kind: PlatformTaskRunKind
  itemType: string
  itemSlug: string
  status?: PlatformTaskRunStatus
  inputPayload?: Record<string, unknown> | null
  normalizedResult?: Record<string, unknown> | null
  externalSystem?: string | null
  externalRunId?: string | null
  startedAt?: Date | null
  finishedAt?: Date | null
}

export type AppendPlatformRunEventInput = {
  level: PlatformRunEventLevel
  message: string
  payload?: Record<string, unknown> | null
}

export type SavePlatformArtifactInput = {
  runId: number
  enterpriseId: number
  ownerUserId: number
  kind: PlatformArtifactKind
  title: string
  mimeType?: string | null
  storageKey?: string | null
  externalUrl?: string | null
  payload?: Record<string, unknown> | null
  source?: "upload" | "generated" | "workflow" | "chat" | "assistant" | "import"
}

export type CreatePlatformWorkItemInput = {
  enterpriseId: number
  ownerUserId: number
  sourceArtifactId: number
  type: PlatformWorkItemType
  title: string
  summary?: string | null
  metadata?: Record<string, unknown> | null
}

export type EnqueuePlatformKnowledgeSaveJobInput = {
  artifactId: number
  enterpriseId: number
  ownerUserId: number
  status?: PlatformKnowledgeSaveJobStatus
  targetType?: string
  requestPayload?: Record<string, unknown> | null
  resultPayload?: Record<string, unknown> | null
  errorMessage?: string | null
}

export type UpdatePlatformKnowledgeSaveJobInput = {
  status?: PlatformKnowledgeSaveJobStatus
  resultPayload?: Record<string, unknown> | null
  errorMessage?: string | null
}

export type PlatformTaskRunStore = {
  createPlatformTaskRun(input: CreatePlatformTaskRunInput): Promise<PlatformTaskRunRecord>
  appendPlatformRunEvent(runId: number, input: AppendPlatformRunEventInput): Promise<PlatformTaskRunEventRecord>
  getPlatformTaskRun(runId: number): Promise<HydratedPlatformTaskRun | null>
  savePlatformArtifact(input: SavePlatformArtifactInput): Promise<PlatformArtifactRecord>
  promotePlatformArtifactToWorkItem(input: CreatePlatformWorkItemInput): Promise<PlatformWorkItemRecord>
  enqueuePlatformKnowledgeSaveJob(input: EnqueuePlatformKnowledgeSaveJobInput): Promise<PlatformKnowledgeSaveJobRecord>
  getPlatformKnowledgeSaveJob(jobId: number): Promise<PlatformKnowledgeSaveJobRecord | null>
  updatePlatformKnowledgeSaveJob(
    jobId: number,
    enterpriseId: number,
    input: UpdatePlatformKnowledgeSaveJobInput,
  ): Promise<PlatformKnowledgeSaveJobRecord | null>
  listPlatformKnowledgeSaveJobsForEnterprise(
    enterpriseId: number,
    limit?: number,
    status?: PlatformKnowledgeSaveJobStatus | null,
  ): Promise<PlatformKnowledgeSaveJobRecord[]>
  listPlatformTaskRunsForEnterprise(enterpriseId: number): Promise<PlatformTaskRunRecord[]>
  listRecentWorkflowTaskRunsForEnterprise(enterpriseId: number, limit?: number): Promise<PlatformTaskRunRecord[]>
  listPlatformArtifactsForEnterprise(enterpriseId: number): Promise<PlatformArtifactRecord[]>
  listRecentPlatformArtifactsForEnterprise(enterpriseId: number, limit?: number): Promise<PlatformArtifactRecord[]>
  listPlatformWorkItemsForEnterprise(enterpriseId: number): Promise<PlatformWorkItemRecord[]>
  listPlatformWorkLibraryItemsForEnterprise(enterpriseId: number): Promise<PlatformWorkLibraryItemRecord[]>
  getPlatformArtifact(artifactId: number): Promise<PlatformArtifactRecord | null>
  deletePlatformWorkItem(workItemId: number, enterpriseId: number): Promise<PlatformWorkItemRecord | null>
  movePlatformArtifactToAssetLibrary(
    artifactId: number,
    enterpriseId: number,
  ): Promise<MovePlatformArtifactToAssetLibraryResult | null>
  deletePlatformArtifactPermanently(artifactId: number, enterpriseId: number): Promise<DeletePlatformArtifactResult | null>
}

const PLATFORM_TASK_RUN_DB_RETRY_DELAYS_MS = [250, 750] as const
const isRetryablePlatformTaskRunDbError = createRetryableDbErrorMatcher(["timeout exceeded"])

const TASK_RUN_KINDS = new Set<PlatformTaskRunKind>(["workflow", "media", "tool", "agent"])
const TASK_RUN_STATUSES = new Set<PlatformTaskRunStatus>(["queued", "running", "succeeded", "failed", "cancelled"])
const RUN_EVENT_LEVELS = new Set<PlatformRunEventLevel>(["info", "warn", "error"])
const ARTIFACT_KINDS = new Set<PlatformArtifactKind>(["file", "link", "text", "json"])
const WORK_ITEM_TYPES = new Set<PlatformWorkItemType>(["deck", "article", "image_set", "video", "audio", "document"])
const KNOWLEDGE_JOB_STATUSES = new Set<PlatformKnowledgeSaveJobStatus>(["queued", "running", "succeeded", "failed", "rejected"])

async function withPlatformTaskRunDbRetry<T>(label: string, operation: () => Promise<T>) {
  return withDbRetry(label, operation, {
    retryDelaysMs: PLATFORM_TASK_RUN_DB_RETRY_DELAYS_MS,
    isRetryable: isRetryablePlatformTaskRunDbError,
    logPrefix: "platform.task-run-store.db.retry",
    exhaustedErrorPrefix: "platform_task_run_store_db_retry_exhausted",
  })
}

async function measurePlatformTaskRunStoreStep<T>(label: string, meta: Record<string, unknown>, operation: () => Promise<T>) {
  const startedAt = Date.now()
  try {
    return await operation()
  } finally {
    console.info("platform.task-run-store.timing", {
      label,
      durationMs: Date.now() - startedAt,
      ...meta,
    })
  }
}

type GlobalWithPlatformTaskRunEnsureState = typeof globalThis & {
  __aimarketingEnsurePlatformTaskRunTablesPromise__?: Promise<void> | null
}

const platformTaskRunEnsureState = globalThis as GlobalWithPlatformTaskRunEnsureState
let ensurePlatformTaskRunTablesPromise = platformTaskRunEnsureState.__aimarketingEnsurePlatformTaskRunTablesPromise__ ?? null

export async function ensurePlatformTaskRunTables() {
  if (!ensurePlatformTaskRunTablesPromise) {
    ensurePlatformTaskRunTablesPromise = (async () => {
      await ensureEnterpriseAuthTables()

      await withPlatformTaskRunDbRetry("ensure-platform-task-runs-table", async () =>
        db.execute(sql`
          CREATE TABLE IF NOT EXISTS "AI_MARKETING_platform_task_runs" (
            id SERIAL PRIMARY KEY,
            enterprise_id INTEGER NOT NULL REFERENCES "AI_MARKETING_enterprises"(id),
            user_id INTEGER NOT NULL REFERENCES "AI_MARKETING_users"(id),
            kind VARCHAR(24) NOT NULL,
            item_type VARCHAR(32) NOT NULL,
            item_slug VARCHAR(128) NOT NULL,
            external_run_id VARCHAR(255),
            external_system VARCHAR(32),
            status VARCHAR(24) NOT NULL DEFAULT 'queued',
            input_payload JSONB,
            normalized_result JSONB,
            started_at TIMESTAMP,
            finished_at TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `),
      )

      await withPlatformTaskRunDbRetry("ensure-platform-task-run-events-table", async () =>
        db.execute(sql`
          CREATE TABLE IF NOT EXISTS "AI_MARKETING_platform_task_run_events" (
            id SERIAL PRIMARY KEY,
            run_id INTEGER NOT NULL REFERENCES "AI_MARKETING_platform_task_runs"(id) ON DELETE CASCADE,
            level VARCHAR(16) NOT NULL,
            message VARCHAR(255) NOT NULL,
            payload JSONB,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `),
      )

      await withPlatformTaskRunDbRetry("ensure-platform-artifacts-table", async () =>
        db.execute(sql`
          CREATE TABLE IF NOT EXISTS "AI_MARKETING_platform_artifacts" (
            id SERIAL PRIMARY KEY,
            run_id INTEGER NOT NULL REFERENCES "AI_MARKETING_platform_task_runs"(id) ON DELETE CASCADE,
            enterprise_id INTEGER NOT NULL REFERENCES "AI_MARKETING_enterprises"(id),
            owner_user_id INTEGER NOT NULL REFERENCES "AI_MARKETING_users"(id),
            kind VARCHAR(24) NOT NULL,
            title VARCHAR(255) NOT NULL,
            mime_type VARCHAR(120),
            storage_key TEXT,
            external_url TEXT,
            payload JSONB,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `),
      )

      await withPlatformTaskRunDbRetry("ensure-platform-work-items-table", async () =>
        db.execute(sql`
          CREATE TABLE IF NOT EXISTS "AI_MARKETING_platform_work_items" (
            id SERIAL PRIMARY KEY,
            enterprise_id INTEGER NOT NULL REFERENCES "AI_MARKETING_enterprises"(id),
            owner_user_id INTEGER NOT NULL REFERENCES "AI_MARKETING_users"(id),
            source_artifact_id INTEGER NOT NULL REFERENCES "AI_MARKETING_platform_artifacts"(id) ON DELETE CASCADE,
            type VARCHAR(24) NOT NULL,
            title VARCHAR(255) NOT NULL,
            summary TEXT,
            metadata JSONB,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `),
      )

      await withPlatformTaskRunDbRetry("ensure-platform-knowledge-save-jobs-table", async () =>
        db.execute(sql`
          CREATE TABLE IF NOT EXISTS "AI_MARKETING_platform_knowledge_save_jobs" (
            id SERIAL PRIMARY KEY,
            artifact_id INTEGER NOT NULL REFERENCES "AI_MARKETING_platform_artifacts"(id) ON DELETE CASCADE,
            enterprise_id INTEGER NOT NULL REFERENCES "AI_MARKETING_enterprises"(id),
            owner_user_id INTEGER NOT NULL REFERENCES "AI_MARKETING_users"(id),
            status VARCHAR(24) NOT NULL DEFAULT 'queued',
            target_type VARCHAR(32) NOT NULL DEFAULT 'knowledge_base',
            request_payload JSONB,
            result_payload JSONB,
            error_message TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `),
      )

      await withPlatformTaskRunDbRetry("ensure-platform-task-runs-enterprise-created-index", async () =>
        db.execute(sql`
          CREATE INDEX IF NOT EXISTS "AI_MARKETING_platform_task_runs_enterprise_created_idx"
          ON "AI_MARKETING_platform_task_runs"(enterprise_id, created_at DESC)
        `),
      )

      await withPlatformTaskRunDbRetry("ensure-platform-task-runs-enterprise-status-index", async () =>
        db.execute(sql`
          CREATE INDEX IF NOT EXISTS "AI_MARKETING_platform_task_runs_enterprise_status_idx"
          ON "AI_MARKETING_platform_task_runs"(enterprise_id, status)
        `),
      )

      await withPlatformTaskRunDbRetry("ensure-platform-task-run-events-run-created-index", async () =>
        db.execute(sql`
          CREATE INDEX IF NOT EXISTS "AI_MARKETING_platform_task_run_events_run_created_idx"
          ON "AI_MARKETING_platform_task_run_events"(run_id, created_at DESC)
        `),
      )

      await withPlatformTaskRunDbRetry("ensure-platform-artifacts-enterprise-created-index", async () =>
        db.execute(sql`
          CREATE INDEX IF NOT EXISTS "AI_MARKETING_platform_artifacts_enterprise_created_idx"
          ON "AI_MARKETING_platform_artifacts"(enterprise_id, created_at DESC)
        `),
      )

      await withPlatformTaskRunDbRetry("ensure-platform-artifacts-run-created-index", async () =>
        db.execute(sql`
          CREATE INDEX IF NOT EXISTS "AI_MARKETING_platform_artifacts_run_created_idx"
          ON "AI_MARKETING_platform_artifacts"(run_id, created_at DESC)
        `),
      )

      await withPlatformTaskRunDbRetry("ensure-platform-work-items-enterprise-created-index", async () =>
        db.execute(sql`
          CREATE INDEX IF NOT EXISTS "AI_MARKETING_platform_work_items_enterprise_created_idx"
          ON "AI_MARKETING_platform_work_items"(enterprise_id, created_at DESC)
        `),
      )

      await withPlatformTaskRunDbRetry("ensure-platform-work-items-source-artifact-index", async () =>
        db.execute(sql`
          CREATE INDEX IF NOT EXISTS "AI_MARKETING_platform_work_items_source_artifact_idx"
          ON "AI_MARKETING_platform_work_items"(source_artifact_id)
        `),
      )

      await withPlatformTaskRunDbRetry("ensure-platform-knowledge-save-jobs-artifact-created-index", async () =>
        db.execute(sql`
          CREATE INDEX IF NOT EXISTS "AI_MARKETING_platform_knowledge_save_jobs_artifact_created_idx"
          ON "AI_MARKETING_platform_knowledge_save_jobs"(artifact_id, created_at DESC)
        `),
      )

      await withPlatformTaskRunDbRetry("ensure-platform-knowledge-save-jobs-enterprise-status-index", async () =>
        db.execute(sql`
          CREATE INDEX IF NOT EXISTS "AI_MARKETING_platform_knowledge_save_jobs_enterprise_status_idx"
          ON "AI_MARKETING_platform_knowledge_save_jobs"(enterprise_id, status)
        `),
      )
    })().catch((error) => {
      ensurePlatformTaskRunTablesPromise = null
      platformTaskRunEnsureState.__aimarketingEnsurePlatformTaskRunTablesPromise__ = null
      throw error
    })
    platformTaskRunEnsureState.__aimarketingEnsurePlatformTaskRunTablesPromise__ = ensurePlatformTaskRunTablesPromise
  }

  await ensurePlatformTaskRunTablesPromise
}

function normalizeIdentifier(value: string, fallback: string, maxLength: number) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return (normalized || fallback).slice(0, maxLength)
}

function normalizeTitle(value: string, fallback: string, maxLength: number) {
  const normalized = value.trim()
  return (normalized || fallback).slice(0, maxLength)
}

function normalizeOptionalText(value: string | null | undefined, maxLength: number) {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  return normalized ? normalized.slice(0, maxLength) : null
}

function normalizeTaskRunKind(value: PlatformTaskRunKind): PlatformTaskRunKind {
  return TASK_RUN_KINDS.has(value) ? value : "workflow"
}

function normalizeTaskRunStatus(value: PlatformTaskRunStatus | undefined): PlatformTaskRunStatus {
  return value && TASK_RUN_STATUSES.has(value) ? value : "queued"
}

function normalizeRunEventLevel(value: PlatformRunEventLevel): PlatformRunEventLevel {
  return RUN_EVENT_LEVELS.has(value) ? value : "info"
}

function normalizeArtifactKind(value: PlatformArtifactKind): PlatformArtifactKind {
  return ARTIFACT_KINDS.has(value) ? value : "file"
}

function normalizeWorkItemType(value: PlatformWorkItemType): PlatformWorkItemType {
  return WORK_ITEM_TYPES.has(value) ? value : "document"
}

function normalizeKnowledgeSaveJobStatus(
  value: PlatformKnowledgeSaveJobStatus | undefined,
): PlatformKnowledgeSaveJobStatus {
  return value && KNOWLEDGE_JOB_STATUSES.has(value) ? value : "queued"
}

export function buildPlatformTaskRunRecord(input: CreatePlatformTaskRunInput): typeof platformTaskRuns.$inferInsert {
  const now = new Date()

  return {
    enterpriseId: input.enterpriseId,
    userId: input.userId,
    kind: normalizeTaskRunKind(input.kind),
    itemType: normalizeIdentifier(input.itemType, "workflow", 32),
    itemSlug: normalizeIdentifier(input.itemSlug, "run", 128),
    externalSystem: normalizeOptionalText(input.externalSystem, 32),
    externalRunId: normalizeOptionalText(input.externalRunId, 255),
    status: normalizeTaskRunStatus(input.status),
    inputPayload: input.inputPayload ?? null,
    normalizedResult: input.normalizedResult ?? null,
    startedAt: input.startedAt ?? null,
    finishedAt: input.finishedAt ?? null,
    createdAt: now,
    updatedAt: now,
  }
}

function buildInMemoryPlatformTaskRunRecord(id: number, input: CreatePlatformTaskRunInput): PlatformTaskRunRecord {
  const record = buildPlatformTaskRunRecord(input)
  return {
    id,
    enterpriseId: record.enterpriseId,
    userId: record.userId,
    kind: record.kind,
    itemType: record.itemType,
    itemSlug: record.itemSlug,
    externalSystem: record.externalSystem ?? null,
    externalRunId: record.externalRunId ?? null,
    status: record.status ?? "queued",
    inputPayload: record.inputPayload ?? null,
    normalizedResult: record.normalizedResult ?? null,
    startedAt: record.startedAt ?? null,
    finishedAt: record.finishedAt ?? null,
    createdAt: record.createdAt ?? new Date(),
    updatedAt: record.updatedAt ?? new Date(),
  }
}

export function buildPlatformRunEventRecord(
  runId: number,
  input: AppendPlatformRunEventInput,
): typeof platformTaskRunEvents.$inferInsert {
  return {
    runId,
    level: normalizeRunEventLevel(input.level),
    message: normalizeTitle(input.message, "event", 255),
    payload: input.payload ?? null,
    createdAt: new Date(),
  }
}

function buildInMemoryPlatformRunEventRecord(
  id: number,
  runId: number,
  input: AppendPlatformRunEventInput,
): PlatformTaskRunEventRecord {
  const record = buildPlatformRunEventRecord(runId, input)
  return {
    id,
    runId: record.runId,
    level: record.level,
    message: record.message,
    payload: record.payload ?? null,
    createdAt: record.createdAt ?? new Date(),
  }
}

export function buildPlatformArtifactRecord(input: SavePlatformArtifactInput): typeof platformArtifacts.$inferInsert {
  return {
    runId: input.runId,
    enterpriseId: input.enterpriseId,
    ownerUserId: input.ownerUserId,
    kind: normalizeArtifactKind(input.kind),
    title: normalizeTitle(input.title, "Untitled artifact", 255),
    mimeType: normalizeOptionalText(input.mimeType, 120),
    storageKey: normalizeOptionalText(input.storageKey, 4096),
    externalUrl: normalizeOptionalText(input.externalUrl, 4096),
    payload: {
      ...(input.payload ?? {}),
      source: input.source ?? input.payload?.source ?? null,
    },
    createdAt: new Date(),
  }
}

function buildInMemoryPlatformArtifactRecord(id: number, input: SavePlatformArtifactInput): PlatformArtifactRecord {
  const record = buildPlatformArtifactRecord(input)
  return {
    id,
    runId: record.runId,
    enterpriseId: record.enterpriseId,
    ownerUserId: record.ownerUserId,
    kind: record.kind,
    title: record.title,
    mimeType: record.mimeType ?? null,
    storageKey: record.storageKey ?? null,
    externalUrl: record.externalUrl ?? null,
    payload: record.payload ?? null,
    createdAt: record.createdAt ?? new Date(),
  }
}

export function buildPlatformWorkItemRecord(
  input: CreatePlatformWorkItemInput,
): typeof platformWorkItems.$inferInsert {
  const now = new Date()

  return {
    enterpriseId: input.enterpriseId,
    ownerUserId: input.ownerUserId,
    sourceArtifactId: input.sourceArtifactId,
    type: normalizeWorkItemType(input.type),
    title: normalizeTitle(input.title, "Untitled work", 255),
    summary: normalizeOptionalText(input.summary, 10_000),
    metadata: input.metadata ?? null,
    createdAt: now,
    updatedAt: now,
  }
}

function buildInMemoryPlatformWorkItemRecord(id: number, input: CreatePlatformWorkItemInput): PlatformWorkItemRecord {
  const record = buildPlatformWorkItemRecord(input)
  return {
    id,
    enterpriseId: record.enterpriseId,
    ownerUserId: record.ownerUserId,
    sourceArtifactId: record.sourceArtifactId,
    type: record.type,
    title: record.title,
    summary: record.summary ?? null,
    metadata: record.metadata ?? null,
    createdAt: record.createdAt ?? new Date(),
    updatedAt: record.updatedAt ?? new Date(),
  }
}

export function buildPlatformKnowledgeSaveJobRecord(
  input: EnqueuePlatformKnowledgeSaveJobInput,
): typeof platformKnowledgeSaveJobs.$inferInsert {
  const now = new Date()

  return {
    artifactId: input.artifactId,
    enterpriseId: input.enterpriseId,
    ownerUserId: input.ownerUserId,
    status: normalizeKnowledgeSaveJobStatus(input.status),
    targetType: normalizeIdentifier(input.targetType ?? "knowledge_base", "knowledge-base", 32),
    requestPayload: input.requestPayload ?? null,
    resultPayload: input.resultPayload ?? null,
    errorMessage: normalizeOptionalText(input.errorMessage, 10_000),
    createdAt: now,
    updatedAt: now,
  }
}

function buildInMemoryPlatformKnowledgeSaveJobRecord(
  id: number,
  input: EnqueuePlatformKnowledgeSaveJobInput,
): PlatformKnowledgeSaveJobRecord {
  const record = buildPlatformKnowledgeSaveJobRecord(input)
  return {
    id,
    artifactId: record.artifactId,
    enterpriseId: record.enterpriseId,
    ownerUserId: record.ownerUserId,
    status: record.status ?? "queued",
    targetType: record.targetType ?? "knowledge_base",
    requestPayload: record.requestPayload ?? null,
    resultPayload: record.resultPayload ?? null,
    errorMessage: record.errorMessage ?? null,
    createdAt: record.createdAt ?? new Date(),
    updatedAt: record.updatedAt ?? new Date(),
  }
}

function hydratePlatformTaskRun(
  run: PlatformTaskRunRecord,
  events: PlatformTaskRunEventRecord[],
  artifacts: PlatformArtifactRecord[],
  workItems: PlatformWorkItemRecord[],
  knowledgeSaveJobs: PlatformKnowledgeSaveJobRecord[],
): HydratedPlatformTaskRun {
  return {
    ...run,
    events,
    artifacts,
    workItems,
    knowledgeSaveJobs,
  }
}

async function loadHydratedPlatformTaskRun(run: PlatformTaskRunRecord): Promise<HydratedPlatformTaskRun> {
  const [events, artifacts] = await Promise.all([
    withPlatformTaskRunDbRetry("get-platform-task-run-events", () =>
      db.select().from(platformTaskRunEvents).where(eq(platformTaskRunEvents.runId, run.id)).orderBy(platformTaskRunEvents.id),
    ),
    withPlatformTaskRunDbRetry("get-platform-run-artifacts", () =>
      db.select().from(platformArtifacts).where(eq(platformArtifacts.runId, run.id)).orderBy(platformArtifacts.id),
    ),
  ])

  const artifactIds = artifacts.map((artifact) => artifact.id)
  const [workItems, knowledgeSaveJobs] = await Promise.all([
    artifactIds.length === 0
      ? Promise.resolve([] as PlatformWorkItemRecord[])
      : withPlatformTaskRunDbRetry("get-platform-run-work-items", () =>
          db
            .select()
            .from(platformWorkItems)
            .where(inArray(platformWorkItems.sourceArtifactId, artifactIds))
            .orderBy(platformWorkItems.id),
        ),
    artifactIds.length === 0
      ? Promise.resolve([] as PlatformKnowledgeSaveJobRecord[])
      : withPlatformTaskRunDbRetry("get-platform-run-knowledge-jobs", () =>
          db
            .select()
            .from(platformKnowledgeSaveJobs)
            .where(inArray(platformKnowledgeSaveJobs.artifactId, artifactIds))
            .orderBy(platformKnowledgeSaveJobs.id),
        ),
  ])

  return hydratePlatformTaskRun(run, events, artifacts, workItems, knowledgeSaveJobs)
}

function sortPlatformRowsByCreatedDesc<T extends { createdAt: Date | null; id: number }>(rows: T[]) {
  return [...rows].sort((left, right) => {
    const leftTime = left.createdAt instanceof Date ? left.createdAt.getTime() : 0
    const rightTime = right.createdAt instanceof Date ? right.createdAt.getTime() : 0
    return rightTime - leftTime || right.id - left.id
  })
}

export async function createPlatformTaskRun(input: CreatePlatformTaskRunInput) {
  await ensurePlatformTaskRunTables()

  const [row] = await withPlatformTaskRunDbRetry("create-platform-task-run", () =>
    db
      .insert(platformTaskRuns)
      .values(buildPlatformTaskRunRecord(input))
      .returning(),
  )

  return row
}

export async function appendPlatformRunEvent(runId: number, input: AppendPlatformRunEventInput) {
  await ensurePlatformTaskRunTables()

  const [row] = await withPlatformTaskRunDbRetry("append-platform-run-event", () =>
    db
      .insert(platformTaskRunEvents)
      .values(buildPlatformRunEventRecord(runId, input))
      .returning(),
  )

  return row
}

export async function getPlatformTaskRun(runId: number) {
  await ensurePlatformTaskRunTables()

  const [row] = await withPlatformTaskRunDbRetry("get-platform-task-run", () =>
    db.select().from(platformTaskRuns).where(eq(platformTaskRuns.id, runId)),
  )

  if (!row) return null
  return loadHydratedPlatformTaskRun(row)
}

export async function savePlatformArtifact(input: SavePlatformArtifactInput) {
  await ensurePlatformTaskRunTables()

  const [row] = await withPlatformTaskRunDbRetry("save-platform-artifact", () =>
    db
      .insert(platformArtifacts)
      .values(buildPlatformArtifactRecord(input))
      .returning(),
  )

  return row
}

export async function createPlatformWorkItem(input: CreatePlatformWorkItemInput) {
  await ensurePlatformTaskRunTables()

  const [row] = await withPlatformTaskRunDbRetry("create-platform-work-item", () =>
    db
      .insert(platformWorkItems)
      .values(buildPlatformWorkItemRecord(input))
      .returning(),
  )

  return row
}

export async function promotePlatformArtifactToWorkItem(input: CreatePlatformWorkItemInput) {
  return createPlatformWorkItem(input)
}

export async function enqueuePlatformKnowledgeSaveJob(input: EnqueuePlatformKnowledgeSaveJobInput) {
  await ensurePlatformTaskRunTables()

  const [row] = await withPlatformTaskRunDbRetry("enqueue-platform-knowledge-save-job", () =>
    db
      .insert(platformKnowledgeSaveJobs)
      .values(buildPlatformKnowledgeSaveJobRecord(input))
      .returning(),
  )

  return row
}

export async function getPlatformKnowledgeSaveJob(jobId: number) {
  await ensurePlatformTaskRunTables()

  const [row] = await withPlatformTaskRunDbRetry("get-platform-knowledge-save-job", () =>
    db
      .select()
      .from(platformKnowledgeSaveJobs)
      .where(eq(platformKnowledgeSaveJobs.id, jobId))
      .limit(1),
  )

  return row ?? null
}

export async function updatePlatformKnowledgeSaveJob(
  jobId: number,
  enterpriseId: number,
  input: UpdatePlatformKnowledgeSaveJobInput,
) {
  await ensurePlatformTaskRunTables()

  const nextValues: Partial<typeof platformKnowledgeSaveJobs.$inferInsert> & { updatedAt: Date } = {
    updatedAt: new Date(),
  }

  if (input.status !== undefined) nextValues.status = normalizeKnowledgeSaveJobStatus(input.status)
  if (input.resultPayload !== undefined) nextValues.resultPayload = input.resultPayload
  if (input.errorMessage !== undefined) nextValues.errorMessage = normalizeOptionalText(input.errorMessage, 10_000)

  const [row] = await withPlatformTaskRunDbRetry("update-platform-knowledge-save-job", () =>
    db
      .update(platformKnowledgeSaveJobs)
      .set(nextValues)
      .where(and(eq(platformKnowledgeSaveJobs.id, jobId), eq(platformKnowledgeSaveJobs.enterpriseId, enterpriseId)))
      .returning(),
  )

  return row ?? null
}

export async function listPlatformKnowledgeSaveJobsForEnterprise(
  enterpriseId: number,
  limit = 50,
  status?: PlatformKnowledgeSaveJobStatus | null,
) {
  await ensurePlatformTaskRunTables()

  const normalizedLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 200) : 50
  const normalizedStatus = status && KNOWLEDGE_JOB_STATUSES.has(status) ? status : null

  return withPlatformTaskRunDbRetry("list-platform-knowledge-save-jobs-for-enterprise", () =>
    db
      .select()
      .from(platformKnowledgeSaveJobs)
      .where(
        normalizedStatus
          ? and(
              eq(platformKnowledgeSaveJobs.enterpriseId, enterpriseId),
              eq(platformKnowledgeSaveJobs.status, normalizedStatus),
            )
          : eq(platformKnowledgeSaveJobs.enterpriseId, enterpriseId),
      )
      .orderBy(desc(platformKnowledgeSaveJobs.createdAt), desc(platformKnowledgeSaveJobs.id))
      .limit(normalizedLimit),
  )
}

export async function listPlatformTaskRunsForEnterprise(enterpriseId: number) {
  await ensurePlatformTaskRunTables()

  return withPlatformTaskRunDbRetry("list-platform-task-runs-for-enterprise", () =>
    db
      .select()
      .from(platformTaskRuns)
      .where(eq(platformTaskRuns.enterpriseId, enterpriseId))
      .orderBy(desc(platformTaskRuns.createdAt), desc(platformTaskRuns.id)),
  )
}

export async function listRecentWorkflowTaskRunsForEnterprise(enterpriseId: number, limit = 50) {
  await ensurePlatformTaskRunTables()

  const normalizedLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 200) : 50

  return measurePlatformTaskRunStoreStep(
    "list-recent-workflow-task-runs-for-enterprise",
    { enterpriseId, limit: normalizedLimit },
    () =>
      withPlatformTaskRunDbRetry("list-recent-workflow-task-runs-for-enterprise", () =>
        db
          .select()
          .from(platformTaskRuns)
          .where(
            and(
              eq(platformTaskRuns.enterpriseId, enterpriseId),
              eq(platformTaskRuns.kind, "workflow"),
              eq(platformTaskRuns.itemType, "workflow"),
            ),
          )
          .orderBy(desc(platformTaskRuns.createdAt), desc(platformTaskRuns.id))
          .limit(normalizedLimit),
      ),
  )
}

export async function listPlatformArtifactsForEnterprise(enterpriseId: number) {
  await ensurePlatformTaskRunTables()

  return withPlatformTaskRunDbRetry("list-platform-artifacts-for-enterprise", () =>
    db
      .select()
      .from(platformArtifacts)
      .where(eq(platformArtifacts.enterpriseId, enterpriseId))
      .orderBy(desc(platformArtifacts.createdAt), desc(platformArtifacts.id)),
  )
}

export async function listRecentPlatformArtifactsForEnterprise(enterpriseId: number, limit = 100) {
  await ensurePlatformTaskRunTables()

  const normalizedLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 300) : 100

  return measurePlatformTaskRunStoreStep(
    "list-recent-platform-artifacts-for-enterprise",
    { enterpriseId, limit: normalizedLimit },
    () =>
      withPlatformTaskRunDbRetry("list-recent-platform-artifacts-for-enterprise", () =>
        db
          .select()
          .from(platformArtifacts)
          .where(eq(platformArtifacts.enterpriseId, enterpriseId))
          .orderBy(desc(platformArtifacts.createdAt), desc(platformArtifacts.id))
          .limit(normalizedLimit),
      ),
  )
}

export async function listPlatformWorkItemsForEnterprise(enterpriseId: number) {
  await ensurePlatformTaskRunTables()

  return withPlatformTaskRunDbRetry("list-platform-work-items-for-enterprise", () =>
    db
      .select()
      .from(platformWorkItems)
      .where(eq(platformWorkItems.enterpriseId, enterpriseId))
      .orderBy(desc(platformWorkItems.createdAt), desc(platformWorkItems.id)),
  )
}

export async function listPlatformWorkLibraryItemsForEnterprise(enterpriseId: number) {
  await ensurePlatformTaskRunTables()

  const works = await listPlatformWorkItemsForEnterprise(enterpriseId)
  const artifactIds = [...new Set(works.map((work) => work.sourceArtifactId))]
  if (artifactIds.length === 0) return []

  const [artifacts, referenceRows] = await Promise.all([
    withPlatformTaskRunDbRetry("list-platform-work-library-artifacts-for-enterprise", () =>
      db
        .select()
        .from(platformArtifacts)
        .where(and(eq(platformArtifacts.enterpriseId, enterpriseId), inArray(platformArtifacts.id, artifactIds))),
    ),
    withPlatformTaskRunDbRetry("count-platform-work-library-artifact-references", () =>
      db
        .select({
          artifactId: platformWorkItems.sourceArtifactId,
          referenceCount: sql<number>`count(*)::int`,
        })
        .from(platformWorkItems)
        .where(and(eq(platformWorkItems.enterpriseId, enterpriseId), inArray(platformWorkItems.sourceArtifactId, artifactIds)))
        .groupBy(platformWorkItems.sourceArtifactId),
    ),
  ])

  const artifactById = new Map(artifacts.map((artifact) => [artifact.id, artifact]))
  const referenceCountByArtifactId = new Map(referenceRows.map((row) => [row.artifactId, row.referenceCount]))

  return works
    .map((workItem) => {
      const artifact = artifactById.get(workItem.sourceArtifactId)
      if (!artifact) return null
      return {
        workItem,
        artifact,
        referenceCount: referenceCountByArtifactId.get(workItem.sourceArtifactId) ?? 1,
      } satisfies PlatformWorkLibraryItemRecord
    })
    .filter((item): item is PlatformWorkLibraryItemRecord => item !== null)
}

export async function getPlatformArtifact(artifactId: number) {
  await ensurePlatformTaskRunTables()

  const [row] = await withPlatformTaskRunDbRetry("get-platform-artifact", () =>
    db.select().from(platformArtifacts).where(eq(platformArtifacts.id, artifactId)),
  )

  return row ?? null
}

export async function deletePlatformWorkItem(workItemId: number, enterpriseId: number) {
  await ensurePlatformTaskRunTables()

  const [row] = await withPlatformTaskRunDbRetry("delete-platform-work-item", () =>
    db
      .delete(platformWorkItems)
      .where(and(eq(platformWorkItems.id, workItemId), eq(platformWorkItems.enterpriseId, enterpriseId)))
      .returning(),
  )

  return row ?? null
}

function buildAssetLibraryPayloadFromArtifact(artifact: PlatformArtifactRecord) {
  const currentPayload =
    artifact.payload && typeof artifact.payload === "object" && !Array.isArray(artifact.payload)
      ? { ...(artifact.payload as Record<string, unknown>) }
      : {}
  const previousSource = typeof currentPayload.source === "string" ? currentPayload.source : null

  return {
    ...currentPayload,
    source: "import" as const,
    entry: typeof currentPayload.entry === "string" && currentPayload.entry.trim() ? currentPayload.entry : "work_library_move",
    movedFromWorkLibrary: true,
    previousSource,
    movedToAssetLibraryAt: new Date().toISOString(),
  }
}

export async function movePlatformArtifactToAssetLibrary(artifactId: number, enterpriseId: number) {
  await ensurePlatformTaskRunTables()

  const [artifact] = await withPlatformTaskRunDbRetry("get-platform-artifact-for-asset-library-move", () =>
    db
      .select()
      .from(platformArtifacts)
      .where(and(eq(platformArtifacts.id, artifactId), eq(platformArtifacts.enterpriseId, enterpriseId))),
  )

  if (!artifact) return null

  const referenceRows = await withPlatformTaskRunDbRetry("list-platform-work-item-references-for-asset-library-move", () =>
    db
      .select({ id: platformWorkItems.id })
      .from(platformWorkItems)
      .where(and(eq(platformWorkItems.enterpriseId, enterpriseId), eq(platformWorkItems.sourceArtifactId, artifactId))),
  )

  const deletedWorkItemIds = referenceRows.map((row) => row.id)
  const nextPayload = buildAssetLibraryPayloadFromArtifact(artifact)

  const [updatedArtifact] = await withPlatformTaskRunDbRetry("move-platform-artifact-to-asset-library", () =>
    db.transaction(async (tx) => {
      if (deletedWorkItemIds.length > 0) {
        await tx
          .delete(platformWorkItems)
          .where(and(eq(platformWorkItems.enterpriseId, enterpriseId), eq(platformWorkItems.sourceArtifactId, artifactId)))
      }

      const [row] = await tx
        .update(platformArtifacts)
        .set({
          payload: nextPayload,
        })
        .where(and(eq(platformArtifacts.enterpriseId, enterpriseId), eq(platformArtifacts.id, artifactId)))
        .returning()

      return [row]
    }),
  )

  if (!updatedArtifact) return null

  return {
    artifact: updatedArtifact,
    deletedWorkItemIds,
  }
}

export async function deletePlatformArtifactPermanently(
  artifactId: number,
  enterpriseId: number,
  deleteStorageObject?: (storageKey: string) => Promise<boolean>,
) {
  await ensurePlatformTaskRunTables()

  const [artifact] = await withPlatformTaskRunDbRetry("get-platform-artifact-for-permanent-delete", () =>
    db
      .select()
      .from(platformArtifacts)
      .where(and(eq(platformArtifacts.id, artifactId), eq(platformArtifacts.enterpriseId, enterpriseId))),
  )

  if (!artifact) return null

  const referenceRows = await withPlatformTaskRunDbRetry("list-platform-work-item-references-for-artifact-delete", () =>
    db
      .select({ id: platformWorkItems.id })
      .from(platformWorkItems)
      .where(and(eq(platformWorkItems.enterpriseId, enterpriseId), eq(platformWorkItems.sourceArtifactId, artifactId))),
  )

  let deletedStorage = false
  if (artifact.storageKey && deleteStorageObject) {
    deletedStorage = await deleteStorageObject(artifact.storageKey)
  }

  const deletedWorkItemIds = referenceRows.map((row) => row.id)

  await withPlatformTaskRunDbRetry("delete-platform-artifact-permanently", () =>
    db.transaction(async (tx) => {
      if (deletedWorkItemIds.length > 0) {
        await tx
          .delete(platformWorkItems)
          .where(and(eq(platformWorkItems.enterpriseId, enterpriseId), eq(platformWorkItems.sourceArtifactId, artifactId)))
      }
      await tx
        .delete(platformKnowledgeSaveJobs)
        .where(and(eq(platformKnowledgeSaveJobs.enterpriseId, enterpriseId), eq(platformKnowledgeSaveJobs.artifactId, artifactId)))
      await tx
        .delete(platformArtifacts)
        .where(and(eq(platformArtifacts.enterpriseId, enterpriseId), eq(platformArtifacts.id, artifactId)))
    }),
  )

  return {
    artifactId,
    deletedWorkItemIds,
    deletedStorage,
  }
}

export function createInMemoryPlatformTaskRunStore(): PlatformTaskRunStore {
  let nextRunId = 1
  let nextEventId = 1
  let nextArtifactId = 1
  let nextWorkItemId = 1
  let nextKnowledgeJobId = 1

  const runs = new Map<number, PlatformTaskRunRecord>()
  const events: PlatformTaskRunEventRecord[] = []
  const artifacts: PlatformArtifactRecord[] = []
  const workItems: PlatformWorkItemRecord[] = []
  const knowledgeSaveJobs: PlatformKnowledgeSaveJobRecord[] = []

  return {
    async createPlatformTaskRun(input) {
      const row = buildInMemoryPlatformTaskRunRecord(nextRunId, input)
      nextRunId += 1
      runs.set(row.id, row)
      return row
    },

    async appendPlatformRunEvent(runId, input) {
      const row = buildInMemoryPlatformRunEventRecord(nextEventId, runId, input)
      nextEventId += 1
      events.push(row)
      return row
    },

    async getPlatformTaskRun(runId) {
      const run = runs.get(runId)
      if (!run) return null
      const runArtifacts = artifacts.filter((artifact) => artifact.runId === runId)
      const runArtifactIds = new Set(runArtifacts.map((artifact) => artifact.id))

      return hydratePlatformTaskRun(
        run,
        events.filter((event) => event.runId === runId),
        runArtifacts,
        workItems.filter((workItem) => runArtifactIds.has(workItem.sourceArtifactId)),
        knowledgeSaveJobs.filter((job) => runArtifactIds.has(job.artifactId)),
      )
    },

    async savePlatformArtifact(input) {
      const row = buildInMemoryPlatformArtifactRecord(nextArtifactId, input)
      nextArtifactId += 1
      artifacts.push(row)
      return row
    },

    async promotePlatformArtifactToWorkItem(input) {
      const row = buildInMemoryPlatformWorkItemRecord(nextWorkItemId, input)
      nextWorkItemId += 1
      workItems.push(row)
      return row
    },

    async enqueuePlatformKnowledgeSaveJob(input) {
      const row = buildInMemoryPlatformKnowledgeSaveJobRecord(nextKnowledgeJobId, input)
      nextKnowledgeJobId += 1
      knowledgeSaveJobs.push(row)
      return row
    },

    async getPlatformKnowledgeSaveJob(jobId) {
      return knowledgeSaveJobs.find((job) => job.id === jobId) ?? null
    },

    async updatePlatformKnowledgeSaveJob(jobId, enterpriseId, input) {
      const index = knowledgeSaveJobs.findIndex((job) => job.id === jobId && job.enterpriseId === enterpriseId)
      if (index < 0) return null
      const current = knowledgeSaveJobs[index]!
      const next: PlatformKnowledgeSaveJobRecord = {
        ...current,
        status: input.status !== undefined ? normalizeKnowledgeSaveJobStatus(input.status) : current.status,
        resultPayload: input.resultPayload !== undefined ? input.resultPayload : current.resultPayload,
        errorMessage:
          input.errorMessage !== undefined ? normalizeOptionalText(input.errorMessage, 10_000) : current.errorMessage,
        updatedAt: new Date(),
      }
      knowledgeSaveJobs.splice(index, 1, next)
      return next
    },

    async listPlatformKnowledgeSaveJobsForEnterprise(enterpriseId, limit = 50, status) {
      const normalizedLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 200) : 50
      const normalizedStatus = status && KNOWLEDGE_JOB_STATUSES.has(status) ? status : null
      return knowledgeSaveJobs
        .filter((job) => job.enterpriseId === enterpriseId && (!normalizedStatus || job.status === normalizedStatus))
        .sort((left, right) => right.id - left.id)
        .slice(0, normalizedLimit)
    },

    async listPlatformTaskRunsForEnterprise(enterpriseId) {
      return [...runs.values()]
        .filter((run) => run.enterpriseId === enterpriseId)
        .sort((left, right) => right.id - left.id)
    },

    async listRecentWorkflowTaskRunsForEnterprise(enterpriseId, limit = 50) {
      const normalizedLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 200) : 50
      return [...runs.values()]
        .filter((run) => run.enterpriseId === enterpriseId && run.kind === "workflow" && run.itemType === "workflow")
        .sort((left, right) => right.id - left.id)
        .slice(0, normalizedLimit)
    },

    async listPlatformArtifactsForEnterprise(enterpriseId) {
      return artifacts.filter((artifact) => artifact.enterpriseId === enterpriseId).sort((left, right) => right.id - left.id)
    },

    async listRecentPlatformArtifactsForEnterprise(enterpriseId, limit = 100) {
      const normalizedLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 300) : 100
      return artifacts
        .filter((artifact) => artifact.enterpriseId === enterpriseId)
        .sort((left, right) => right.id - left.id)
        .slice(0, normalizedLimit)
    },

    async listPlatformWorkItemsForEnterprise(enterpriseId) {
      return sortPlatformRowsByCreatedDesc(workItems.filter((workItem) => workItem.enterpriseId === enterpriseId))
    },

    async listPlatformWorkLibraryItemsForEnterprise(enterpriseId) {
      const enterpriseWorks = await this.listPlatformWorkItemsForEnterprise(enterpriseId)
      const referenceCountByArtifactId = new Map<number, number>()
      for (const workItem of workItems) {
        if (workItem.enterpriseId !== enterpriseId) continue
        referenceCountByArtifactId.set(
          workItem.sourceArtifactId,
          (referenceCountByArtifactId.get(workItem.sourceArtifactId) ?? 0) + 1,
        )
      }

      return enterpriseWorks
        .map((workItem) => {
          const artifact = artifacts.find(
            (candidate) => candidate.id === workItem.sourceArtifactId && candidate.enterpriseId === enterpriseId,
          )
          if (!artifact) return null
          return {
            workItem,
            artifact,
            referenceCount: referenceCountByArtifactId.get(workItem.sourceArtifactId) ?? 1,
          } satisfies PlatformWorkLibraryItemRecord
        })
        .filter((item): item is PlatformWorkLibraryItemRecord => item !== null)
    },

    async getPlatformArtifact(artifactId) {
      return artifacts.find((artifact) => artifact.id === artifactId) ?? null
    },

    async deletePlatformWorkItem(workItemId, enterpriseId) {
      const index = workItems.findIndex((workItem) => workItem.id === workItemId && workItem.enterpriseId === enterpriseId)
      if (index < 0) return null
      const [deleted] = workItems.splice(index, 1)
      return deleted ?? null
    },

    async movePlatformArtifactToAssetLibrary(artifactId, enterpriseId) {
      const artifact = artifacts.find((candidate) => candidate.id === artifactId && candidate.enterpriseId === enterpriseId)
      if (!artifact) return null

      const deletedWorkItemIds = workItems
        .filter((workItem) => workItem.enterpriseId === enterpriseId && workItem.sourceArtifactId === artifactId)
        .map((workItem) => workItem.id)

      for (let index = workItems.length - 1; index >= 0; index -= 1) {
        if (workItems[index]?.enterpriseId === enterpriseId && workItems[index]?.sourceArtifactId === artifactId) {
          workItems.splice(index, 1)
        }
      }

      const updatedArtifact = {
        ...artifact,
        payload: buildAssetLibraryPayloadFromArtifact(artifact),
      }
      const artifactIndex = artifacts.findIndex((candidate) => candidate.id === artifactId && candidate.enterpriseId === enterpriseId)
      artifacts.splice(artifactIndex, 1, updatedArtifact)

      return {
        artifact: updatedArtifact,
        deletedWorkItemIds,
      }
    },

    async deletePlatformArtifactPermanently(artifactId, enterpriseId) {
      const artifactIndex = artifacts.findIndex((artifact) => artifact.id === artifactId && artifact.enterpriseId === enterpriseId)
      if (artifactIndex < 0) return null
      artifacts.splice(artifactIndex, 1)
      const deletedWorkItemIds = workItems.filter(
        (workItem) => workItem.enterpriseId === enterpriseId && workItem.sourceArtifactId === artifactId,
      ).map((workItem) => workItem.id)
      for (let index = workItems.length - 1; index >= 0; index -= 1) {
        if (workItems[index]?.enterpriseId === enterpriseId && workItems[index]?.sourceArtifactId === artifactId) {
          workItems.splice(index, 1)
        }
      }
      for (let index = knowledgeSaveJobs.length - 1; index >= 0; index -= 1) {
        if (knowledgeSaveJobs[index]?.enterpriseId === enterpriseId && knowledgeSaveJobs[index]?.artifactId === artifactId) {
          knowledgeSaveJobs.splice(index, 1)
        }
      }
      return {
        artifactId,
        deletedWorkItemIds,
        deletedStorage: false,
      }
    },
  }
}

export const platformTaskRunStore: PlatformTaskRunStore = {
  createPlatformTaskRun,
  appendPlatformRunEvent,
  getPlatformTaskRun,
  savePlatformArtifact,
  promotePlatformArtifactToWorkItem,
  enqueuePlatformKnowledgeSaveJob,
  getPlatformKnowledgeSaveJob,
  updatePlatformKnowledgeSaveJob,
  listPlatformKnowledgeSaveJobsForEnterprise,
  listPlatformTaskRunsForEnterprise,
  listRecentWorkflowTaskRunsForEnterprise,
  listPlatformArtifactsForEnterprise,
  listRecentPlatformArtifactsForEnterprise,
  listPlatformWorkItemsForEnterprise,
  listPlatformWorkLibraryItemsForEnterprise,
  getPlatformArtifact,
  deletePlatformWorkItem,
  movePlatformArtifactToAssetLibrary,
  deletePlatformArtifactPermanently,
}
