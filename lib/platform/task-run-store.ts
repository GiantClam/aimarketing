import { desc, eq, inArray, sql } from "drizzle-orm"

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
export type PlatformKnowledgeSaveJobStatus = "queued" | "running" | "succeeded" | "failed"

export type PlatformTaskRunRecord = typeof platformTaskRuns.$inferSelect
export type PlatformTaskRunEventRecord = typeof platformTaskRunEvents.$inferSelect
export type PlatformArtifactRecord = typeof platformArtifacts.$inferSelect
export type PlatformWorkItemRecord = typeof platformWorkItems.$inferSelect
export type PlatformKnowledgeSaveJobRecord = typeof platformKnowledgeSaveJobs.$inferSelect

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

export type PlatformTaskRunStore = {
  createPlatformTaskRun(input: CreatePlatformTaskRunInput): Promise<PlatformTaskRunRecord>
  appendPlatformRunEvent(runId: number, input: AppendPlatformRunEventInput): Promise<PlatformTaskRunEventRecord>
  getPlatformTaskRun(runId: number): Promise<HydratedPlatformTaskRun | null>
  savePlatformArtifact(input: SavePlatformArtifactInput): Promise<PlatformArtifactRecord>
  promotePlatformArtifactToWorkItem(input: CreatePlatformWorkItemInput): Promise<PlatformWorkItemRecord>
  enqueuePlatformKnowledgeSaveJob(input: EnqueuePlatformKnowledgeSaveJobInput): Promise<PlatformKnowledgeSaveJobRecord>
  listPlatformTaskRunsForEnterprise(enterpriseId: number): Promise<PlatformTaskRunRecord[]>
  listPlatformArtifactsForEnterprise(enterpriseId: number): Promise<PlatformArtifactRecord[]>
  listPlatformWorkItemsForEnterprise(enterpriseId: number): Promise<PlatformWorkItemRecord[]>
  getPlatformArtifact(artifactId: number): Promise<PlatformArtifactRecord | null>
}

const PLATFORM_TASK_RUN_DB_RETRY_DELAYS_MS = [250, 750] as const
const isRetryablePlatformTaskRunDbError = createRetryableDbErrorMatcher(["timeout exceeded"])

const TASK_RUN_KINDS = new Set<PlatformTaskRunKind>(["workflow", "media", "tool", "agent"])
const TASK_RUN_STATUSES = new Set<PlatformTaskRunStatus>(["queued", "running", "succeeded", "failed", "cancelled"])
const RUN_EVENT_LEVELS = new Set<PlatformRunEventLevel>(["info", "warn", "error"])
const ARTIFACT_KINDS = new Set<PlatformArtifactKind>(["file", "link", "text", "json"])
const WORK_ITEM_TYPES = new Set<PlatformWorkItemType>(["deck", "article", "image_set", "video", "audio", "document"])
const KNOWLEDGE_JOB_STATUSES = new Set<PlatformKnowledgeSaveJobStatus>(["queued", "running", "succeeded", "failed"])

async function withPlatformTaskRunDbRetry<T>(label: string, operation: () => Promise<T>) {
  return withDbRetry(label, operation, {
    retryDelaysMs: PLATFORM_TASK_RUN_DB_RETRY_DELAYS_MS,
    isRetryable: isRetryablePlatformTaskRunDbError,
    logPrefix: "platform.task-run-store.db.retry",
    exhaustedErrorPrefix: "platform_task_run_store_db_retry_exhausted",
  })
}

let ensurePlatformTaskRunTablesPromise: Promise<void> | null = null

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
      throw error
    })
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
    payload: input.payload ?? null,
    createdAt: new Date(),
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

export async function getPlatformArtifact(artifactId: number) {
  await ensurePlatformTaskRunTables()

  const [row] = await withPlatformTaskRunDbRetry("get-platform-artifact", () =>
    db.select().from(platformArtifacts).where(eq(platformArtifacts.id, artifactId)),
  )

  return row ?? null
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
      const row: PlatformTaskRunRecord = {
        id: nextRunId,
        ...buildPlatformTaskRunRecord(input),
      }
      nextRunId += 1
      runs.set(row.id, row)
      return row
    },

    async appendPlatformRunEvent(runId, input) {
      const row: PlatformTaskRunEventRecord = {
        id: nextEventId,
        ...buildPlatformRunEventRecord(runId, input),
      }
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
      const row: PlatformArtifactRecord = {
        id: nextArtifactId,
        ...buildPlatformArtifactRecord(input),
      }
      nextArtifactId += 1
      artifacts.push(row)
      return row
    },

    async promotePlatformArtifactToWorkItem(input) {
      const row: PlatformWorkItemRecord = {
        id: nextWorkItemId,
        ...buildPlatformWorkItemRecord(input),
      }
      nextWorkItemId += 1
      workItems.push(row)
      return row
    },

    async enqueuePlatformKnowledgeSaveJob(input) {
      const row: PlatformKnowledgeSaveJobRecord = {
        id: nextKnowledgeJobId,
        ...buildPlatformKnowledgeSaveJobRecord(input),
      }
      nextKnowledgeJobId += 1
      knowledgeSaveJobs.push(row)
      return row
    },

    async listPlatformTaskRunsForEnterprise(enterpriseId) {
      return [...runs.values()]
        .filter((run) => run.enterpriseId === enterpriseId)
        .sort((left, right) => right.id - left.id)
    },

    async listPlatformArtifactsForEnterprise(enterpriseId) {
      return artifacts.filter((artifact) => artifact.enterpriseId === enterpriseId).sort((left, right) => right.id - left.id)
    },

    async listPlatformWorkItemsForEnterprise(enterpriseId) {
      return workItems.filter((workItem) => workItem.enterpriseId === enterpriseId).sort((left, right) => right.id - left.id)
    },

    async getPlatformArtifact(artifactId) {
      return artifacts.find((artifact) => artifact.id === artifactId) ?? null
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
  listPlatformTaskRunsForEnterprise,
  listPlatformArtifactsForEnterprise,
  listPlatformWorkItemsForEnterprise,
  getPlatformArtifact,
}
