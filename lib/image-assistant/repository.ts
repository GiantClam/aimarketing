import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import {
  imageDesignAssets,
  imageDesignCanvasDocuments,
  imageDesignCanvasLayers,
  imageDesignMessages,
  imageDesignSessions,
  imageDesignVersionCandidates,
  imageDesignVersions,
} from "@/lib/db/schema-image-assistant"
import type {
  ImageAssistantAsset,
  ImageAssistantAssetType,
  ImageAssistantCanvasDocument,
  ImageAssistantCandidate,
  ImageAssistantConversationSummary,
  ImageAssistantLayer,
  ImageAssistantMessage,
  ImageAssistantMode,
  ImageAssistantReferenceRole,
  ImageAssistantSessionDetail,
  ImageAssistantSizePreset,
  ImageAssistantTaskType,
  ImageAssistantVersionKind,
  ImageAssistantVersionSummary,
} from "@/lib/image-assistant/types"

const DB_RETRY_DELAYS_MS = [250, 750]
const SESSION_PREFIX = "[image-assistant] "

let ensureTablesPromise: Promise<void> | null = null

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error)
}

function isRetryableDbError(error: unknown) {
  const message = getErrorMessage(error)
  const causeMessage =
    error && typeof error === "object" && "cause" in error ? getErrorMessage((error as { cause?: unknown }).cause) : ""
  const combined = `${message} ${causeMessage}`.toLowerCase()

  return (
    combined.includes("error connecting to database") ||
    combined.includes("fetch failed") ||
    combined.includes("connect timeout") ||
    combined.includes("und_err_connect_timeout")
  )
}

async function withDbRetry<T>(label: string, operation: () => Promise<T>) {
  for (let attempt = 0; attempt <= DB_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      if (!isRetryableDbError(error) || attempt === DB_RETRY_DELAYS_MS.length) {
        throw error
      }

      console.warn("image-assistant.db.retry", {
        label,
        attempt: attempt + 1,
        message: getErrorMessage(error),
      })
      await sleep(DB_RETRY_DELAYS_MS[attempt])
    }
  }

  throw new Error(`image_assistant_db_retry_exhausted:${label}`)
}

function toEpochSeconds(value: Date | string | number | null | undefined) {
  if (value instanceof Date) return Math.floor(value.getTime() / 1000)
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return Math.floor(parsed.getTime() / 1000)
  }
  return Math.floor(Date.now() / 1000)
}

function normalizeSessionTitle(title: string) {
  return title.startsWith(SESSION_PREFIX) ? title.slice(SESSION_PREFIX.length) : title
}

function toStoredSessionTitle(title: string) {
  const normalized = title.replace(/\s+/g, " ").trim().slice(0, 80)
  return `${SESSION_PREFIX}${normalized || "未命名设计"}`
}

async function ensureImageAssistantTables() {
  if (!ensureTablesPromise) {
    ensureTablesPromise = withDbRetry("ensure-image-assistant-tables", async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS image_design_sessions (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          enterprise_id INTEGER REFERENCES enterprises(id) ON DELETE SET NULL,
          title VARCHAR(255) NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'active',
          current_mode VARCHAR(16) NOT NULL DEFAULT 'chat',
          current_version_id INTEGER,
          current_canvas_document_id INTEGER,
          cover_asset_id INTEGER,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
          archived_at TIMESTAMP
        )
      `)
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS image_design_messages (
          id SERIAL PRIMARY KEY,
          session_id INTEGER NOT NULL REFERENCES image_design_sessions(id) ON DELETE CASCADE,
          role VARCHAR(20) NOT NULL,
          message_type VARCHAR(32) NOT NULL DEFAULT 'prompt',
          content TEXT NOT NULL,
          task_type VARCHAR(32),
          request_payload JSONB,
          response_payload JSONB,
          created_version_id INTEGER,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `)
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS image_design_assets (
          id SERIAL PRIMARY KEY,
          session_id INTEGER REFERENCES image_design_sessions(id) ON DELETE SET NULL,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          asset_type VARCHAR(32) NOT NULL,
          reference_role VARCHAR(32),
          storage_provider VARCHAR(32) NOT NULL DEFAULT 'r2',
          storage_key TEXT NOT NULL UNIQUE,
          public_url TEXT,
          mime_type VARCHAR(100) NOT NULL,
          file_size INTEGER NOT NULL DEFAULT 0,
          width INTEGER,
          height INTEGER,
          sha256 VARCHAR(64),
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          meta JSONB,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `)
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS image_design_canvas_documents (
          id SERIAL PRIMARY KEY,
          session_id INTEGER NOT NULL REFERENCES image_design_sessions(id) ON DELETE CASCADE,
          base_version_id INTEGER,
          width INTEGER NOT NULL DEFAULT 1080,
          height INTEGER NOT NULL DEFAULT 1080,
          background_asset_id INTEGER,
          revision INTEGER NOT NULL DEFAULT 1,
          status VARCHAR(20) NOT NULL DEFAULT 'draft',
          last_saved_at TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `)
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS image_design_versions (
          id SERIAL PRIMARY KEY,
          session_id INTEGER NOT NULL REFERENCES image_design_sessions(id) ON DELETE CASCADE,
          parent_version_id INTEGER,
          source_message_id INTEGER,
          version_kind VARCHAR(32) NOT NULL,
          branch_key VARCHAR(64),
          provider VARCHAR(32),
          model VARCHAR(128),
          prompt_text TEXT,
          snapshot_asset_id INTEGER,
          mask_asset_id INTEGER,
          selected_candidate_id INTEGER,
          canvas_document_id INTEGER,
          status VARCHAR(20) NOT NULL DEFAULT 'ready',
          meta JSONB,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `)
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS image_design_version_candidates (
          id SERIAL PRIMARY KEY,
          version_id INTEGER NOT NULL REFERENCES image_design_versions(id) ON DELETE CASCADE,
          asset_id INTEGER NOT NULL REFERENCES image_design_assets(id) ON DELETE CASCADE,
          candidate_index INTEGER NOT NULL,
          is_selected BOOLEAN NOT NULL DEFAULT FALSE,
          score INTEGER,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `)
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS image_design_canvas_layers (
          id SERIAL PRIMARY KEY,
          canvas_document_id INTEGER NOT NULL REFERENCES image_design_canvas_documents(id) ON DELETE CASCADE,
          layer_type VARCHAR(32) NOT NULL,
          name VARCHAR(255) NOT NULL,
          z_index INTEGER NOT NULL DEFAULT 0,
          visible BOOLEAN NOT NULL DEFAULT TRUE,
          locked BOOLEAN NOT NULL DEFAULT FALSE,
          transform JSONB NOT NULL,
          style JSONB,
          content JSONB,
          asset_id INTEGER REFERENCES image_design_assets(id) ON DELETE SET NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `)
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS image_design_exports (
          id SERIAL PRIMARY KEY,
          session_id INTEGER NOT NULL REFERENCES image_design_sessions(id) ON DELETE CASCADE,
          version_id INTEGER,
          canvas_document_id INTEGER,
          asset_id INTEGER NOT NULL REFERENCES image_design_assets(id) ON DELETE CASCADE,
          format VARCHAR(16) NOT NULL,
          size_preset VARCHAR(16) NOT NULL,
          transparent_background BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `)
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS image_design_version_candidate_unique_idx
        ON image_design_version_candidates (version_id, candidate_index)
      `)
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS image_design_sessions_user_updated_idx
        ON image_design_sessions (user_id, updated_at DESC, id DESC)
      `)
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS image_design_messages_session_created_idx
        ON image_design_messages (session_id, created_at ASC, id ASC)
      `)
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS image_design_versions_session_created_idx
        ON image_design_versions (session_id, created_at DESC, id DESC)
      `)
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS image_design_canvas_layers_document_z_idx
        ON image_design_canvas_layers (canvas_document_id, z_index ASC, id ASC)
      `)
    }).catch((error) => {
      ensureTablesPromise = null
      throw error
    })
  }

  await ensureTablesPromise
}

function mapSession(row: any, coverAssetUrl?: string | null): ImageAssistantConversationSummary {
  return {
    id: String(row.id),
    name: normalizeSessionTitle(row.title),
    status: row.status || "active",
    current_mode: row.currentMode || "chat",
    cover_asset_url: coverAssetUrl || null,
    current_version_id: row.currentVersionId ? String(row.currentVersionId) : null,
    current_canvas_document_id: row.currentCanvasDocumentId ? String(row.currentCanvasDocumentId) : null,
    created_at: toEpochSeconds(row.createdAt),
    updated_at: toEpochSeconds(row.updatedAt),
  }
}

function mapAsset(row: any): ImageAssistantAsset {
  return {
    id: String(row.id),
    session_id: row.sessionId ? String(row.sessionId) : null,
    asset_type: row.assetType,
    reference_role: row.referenceRole || null,
    url: row.publicUrl || null,
    mime_type: row.mimeType,
    file_size: Number(row.fileSize || 0),
    width: row.width ?? null,
    height: row.height ?? null,
    status: row.status,
    meta: (row.meta as Record<string, unknown> | null | undefined) || null,
    created_at: toEpochSeconds(row.createdAt),
  }
}

function mapMessage(row: any): ImageAssistantMessage {
  return {
    id: String(row.id),
    session_id: String(row.sessionId),
    role: row.role,
    message_type: row.messageType,
    task_type: row.taskType || null,
    content: row.content,
    created_version_id: row.createdVersionId ? String(row.createdVersionId) : null,
    created_at: toEpochSeconds(row.createdAt),
  }
}

function mapCandidate(row: any): ImageAssistantCandidate {
  return {
    id: String(row.id),
    version_id: String(row.versionId),
    asset_id: String(row.assetId),
    candidate_index: row.candidateIndex,
    is_selected: Boolean(row.isSelected),
    url: row.publicUrl || null,
  }
}

function mapLayer(row: any, assetMap: Map<number, ImageAssistantAsset>): ImageAssistantLayer {
  return {
    id: String(row.id),
    layer_type: row.layerType,
    name: row.name,
    z_index: row.zIndex,
    visible: Boolean(row.visible),
    locked: Boolean(row.locked),
    transform: row.transform as any,
    style: (row.style as any) || null,
    content: (row.content as any) || null,
    asset_id: row.assetId ? String(row.assetId) : null,
    asset_url: row.assetId ? assetMap.get(row.assetId)?.url || null : null,
  }
}

async function listVersionCandidates(versionIds: number[]) {
  if (!versionIds.length) return [] as any[]

  return withDbRetry("list-version-candidates", () =>
    db
      .select({
        id: imageDesignVersionCandidates.id,
        versionId: imageDesignVersionCandidates.versionId,
        assetId: imageDesignVersionCandidates.assetId,
        candidateIndex: imageDesignVersionCandidates.candidateIndex,
        isSelected: imageDesignVersionCandidates.isSelected,
        publicUrl: imageDesignAssets.publicUrl,
      })
      .from(imageDesignVersionCandidates)
      .leftJoin(imageDesignAssets, eq(imageDesignVersionCandidates.assetId, imageDesignAssets.id))
      .where(inArray(imageDesignVersionCandidates.versionId, versionIds))
      .orderBy(asc(imageDesignVersionCandidates.versionId), asc(imageDesignVersionCandidates.candidateIndex)),
  )
}

export async function createImageAssistantSession(params: {
  userId: number
  enterpriseId?: number | null
  title?: string | null
}) {
  await ensureImageAssistantTables()

  const inserted = await withDbRetry("create-image-session", () =>
    db
      .insert(imageDesignSessions)
      .values({
        userId: params.userId,
        enterpriseId: params.enterpriseId || null,
        title: toStoredSessionTitle(params.title || "未命名设计"),
        status: "active",
        currentMode: "chat",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning(),
  )

  return mapSession(inserted[0])
}

export async function listImageAssistantSessions(userId: number, limit = 30) {
  await ensureImageAssistantTables()

  const rows = await withDbRetry("list-image-sessions", () =>
    db
      .select({
        id: imageDesignSessions.id,
        title: imageDesignSessions.title,
        status: imageDesignSessions.status,
        currentMode: imageDesignSessions.currentMode,
        currentVersionId: imageDesignSessions.currentVersionId,
        currentCanvasDocumentId: imageDesignSessions.currentCanvasDocumentId,
        createdAt: imageDesignSessions.createdAt,
        updatedAt: imageDesignSessions.updatedAt,
        coverAssetUrl: imageDesignAssets.publicUrl,
      })
      .from(imageDesignSessions)
      .leftJoin(imageDesignAssets, eq(imageDesignSessions.coverAssetId, imageDesignAssets.id))
      .where(and(eq(imageDesignSessions.userId, userId), sql`${imageDesignSessions.title} LIKE ${`${SESSION_PREFIX}%`}`))
      .orderBy(desc(imageDesignSessions.updatedAt), desc(imageDesignSessions.id))
      .limit(Math.max(1, Math.min(limit, 50))),
  )

  return rows.map((row) => mapSession(row, row.coverAssetUrl))
}

export async function getImageAssistantSession(userId: number, sessionId: string) {
  await ensureImageAssistantTables()
  const parsedId = Number.parseInt(sessionId, 10)
  if (!Number.isFinite(parsedId) || parsedId <= 0) return null

  const rows = await withDbRetry("get-image-session", () =>
    db
      .select({
        id: imageDesignSessions.id,
        userId: imageDesignSessions.userId,
        title: imageDesignSessions.title,
        status: imageDesignSessions.status,
        currentMode: imageDesignSessions.currentMode,
        currentVersionId: imageDesignSessions.currentVersionId,
        currentCanvasDocumentId: imageDesignSessions.currentCanvasDocumentId,
        createdAt: imageDesignSessions.createdAt,
        updatedAt: imageDesignSessions.updatedAt,
        coverAssetUrl: imageDesignAssets.publicUrl,
      })
      .from(imageDesignSessions)
      .leftJoin(imageDesignAssets, eq(imageDesignSessions.coverAssetId, imageDesignAssets.id))
      .where(and(eq(imageDesignSessions.id, parsedId), eq(imageDesignSessions.userId, userId)))
      .limit(1),
  )

  if (!rows[0] || !String(rows[0].title || "").startsWith(SESSION_PREFIX)) {
    return null
  }

  return rows[0]
}

export async function updateImageAssistantSession(params: {
  userId: number
  sessionId: string
  title?: string
  currentMode?: ImageAssistantMode
  currentVersionId?: string | null
  currentCanvasDocumentId?: string | null
  coverAssetId?: string | null
}) {
  const existing = await getImageAssistantSession(params.userId, params.sessionId)
  if (!existing) return null

  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (typeof params.title === "string") patch.title = toStoredSessionTitle(params.title)
  if (params.currentMode) patch.currentMode = params.currentMode
  if (params.currentVersionId !== undefined) patch.currentVersionId = params.currentVersionId ? Number(params.currentVersionId) : null
  if (params.currentCanvasDocumentId !== undefined) patch.currentCanvasDocumentId = params.currentCanvasDocumentId ? Number(params.currentCanvasDocumentId) : null
  if (params.coverAssetId !== undefined) patch.coverAssetId = params.coverAssetId ? Number(params.coverAssetId) : null

  await withDbRetry("update-image-session", () =>
    db.update(imageDesignSessions).set(patch as any).where(eq(imageDesignSessions.id, Number(params.sessionId))),
  )

  const next = await getImageAssistantSession(params.userId, params.sessionId)
  return next ? mapSession(next, next.coverAssetUrl) : null
}

export async function createImageAssistantAsset(params: {
  userId: number
  sessionId?: string | null
  assetType: ImageAssistantAssetType
  referenceRole?: ImageAssistantReferenceRole | null
  storageProvider?: string
  storageKey: string
  publicUrl?: string | null
  mimeType: string
  fileSize: number
  width?: number | null
  height?: number | null
  sha256?: string | null
  status?: "pending" | "ready" | "failed"
  meta?: Record<string, unknown> | null
}) {
  await ensureImageAssistantTables()

  const inserted = await withDbRetry("create-image-asset", () =>
    db
      .insert(imageDesignAssets)
      .values({
        sessionId: params.sessionId ? Number(params.sessionId) : null,
        userId: params.userId,
        assetType: params.assetType,
        referenceRole: params.referenceRole || null,
        storageProvider: params.storageProvider || "r2",
        storageKey: params.storageKey,
        publicUrl: params.publicUrl || null,
        mimeType: params.mimeType,
        fileSize: params.fileSize,
        width: params.width || null,
        height: params.height || null,
        sha256: params.sha256 || null,
        status: params.status || "ready",
        meta: params.meta || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning(),
  )

  return mapAsset(inserted[0])
}

export async function listImageAssistantAssets(userId: number, sessionId: string) {
  const existing = await getImageAssistantSession(userId, sessionId)
  if (!existing) return []

  const rows = await withDbRetry("list-image-assets", () =>
    db
      .select()
      .from(imageDesignAssets)
      .where(and(eq(imageDesignAssets.userId, userId), eq(imageDesignAssets.sessionId, Number(sessionId))))
      .orderBy(desc(imageDesignAssets.createdAt), desc(imageDesignAssets.id)),
  )

  return rows.map(mapAsset)
}

export async function createImageAssistantMessage(params: {
  sessionId: string
  role: "user" | "assistant" | "system"
  messageType: "prompt" | "result_summary" | "error" | "note"
  content: string
  taskType?: ImageAssistantTaskType | null
  requestPayload?: Record<string, unknown> | null
  responsePayload?: Record<string, unknown> | null
  createdVersionId?: string | null
}) {
  const inserted = await withDbRetry("create-image-message", () =>
    db
      .insert(imageDesignMessages)
      .values({
        sessionId: Number(params.sessionId),
        role: params.role,
        messageType: params.messageType,
        content: params.content,
        taskType: params.taskType || null,
        requestPayload: params.requestPayload || null,
        responsePayload: params.responsePayload || null,
        createdVersionId: params.createdVersionId ? Number(params.createdVersionId) : null,
        createdAt: new Date(),
      })
      .returning(),
  )

  return mapMessage(inserted[0])
}

export async function createVersionWithCandidates(params: {
  sessionId: string
  parentVersionId?: string | null
  sourceMessageId?: string | null
  versionKind: ImageAssistantVersionKind
  provider?: string | null
  model?: string | null
  promptText?: string | null
  snapshotAssetId?: string | null
  maskAssetId?: string | null
  canvasDocumentId?: string | null
  status?: "processing" | "ready" | "failed"
  meta?: Record<string, unknown> | null
  selectedCandidateIndex?: number
  candidateAssetIds: string[]
}) {
  const insertedVersion = await withDbRetry("create-image-version", () =>
    db
      .insert(imageDesignVersions)
      .values({
        sessionId: Number(params.sessionId),
        parentVersionId: params.parentVersionId ? Number(params.parentVersionId) : null,
        sourceMessageId: params.sourceMessageId ? Number(params.sourceMessageId) : null,
        versionKind: params.versionKind,
        branchKey: params.parentVersionId || null,
        provider: params.provider || null,
        model: params.model || null,
        promptText: params.promptText || null,
        snapshotAssetId: params.snapshotAssetId ? Number(params.snapshotAssetId) : null,
        maskAssetId: params.maskAssetId ? Number(params.maskAssetId) : null,
        canvasDocumentId: params.canvasDocumentId ? Number(params.canvasDocumentId) : null,
        status: params.status || "ready",
        meta: params.meta || null,
        createdAt: new Date(),
      })
      .returning(),
  )

  const versionId = insertedVersion[0].id
  const selectedIndex = params.selectedCandidateIndex ?? 0
  const candidateRows = await withDbRetry("create-image-version-candidates", () =>
    db
      .insert(imageDesignVersionCandidates)
      .values(
        params.candidateAssetIds.map((assetId, index) => ({
          versionId,
          assetId: Number(assetId),
          candidateIndex: index,
          isSelected: index === selectedIndex,
          createdAt: new Date(),
        })),
      )
      .returning(),
  )

  const selectedCandidateId = candidateRows.find((row) => row.candidateIndex === selectedIndex)?.id || candidateRows[0]?.id || null
  if (selectedCandidateId) {
    await withDbRetry("update-image-version-selected-candidate", () =>
      db.update(imageDesignVersions).set({ selectedCandidateId }).where(eq(imageDesignVersions.id, versionId)),
    )
  }

  return {
    versionId: String(versionId),
    selectedCandidateId: selectedCandidateId ? String(selectedCandidateId) : null,
  }
}

export async function setSelectedVersionCandidate(params: {
  userId: number
  sessionId: string
  versionId: string
  candidateId: string
}) {
  const session = await getImageAssistantSession(params.userId, params.sessionId)
  if (!session) return null

  await withDbRetry("clear-version-selected-candidate", () =>
    db
      .update(imageDesignVersionCandidates)
      .set({ isSelected: false })
      .where(eq(imageDesignVersionCandidates.versionId, Number(params.versionId))),
  )
  await withDbRetry("set-version-selected-candidate", () =>
    db
      .update(imageDesignVersionCandidates)
      .set({ isSelected: true })
      .where(eq(imageDesignVersionCandidates.id, Number(params.candidateId))),
  )
  await withDbRetry("set-version-selected-candidate-id", () =>
    db
      .update(imageDesignVersions)
      .set({ selectedCandidateId: Number(params.candidateId) })
      .where(eq(imageDesignVersions.id, Number(params.versionId))),
  )

  const candidate = await withDbRetry("get-candidate-asset-id", () =>
    db
      .select({ assetId: imageDesignVersionCandidates.assetId })
      .from(imageDesignVersionCandidates)
      .where(eq(imageDesignVersionCandidates.id, Number(params.candidateId)))
      .limit(1),
  )

  await withDbRetry("update-session-current-version-pointer", () =>
    db
      .update(imageDesignSessions)
      .set({
        currentVersionId: Number(params.versionId),
        coverAssetId: candidate[0]?.assetId || null,
        updatedAt: new Date(),
      })
      .where(eq(imageDesignSessions.id, Number(params.sessionId))),
  )

  return true
}

export async function listImageAssistantMessages(userId: number, sessionId: string) {
  const existing = await getImageAssistantSession(userId, sessionId)
  if (!existing) return []

  const rows = await withDbRetry("list-image-messages", () =>
    db
      .select()
      .from(imageDesignMessages)
      .where(eq(imageDesignMessages.sessionId, Number(sessionId)))
      .orderBy(asc(imageDesignMessages.createdAt), asc(imageDesignMessages.id)),
  )

  return rows.map(mapMessage)
}

export async function listImageAssistantVersions(userId: number, sessionId: string) {
  const existing = await getImageAssistantSession(userId, sessionId)
  if (!existing) return []

  const rows = await withDbRetry("list-image-versions", () =>
    db
      .select()
      .from(imageDesignVersions)
      .where(eq(imageDesignVersions.sessionId, Number(sessionId)))
      .orderBy(desc(imageDesignVersions.createdAt), desc(imageDesignVersions.id)),
  )

  const candidates = await listVersionCandidates(rows.map((row) => row.id))
  const groupedCandidates = new Map<number, ImageAssistantCandidate[]>()
  for (const row of candidates) {
    const mapped = mapCandidate(row)
    const bucket = groupedCandidates.get(row.versionId) || []
    bucket.push(mapped)
    groupedCandidates.set(row.versionId, bucket)
  }

  return rows.map(
    (row) =>
      ({
        id: String(row.id),
        parent_version_id: row.parentVersionId ? String(row.parentVersionId) : null,
        version_kind: row.versionKind as ImageAssistantVersionKind,
        status: row.status as ImageAssistantVersionSummary["status"],
        provider: row.provider || null,
        model: row.model || null,
        prompt_text: row.promptText || null,
        selected_candidate_id: row.selectedCandidateId ? String(row.selectedCandidateId) : null,
        created_at: toEpochSeconds(row.createdAt),
        candidates: groupedCandidates.get(row.id) || [],
      }) satisfies ImageAssistantVersionSummary,
  )
}

export async function saveImageAssistantCanvas(params: {
  userId: number
  sessionId: string
  canvasDocumentId?: string | null
  baseVersionId?: string | null
  width: number
  height: number
  backgroundAssetId?: string | null
  revision?: number
  layers: ImageAssistantLayer[]
}) {
  const session = await getImageAssistantSession(params.userId, params.sessionId)
  if (!session) {
    throw new Error("image_assistant_session_not_found")
  }

  let documentId = params.canvasDocumentId ? Number(params.canvasDocumentId) : null
  let nextRevision = 1

  if (!documentId) {
    const created = await withDbRetry("create-image-canvas-document", () =>
      db
        .insert(imageDesignCanvasDocuments)
        .values({
          sessionId: Number(params.sessionId),
          baseVersionId: params.baseVersionId ? Number(params.baseVersionId) : null,
          width: params.width,
          height: params.height,
          backgroundAssetId: params.backgroundAssetId ? Number(params.backgroundAssetId) : null,
          revision: 1,
          status: "saved",
          lastSavedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning(),
    )
    documentId = created[0].id
  } else {
    const existingDocumentId = documentId
    const existingDocument = await withDbRetry("get-image-canvas-document", () =>
      db
        .select({ id: imageDesignCanvasDocuments.id, revision: imageDesignCanvasDocuments.revision })
        .from(imageDesignCanvasDocuments)
        .where(eq(imageDesignCanvasDocuments.id, existingDocumentId))
        .limit(1),
    )
    if (!existingDocument[0]) {
      throw new Error("image_assistant_canvas_document_not_found")
    }
    if (typeof params.revision === "number" && params.revision !== existingDocument[0].revision) {
      throw new Error("image_assistant_canvas_revision_conflict")
    }
    nextRevision = existingDocument[0].revision + 1

    await withDbRetry("update-image-canvas-document", () =>
      db
        .update(imageDesignCanvasDocuments)
        .set({
          baseVersionId: params.baseVersionId ? Number(params.baseVersionId) : null,
          width: params.width,
          height: params.height,
          backgroundAssetId: params.backgroundAssetId ? Number(params.backgroundAssetId) : null,
          revision: nextRevision,
          status: "saved",
          lastSavedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(imageDesignCanvasDocuments.id, existingDocumentId)),
    )

    await withDbRetry("delete-existing-image-canvas-layers", () =>
      db.delete(imageDesignCanvasLayers).where(eq(imageDesignCanvasLayers.canvasDocumentId, existingDocumentId)),
    )
  }

  if (documentId && params.layers.length) {
    await withDbRetry("insert-image-canvas-layers", () =>
      db.insert(imageDesignCanvasLayers).values(
        params.layers.map((layer, index) => ({
          canvasDocumentId: documentId!,
          layerType: layer.layer_type,
          name: layer.name,
          zIndex: layer.z_index ?? index,
          visible: layer.visible,
          locked: layer.locked,
          transform: layer.transform,
          style: layer.style || null,
          content: layer.content || null,
          assetId: layer.asset_id ? Number(layer.asset_id) : null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      ),
    )
  }

  await withDbRetry("update-session-canvas-pointer", () =>
    db
      .update(imageDesignSessions)
      .set({
        currentCanvasDocumentId: documentId!,
        currentMode: "canvas",
        updatedAt: new Date(),
      })
      .where(eq(imageDesignSessions.id, Number(params.sessionId))),
  )

  return {
    canvasDocumentId: String(documentId!),
    revision: nextRevision,
  }
}

export async function getImageAssistantCanvasDocument(userId: number, sessionId: string, canvasDocumentId?: string | null) {
  const session = await getImageAssistantSession(userId, sessionId)
  if (!session) return null

  const targetId = canvasDocumentId
    ? Number(canvasDocumentId)
    : typeof session.currentCanvasDocumentId === "number"
      ? session.currentCanvasDocumentId
      : null
  if (targetId == null || !Number.isFinite(targetId) || targetId <= 0) return null

  const [documentRow] = await withDbRetry("get-image-canvas-document-detail", () =>
    db
      .select()
      .from(imageDesignCanvasDocuments)
      .where(eq(imageDesignCanvasDocuments.id, targetId))
      .limit(1),
  )

  if (!documentRow) return null

  const layerRows = await withDbRetry("list-image-canvas-layers", () =>
    db
      .select()
      .from(imageDesignCanvasLayers)
      .where(eq(imageDesignCanvasLayers.canvasDocumentId, documentRow.id))
      .orderBy(asc(imageDesignCanvasLayers.zIndex), asc(imageDesignCanvasLayers.id)),
  )

  const assetIds = layerRows.map((row) => row.assetId).filter((value): value is number => Number.isFinite(value as number))
  const assetRows = assetIds.length
    ? await withDbRetry("list-image-canvas-layer-assets", () =>
        db.select().from(imageDesignAssets).where(inArray(imageDesignAssets.id, assetIds)),
      )
    : []
  const assetMap = new Map(assetRows.map((row) => [row.id, mapAsset(row)]))

  return {
    id: String(documentRow.id),
    session_id: String(documentRow.sessionId),
    base_version_id: documentRow.baseVersionId ? String(documentRow.baseVersionId) : null,
    width: documentRow.width,
    height: documentRow.height,
    background_asset_id: documentRow.backgroundAssetId ? String(documentRow.backgroundAssetId) : null,
    revision: documentRow.revision,
    status: documentRow.status as ImageAssistantCanvasDocument["status"],
    updated_at: toEpochSeconds(documentRow.updatedAt),
    layers: layerRows.map((row) => mapLayer(row, assetMap)),
  } satisfies ImageAssistantCanvasDocument
}

export async function getImageAssistantSessionDetail(userId: number, sessionId: string): Promise<ImageAssistantSessionDetail | null> {
  const session = await getImageAssistantSession(userId, sessionId)
  if (!session) return null

  const [summary, messages, versions, assets, canvasDocument] = await Promise.all([
    Promise.resolve(mapSession(session, session.coverAssetUrl)),
    listImageAssistantMessages(userId, sessionId),
    listImageAssistantVersions(userId, sessionId),
    listImageAssistantAssets(userId, sessionId),
    getImageAssistantCanvasDocument(userId, sessionId),
  ])

  return {
    session: summary,
    messages,
    versions,
    assets,
    canvas_document: canvasDocument,
  }
}

export async function logImageAssistantExport(params: {
  userId: number
  sessionId: string
  assetId: string
  format: string
  sizePreset: ImageAssistantSizePreset
  transparentBackground: boolean
  versionId?: string | null
  canvasDocumentId?: string | null
}) {
  const session = await getImageAssistantSession(params.userId, params.sessionId)
  if (!session) return null

  await withDbRetry("log-image-export", () =>
    db.execute(sql`
      INSERT INTO image_design_exports (
        session_id,
        version_id,
        canvas_document_id,
        asset_id,
        format,
        size_preset,
        transparent_background,
        created_at
      )
      VALUES (
        ${Number(params.sessionId)},
        ${params.versionId ? Number(params.versionId) : null},
        ${params.canvasDocumentId ? Number(params.canvasDocumentId) : null},
        ${Number(params.assetId)},
        ${params.format},
        ${params.sizePreset},
        ${params.transparentBackground},
        NOW()
      )
    `),
  )

  return true
}
