import { and, asc, desc, eq, inArray, lt, or, sql } from "drizzle-orm"

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
import { users } from "@/lib/db/schema"
import type {
  ImageAssistantAsset,
  ImageAssistantAssetType,
  ImageAssistantCanvasDocument,
  ImageAssistantCandidate,
  ImageAssistantConversationPage,
  ImageAssistantConversationSummary,
  ImageAssistantLayer,
  ImageAssistantMessage,
  ImageAssistantMessagePage,
  ImageAssistantMode,
  ImageAssistantReferenceRole,
  ImageAssistantSessionDetail,
  ImageAssistantSessionDetailMeta,
  ImageAssistantSizePreset,
  ImageAssistantTaskType,
  ImageAssistantVersionKind,
  ImageAssistantVersionPage,
  ImageAssistantVersionSummary,
} from "@/lib/image-assistant/types"

const DB_RETRY_DELAYS_MS = [250, 750]
const SESSION_PREFIX = "[image-assistant] "

type CursorParts = {
  timestamp: Date
  id: number
}

type ImageAssistantListMessagesOptions = {
  limit?: number
  cursor?: string | null
  skipSessionValidation?: boolean
}

type ImageAssistantListVersionsOptions = {
  limit?: number
  cursor?: string | null
}

type ImageAssistantListAssetsOptions = {
  limit?: number
  assetTypes?: ImageAssistantAssetType[]
  assetIds?: string[]
  skipSessionValidation?: boolean
}

type ImageAssistantSessionDetailOptions = {
  includeMessages?: boolean
  includeVersions?: boolean
  includeAssets?: boolean
  includeCanvas?: boolean
  messageLimit?: number
  versionLimit?: number
  assetLimit?: number
  assetTypes?: ImageAssistantAssetType[]
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error)
}

type ImageSessionAccessScope = {
  enterpriseId: number | null
  isEnterpriseAdmin: boolean
}

function getCombinedErrorMessage(error: unknown) {
  const message = getErrorMessage(error)
  const causeMessage =
    error && typeof error === "object" && "cause" in error ? getErrorMessage((error as { cause?: unknown }).cause) : ""
  return `${message} ${causeMessage}`.toLowerCase()
}

function isMissingColumnError(error: unknown, columnName: string) {
  const combined = getCombinedErrorMessage(error)
  return (
    combined.includes(columnName.toLowerCase()) &&
    (combined.includes("does not exist") || combined.includes("undefined column") || combined.includes("column"))
  )
}

function isLegacySessionColumnMissingError(error: unknown) {
  return (
    isMissingColumnError(error, "cover_asset_id") ||
    isMissingColumnError(error, "status") ||
    isMissingColumnError(error, "current_mode") ||
    isMissingColumnError(error, "current_version_id") ||
    isMissingColumnError(error, "current_canvas_document_id")
  )
}

function removeMissingSessionPatchFields(error: unknown, patch: Record<string, unknown>) {
  const fieldColumnPairs: Array<{ field: string; column: string }> = [
    { field: "coverAssetId", column: "cover_asset_id" },
    { field: "status", column: "status" },
    { field: "currentMode", column: "current_mode" },
    { field: "currentVersionId", column: "current_version_id" },
    { field: "currentCanvasDocumentId", column: "current_canvas_document_id" },
  ]

  const fallbackPatch: Record<string, unknown> = { ...patch }
  let removed = 0

  for (const pair of fieldColumnPairs) {
    if (Object.prototype.hasOwnProperty.call(fallbackPatch, pair.field) && isMissingColumnError(error, pair.column)) {
      delete fallbackPatch[pair.field]
      removed += 1
    }
  }

  return { fallbackPatch, removed }
}

function isRetryableDbError(error: unknown) {
  const combined = getCombinedErrorMessage(error)

  return (
    combined.includes("error connecting to database") ||
    combined.includes("fetch failed") ||
    combined.includes("connect timeout") ||
    combined.includes("connection timeout") ||
    combined.includes("econnreset") ||
    combined.includes("econnrefused") ||
    combined.includes("und_err_connect_timeout") ||
    combined.includes("connection terminated unexpectedly") ||
    combined.includes("terminating connection") ||
    combined.includes("quota")
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

function normalizeListCoverUrl(url?: string | null) {
  if (!url) return null
  if (url.startsWith("data:") && url.length > 8_192) {
    return null
  }
  return url
}

function toStoredSessionTitle(title: string) {
  const normalized = title.replace(/\s+/g, " ").trim().slice(0, 80)
  return `${SESSION_PREFIX}${normalized || "Untitled design"}`
}

function parseDatabaseId(value: string | null | undefined) {
  const parsed = Number.parseInt(String(value || ""), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

async function resolveImageSessionAccessScope(userId: number): Promise<ImageSessionAccessScope> {
  const [row] = await withDbRetry("resolve-image-session-access-scope", () =>
    db
      .select({
        enterpriseId: users.enterpriseId,
        enterpriseRole: users.enterpriseRole,
        enterpriseStatus: users.enterpriseStatus,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
  )

  const enterpriseId =
    typeof row?.enterpriseId === "number" && Number.isFinite(row.enterpriseId) && row.enterpriseId > 0
      ? row.enterpriseId
      : null
  const isEnterpriseAdmin = row?.enterpriseRole === "admin" && row?.enterpriseStatus === "active"

  return {
    enterpriseId,
    isEnterpriseAdmin: Boolean(isEnterpriseAdmin),
  }
}

function buildEnterpriseFilter(column: typeof imageDesignSessions.enterpriseId, enterpriseId: number | null) {
  return enterpriseId ? eq(column, enterpriseId) : sql`${column} IS NULL`
}

function parseCursor(value: string | null | undefined): CursorParts | null {
  const match = /^(\d+):(\d+)$/u.exec(String(value || "").trim())
  if (!match) return null

  const rawTimestamp = Number.parseInt(match[1], 10)
  const id = Number.parseInt(match[2], 10)
  if (!Number.isFinite(rawTimestamp) || !Number.isFinite(id) || rawTimestamp <= 0 || id <= 0) {
    return null
  }

  const timestampMs = rawTimestamp >= 1_000_000_000_000 ? rawTimestamp : rawTimestamp * 1000

  return {
    timestamp: new Date(timestampMs),
    id,
  }
}

function buildCursor(createdAt: Date | string | number | null | undefined, id: number | null | undefined) {
  if (!id || !Number.isFinite(id)) return null
  const date = createdAt instanceof Date ? createdAt : createdAt ? new Date(createdAt) : null
  const timestampMs = date && Number.isFinite(date.getTime()) ? date.getTime() : null
  if (!timestampMs) return null
  return `${timestampMs}:${id}`
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
    request_payload: (row.requestPayload as Record<string, unknown> | null | undefined) || null,
    response_payload: (row.responsePayload as Record<string, unknown> | null | undefined) || null,
    created_at: toEpochSeconds(row.createdAt),
  }
}

async function getImageAssistantAssetByStorageKeyRecord(userId: number, storageKey: string) {
  const [row] = await withDbRetry("get-image-asset-by-storage-key", () =>
    db
      .select()
      .from(imageDesignAssets)
      .where(and(eq(imageDesignAssets.userId, userId), eq(imageDesignAssets.storageKey, storageKey)))
      .limit(1),
  )

  return row || null
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

async function countImageAssistantMessages(sessionId: string) {
  const rows = await withDbRetry("count-image-messages", () =>
    db
      .select({ count: sql<number>`count(*)` })
      .from(imageDesignMessages)
      .where(eq(imageDesignMessages.sessionId, Number(sessionId))),
  )

  return Number(rows[0]?.count || 0)
}

async function countImageAssistantVersions(sessionId: string) {
  const rows = await withDbRetry("count-image-versions", () =>
    db
      .select({ count: sql<number>`count(*)` })
      .from(imageDesignVersions)
      .where(eq(imageDesignVersions.sessionId, Number(sessionId))),
  )

  return Number(rows[0]?.count || 0)
}

export async function createImageAssistantSession(params: {
  userId: number
  enterpriseId?: number | null
  title?: string | null
}) {
  const payload = {
    userId: params.userId,
    enterpriseId: params.enterpriseId || null,
    title: toStoredSessionTitle(params.title || "Untitled design"),
    status: "active",
    currentMode: "chat",
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  let inserted: Array<Record<string, unknown>>
  try {
    inserted = await withDbRetry("create-image-session", () =>
      db
        .insert(imageDesignSessions)
        .values(payload)
        .returning(),
    )
  } catch (error) {
    if (!isLegacySessionColumnMissingError(error)) {
      throw error
    }

    const { fallbackPatch, removed } = removeMissingSessionPatchFields(error, payload as Record<string, unknown>)
    if (removed <= 0) {
      throw error
    }

    console.warn("image-assistant.db.legacy-session-column-missing", {
      scope: "create-image-session",
      message: getErrorMessage(error),
    })

    inserted = await withDbRetry("create-image-session-legacy", () =>
      db
        .insert(imageDesignSessions)
        .values(fallbackPatch as any)
        .returning(),
    )
  }

  return mapSession(inserted[0])
}

export async function listImageAssistantSessions(
  userId: number,
  limit = 30,
  cursor?: string | null,
): Promise<ImageAssistantConversationPage> {
  const accessScope = await resolveImageSessionAccessScope(userId)
  const safeLimit = Math.max(1, Math.min(limit, 50))
  const parsedCursor = cursor ? /^(\d+):(\d+)$/u.exec(cursor.trim()) : null
  const cursorTimestamp = parsedCursor ? new Date(Number(parsedCursor[1]) * 1000) : null
  const cursorId = parsedCursor ? Number.parseInt(parsedCursor[2], 10) : Number.NaN
  const cursorFilter =
    parsedCursor && cursorTimestamp && Number.isFinite(cursorId)
      ? sql`(
          ${imageDesignSessions.updatedAt} < ${cursorTimestamp}
          OR (${imageDesignSessions.updatedAt} = ${cursorTimestamp} AND ${imageDesignSessions.id} < ${cursorId})
        )`
      : undefined
  const visibilityFilter =
    accessScope.isEnterpriseAdmin && accessScope.enterpriseId
      ? buildEnterpriseFilter(imageDesignSessions.enterpriseId, accessScope.enterpriseId)
      : and(eq(imageDesignSessions.userId, userId), buildEnterpriseFilter(imageDesignSessions.enterpriseId, accessScope.enterpriseId))
  const baseWhere = and(visibilityFilter, sql`${imageDesignSessions.title} LIKE ${`${SESSION_PREFIX}%`}`, cursorFilter)

  let rows: Array<Record<string, unknown>>
  try {
    rows = await withDbRetry("list-image-sessions", () =>
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
        .where(baseWhere)
        .orderBy(desc(imageDesignSessions.updatedAt), desc(imageDesignSessions.id))
        .limit(safeLimit + 1),
    )
  } catch (error) {
    if (!isLegacySessionColumnMissingError(error)) {
      throw error
    }

    console.warn("image-assistant.db.legacy-session-column-missing", {
      scope: "list-image-sessions",
      message: getErrorMessage(error),
    })

    rows = await withDbRetry("list-image-sessions-legacy", () =>
      db
        .select({
          id: imageDesignSessions.id,
          title: imageDesignSessions.title,
          createdAt: imageDesignSessions.createdAt,
          updatedAt: imageDesignSessions.updatedAt,
        })
        .from(imageDesignSessions)
        .where(baseWhere)
        .orderBy(desc(imageDesignSessions.updatedAt), desc(imageDesignSessions.id))
        .limit(safeLimit + 1),
    )
  }

  const visibleRows = rows.slice(0, safeLimit)
  const data = visibleRows.map((row) =>
    mapSession(row, normalizeListCoverUrl(typeof row.coverAssetUrl === "string" ? row.coverAssetUrl : null)),
  )
  const lastVisibleRow = visibleRows.at(-1)
  const nextCursor =
    rows.length > safeLimit && lastVisibleRow
      ? buildCursor(lastVisibleRow.updatedAt as Date | string | number | null | undefined, lastVisibleRow.id as number | null | undefined)
      : null

  return { data, has_more: rows.length > safeLimit, limit: safeLimit, next_cursor: nextCursor }
}

export async function getImageAssistantSession(userId: number, sessionId: string) {
  const parsedId = parseDatabaseId(sessionId)
  if (!parsedId) return null
  const accessScope = await resolveImageSessionAccessScope(userId)
  const sessionAccessFilter =
    accessScope.isEnterpriseAdmin && accessScope.enterpriseId
      ? and(eq(imageDesignSessions.id, parsedId), buildEnterpriseFilter(imageDesignSessions.enterpriseId, accessScope.enterpriseId))
      : and(
          eq(imageDesignSessions.id, parsedId),
          eq(imageDesignSessions.userId, userId),
          buildEnterpriseFilter(imageDesignSessions.enterpriseId, accessScope.enterpriseId),
        )

  let rows: Array<Record<string, unknown>>
  try {
    rows = await withDbRetry("get-image-session", () =>
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
        .where(sessionAccessFilter)
        .limit(1),
    )
  } catch (error) {
    if (!isLegacySessionColumnMissingError(error)) {
      throw error
    }

    console.warn("image-assistant.db.legacy-session-column-missing", {
      scope: "get-image-session",
      message: getErrorMessage(error),
    })

    rows = await withDbRetry("get-image-session-legacy", () =>
      db
        .select({
          id: imageDesignSessions.id,
          userId: imageDesignSessions.userId,
          title: imageDesignSessions.title,
          createdAt: imageDesignSessions.createdAt,
          updatedAt: imageDesignSessions.updatedAt,
        })
        .from(imageDesignSessions)
        .where(sessionAccessFilter)
        .limit(1),
    )
  }

  if (!rows[0] || !String(rows[0].title || "").startsWith(SESSION_PREFIX)) {
    return null
  }

  return rows[0]
}

async function getImageAssistantVersionForSession(sessionId: string, versionId: string) {
  const parsedSessionId = parseDatabaseId(sessionId)
  const parsedVersionId = parseDatabaseId(versionId)
  if (!parsedSessionId || !parsedVersionId) return null

  const [row] = await withDbRetry("get-image-version-for-session", () =>
    db
      .select({
        id: imageDesignVersions.id,
        sessionId: imageDesignVersions.sessionId,
        selectedCandidateId: imageDesignVersions.selectedCandidateId,
      })
      .from(imageDesignVersions)
      .where(and(eq(imageDesignVersions.id, parsedVersionId), eq(imageDesignVersions.sessionId, parsedSessionId)))
      .limit(1),
  )

  return row || null
}

async function getImageAssistantVersionCandidate(versionId: string, candidateId: string) {
  const parsedVersionId = parseDatabaseId(versionId)
  const parsedCandidateId = parseDatabaseId(candidateId)
  if (!parsedVersionId || !parsedCandidateId) return null

  const [row] = await withDbRetry("get-image-version-candidate", () =>
    db
      .select({
        id: imageDesignVersionCandidates.id,
        versionId: imageDesignVersionCandidates.versionId,
        assetId: imageDesignVersionCandidates.assetId,
      })
      .from(imageDesignVersionCandidates)
      .where(
        and(
          eq(imageDesignVersionCandidates.id, parsedCandidateId),
          eq(imageDesignVersionCandidates.versionId, parsedVersionId),
        ),
      )
      .limit(1),
  )

  return row || null
}

async function getImageAssistantCanvasDocumentForSession(sessionId: string, canvasDocumentId: string) {
  const parsedSessionId = parseDatabaseId(sessionId)
  const parsedCanvasDocumentId = parseDatabaseId(canvasDocumentId)
  if (!parsedSessionId || !parsedCanvasDocumentId) return null

  const [row] = await withDbRetry("get-image-canvas-document-for-session", () =>
    db
      .select({
        id: imageDesignCanvasDocuments.id,
        sessionId: imageDesignCanvasDocuments.sessionId,
        baseVersionId: imageDesignCanvasDocuments.baseVersionId,
        width: imageDesignCanvasDocuments.width,
        height: imageDesignCanvasDocuments.height,
        backgroundAssetId: imageDesignCanvasDocuments.backgroundAssetId,
        revision: imageDesignCanvasDocuments.revision,
        status: imageDesignCanvasDocuments.status,
        updatedAt: imageDesignCanvasDocuments.updatedAt,
      })
      .from(imageDesignCanvasDocuments)
      .where(
        and(eq(imageDesignCanvasDocuments.id, parsedCanvasDocumentId), eq(imageDesignCanvasDocuments.sessionId, parsedSessionId)),
      )
      .limit(1),
  )

  return row || null
}

async function getImageAssistantAssetForSession(userId: number, sessionId: string, assetId: string) {
  const parsedSessionId = parseDatabaseId(sessionId)
  const parsedAssetId = parseDatabaseId(assetId)
  if (!parsedSessionId || !parsedAssetId) return null

  const [row] = await withDbRetry("get-image-asset-for-session", () =>
    db
      .select({
        id: imageDesignAssets.id,
        sessionId: imageDesignAssets.sessionId,
        userId: imageDesignAssets.userId,
      })
      .from(imageDesignAssets)
      .where(
        and(
          eq(imageDesignAssets.id, parsedAssetId),
          eq(imageDesignAssets.userId, userId),
          eq(imageDesignAssets.sessionId, parsedSessionId),
        ),
      )
      .limit(1),
  )

  return row || null
}

async function listImageAssistantAssetsForSession(userId: number, sessionId: string, assetIds: string[]) {
  const parsedSessionId = parseDatabaseId(sessionId)
  const parsedAssetIds = Array.from(
    new Set(assetIds.map((assetId) => parseDatabaseId(assetId)).filter((value): value is number => Boolean(value))),
  )
  if (!parsedSessionId || !parsedAssetIds.length) {
    return new Set<number>()
  }

  const rows = await withDbRetry("list-image-assets-for-session", () =>
    db
      .select({ id: imageDesignAssets.id })
      .from(imageDesignAssets)
      .where(
        and(
          eq(imageDesignAssets.userId, userId),
          eq(imageDesignAssets.sessionId, parsedSessionId),
          inArray(imageDesignAssets.id, parsedAssetIds),
        ),
      ),
  )

  return new Set(rows.map((row) => row.id))
}

async function applyImageAssistantSessionPatchWithLegacyFallback(
  sessionId: string,
  patch: Record<string, unknown>,
  label: string,
) {
  const sessionIdNumber = Number(sessionId)
  try {
    await withDbRetry(label, () =>
      db.update(imageDesignSessions).set(patch as any).where(eq(imageDesignSessions.id, sessionIdNumber)),
    )
    return
  } catch (error) {
    if (!isLegacySessionColumnMissingError(error)) {
      throw error
    }

    const { fallbackPatch, removed } = removeMissingSessionPatchFields(error, patch)
    if (removed <= 0) {
      throw error
    }

    console.warn("image-assistant.db.legacy-session-column-missing", {
      scope: label,
      message: getErrorMessage(error),
    })

    await withDbRetry(`${label}-legacy`, () =>
      db.update(imageDesignSessions).set(fallbackPatch as any).where(eq(imageDesignSessions.id, sessionIdNumber)),
    )
  }
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
  if (params.currentVersionId !== undefined) {
    if (!params.currentVersionId) {
      patch.currentVersionId = null
    } else {
      const version = await getImageAssistantVersionForSession(params.sessionId, params.currentVersionId)
      if (!version) return null
      patch.currentVersionId = version.id
    }
  }
  if (params.currentCanvasDocumentId !== undefined) {
    if (!params.currentCanvasDocumentId) {
      patch.currentCanvasDocumentId = null
    } else {
      const canvasDocument = await getImageAssistantCanvasDocumentForSession(params.sessionId, params.currentCanvasDocumentId)
      if (!canvasDocument) return null
      patch.currentCanvasDocumentId = canvasDocument.id
    }
  }
  if (params.coverAssetId !== undefined) {
    if (!params.coverAssetId) {
      patch.coverAssetId = null
    } else {
      const asset = await getImageAssistantAssetForSession(params.userId, params.sessionId, params.coverAssetId)
      if (!asset) return null
      patch.coverAssetId = asset.id
    }
  }

  await applyImageAssistantSessionPatchWithLegacyFallback(params.sessionId, patch, "update-image-session")

  const next = await getImageAssistantSession(params.userId, params.sessionId)
  return next ? mapSession(next, normalizeListCoverUrl(typeof next.coverAssetUrl === "string" ? next.coverAssetUrl : null)) : null
}

export async function deleteImageAssistantSession(userId: number, sessionId: string) {
  const existing = await getImageAssistantSession(userId, sessionId)
  if (!existing) {
    return false
  }

  await withDbRetry("delete-image-session", () =>
    db.delete(imageDesignSessions).where(eq(imageDesignSessions.id, Number(sessionId))),
  )

  return true
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
  if (params.sessionId) {
    const session = await getImageAssistantSession(params.userId, params.sessionId)
    if (!session) {
      throw new Error("image_assistant_session_not_found")
    }
  }

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

export async function getImageAssistantAssetByStorageKey(userId: number, storageKey: string) {
  const row = await getImageAssistantAssetByStorageKeyRecord(userId, storageKey)
  return row ? mapAsset(row) : null
}

export async function updateImageAssistantAsset(params: {
  userId: number
  sessionId: string
  assetId: string
  meta?: Record<string, unknown> | null
  status?: "pending" | "ready" | "failed"
  storageProvider?: string
  storageKey?: string
  publicUrl?: string | null
  mimeType?: string
  fileSize?: number
  width?: number | null
  height?: number | null
  sha256?: string | null
}) {
  const asset = await getImageAssistantAssetForSession(params.userId, params.sessionId, params.assetId)
  if (!asset) {
    return null
  }

  const patch: Record<string, unknown> = {
    updatedAt: new Date(),
  }
  if (params.meta !== undefined) {
    patch.meta = params.meta
  }
  if (params.status) {
    patch.status = params.status
  }
  if (params.storageProvider !== undefined) {
    patch.storageProvider = params.storageProvider
  }
  if (params.storageKey !== undefined) {
    patch.storageKey = params.storageKey
  }
  if (params.publicUrl !== undefined) {
    patch.publicUrl = params.publicUrl
  }
  if (params.mimeType !== undefined) {
    patch.mimeType = params.mimeType
  }
  if (params.fileSize !== undefined) {
    patch.fileSize = params.fileSize
  }
  if (params.width !== undefined) {
    patch.width = params.width
  }
  if (params.height !== undefined) {
    patch.height = params.height
  }
  if (params.sha256 !== undefined) {
    patch.sha256 = params.sha256
  }

  await withDbRetry("update-image-asset", () =>
    db.update(imageDesignAssets).set(patch as any).where(eq(imageDesignAssets.id, asset.id)),
  )

  const updated = await getImageAssistantAssetForSession(params.userId, params.sessionId, params.assetId)
  return updated ? mapAsset(updated) : null
}

export async function listImageAssistantAssets(
  userId: number,
  sessionId: string,
  options?: ImageAssistantListAssetsOptions,
) {
  if (!options?.skipSessionValidation) {
    const existing = await getImageAssistantSession(userId, sessionId)
    if (!existing) return []
  }

  const limit = options?.limit ? Math.max(1, Math.min(options.limit, 100)) : null
  const assetTypes = options?.assetTypes?.length ? options.assetTypes : null
  const assetIds = (options?.assetIds || [])
    .map((value) => Number.parseInt(String(value), 10))
    .filter((value) => Number.isFinite(value) && value > 0)
  const filters = [eq(imageDesignAssets.userId, userId), eq(imageDesignAssets.sessionId, Number(sessionId))]
  if (assetIds.length) {
    filters.push(inArray(imageDesignAssets.id, assetIds))
  }
  if (assetTypes?.length === 1) {
    filters.push(eq(imageDesignAssets.assetType, assetTypes[0]))
  } else if (assetTypes && assetTypes.length > 1) {
    filters.push(inArray(imageDesignAssets.assetType, assetTypes))
  }

  const rows = await withDbRetry("list-image-assets", () => {
    const query = db
      .select()
      .from(imageDesignAssets)
      .where(and(...filters))
      .orderBy(desc(imageDesignAssets.createdAt), desc(imageDesignAssets.id))

    return limit ? query.limit(limit) : query
  })

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
  userId: number
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
  const session = await getImageAssistantSession(params.userId, params.sessionId)
  if (!session) {
    throw new Error("image_assistant_session_not_found")
  }

  const parentVersion =
    params.parentVersionId != null ? await getImageAssistantVersionForSession(params.sessionId, params.parentVersionId) : null
  if (params.parentVersionId && !parentVersion) {
    throw new Error("image_assistant_version_not_found")
  }

  const snapshotAsset =
    params.snapshotAssetId != null
      ? await getImageAssistantAssetForSession(params.userId, params.sessionId, params.snapshotAssetId)
      : null
  if (params.snapshotAssetId && !snapshotAsset) {
    throw new Error("image_assistant_asset_not_found")
  }

  const maskAsset =
    params.maskAssetId != null ? await getImageAssistantAssetForSession(params.userId, params.sessionId, params.maskAssetId) : null
  if (params.maskAssetId && !maskAsset) {
    throw new Error("image_assistant_asset_not_found")
  }

  const canvasDocument =
    params.canvasDocumentId != null
      ? await getImageAssistantCanvasDocumentForSession(params.sessionId, params.canvasDocumentId)
      : null
  if (params.canvasDocumentId && !canvasDocument) {
    throw new Error("image_assistant_canvas_document_not_found")
  }

  const persistedCandidateAssetIds = await listImageAssistantAssetsForSession(params.userId, params.sessionId, params.candidateAssetIds)
  if (persistedCandidateAssetIds.size !== new Set(params.candidateAssetIds).size) {
    throw new Error("image_assistant_asset_not_found")
  }

  const insertedVersion = await withDbRetry("create-image-version", () =>
    db
      .insert(imageDesignVersions)
      .values({
        sessionId: Number(params.sessionId),
        parentVersionId: parentVersion?.id || null,
        sourceMessageId: params.sourceMessageId ? Number(params.sourceMessageId) : null,
        versionKind: params.versionKind,
        branchKey: params.parentVersionId || null,
        provider: params.provider || null,
        model: params.model || null,
        promptText: params.promptText || null,
        snapshotAssetId: snapshotAsset?.id || null,
        maskAssetId: maskAsset?.id || null,
        canvasDocumentId: canvasDocument?.id || null,
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

  const version = await getImageAssistantVersionForSession(params.sessionId, params.versionId)
  if (!version) return null

  const candidate = await getImageAssistantVersionCandidate(params.versionId, params.candidateId)
  if (!candidate) return null

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
      .set({ selectedCandidateId: candidate.id })
      .where(eq(imageDesignVersions.id, version.id)),
  )

  await applyImageAssistantSessionPatchWithLegacyFallback(
    params.sessionId,
    {
      currentVersionId: version.id,
      coverAssetId: candidate.assetId || null,
      updatedAt: new Date(),
    },
    "update-session-current-version-pointer",
  )

  return true
}

export async function listImageAssistantMessagesPage(
  userId: number,
  sessionId: string,
  options?: ImageAssistantListMessagesOptions,
): Promise<ImageAssistantMessagePage> {
  if (!options?.skipSessionValidation) {
    const existing = await getImageAssistantSession(userId, sessionId)
    if (!existing) {
      return { data: [], has_more: false, limit: options?.limit || 0, next_cursor: null }
    }
  }

  const limit = Math.max(1, Math.min(options?.limit || 20, 200))
  const cursor = parseCursor(options?.cursor)
  const rows = await withDbRetry("list-image-messages", () => {
    const query = db
      .select()
      .from(imageDesignMessages)
      .where(
        and(
          eq(imageDesignMessages.sessionId, Number(sessionId)),
          cursor
            ? or(
                lt(imageDesignMessages.createdAt, cursor.timestamp),
                and(eq(imageDesignMessages.createdAt, cursor.timestamp), lt(imageDesignMessages.id, cursor.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(imageDesignMessages.createdAt), desc(imageDesignMessages.id))
      .limit(limit + 1)

    return query
  })

  const visibleRows = rows.slice(0, limit)
  const hasMore = rows.length > limit
  const normalizedRows = [...visibleRows].reverse()
  const data = normalizedRows.map(mapMessage)
  const nextCursor = hasMore ? buildCursor(visibleRows.at(-1)?.createdAt, visibleRows.at(-1)?.id) : null

  return {
    data,
    has_more: hasMore,
    limit,
    next_cursor: nextCursor,
  }
}

export async function listImageAssistantMessages(
  userId: number,
  sessionId: string,
  options?: ImageAssistantListMessagesOptions,
) {
  return (await listImageAssistantMessagesPage(userId, sessionId, options)).data
}

export async function listImageAssistantVersionsPage(
  userId: number,
  sessionId: string,
  options?: ImageAssistantListVersionsOptions,
): Promise<ImageAssistantVersionPage> {
  const existing = await getImageAssistantSession(userId, sessionId)
  if (!existing) {
    return { data: [], has_more: false, limit: options?.limit || 0, next_cursor: null }
  }

  const limit = Math.max(1, Math.min(options?.limit || 20, 100))
  const cursor = parseCursor(options?.cursor)
  const rows = await withDbRetry("list-image-versions", () => {
    const query = db
      .select()
      .from(imageDesignVersions)
      .where(
        and(
          eq(imageDesignVersions.sessionId, Number(sessionId)),
          cursor
            ? or(
                lt(imageDesignVersions.createdAt, cursor.timestamp),
                and(eq(imageDesignVersions.createdAt, cursor.timestamp), lt(imageDesignVersions.id, cursor.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(imageDesignVersions.createdAt), desc(imageDesignVersions.id))

    return query.limit(limit + 1)
  })

  const visibleRows = rows.slice(0, limit)
  const candidates = await listVersionCandidates(visibleRows.map((row) => row.id))
  const groupedCandidates = new Map<number, ImageAssistantCandidate[]>()
  for (const row of candidates) {
    const mapped = mapCandidate(row)
    const bucket = groupedCandidates.get(row.versionId) || []
    bucket.push(mapped)
    groupedCandidates.set(row.versionId, bucket)
  }

  const data = visibleRows.map(
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
        meta: (row.meta as Record<string, unknown> | null | undefined) || null,
        created_at: toEpochSeconds(row.createdAt),
        candidates: groupedCandidates.get(row.id) || [],
      }) satisfies ImageAssistantVersionSummary,
  )

  const hasMore = rows.length > limit
  const nextCursor = hasMore ? buildCursor(visibleRows.at(-1)?.createdAt, visibleRows.at(-1)?.id) : null

  return {
    data,
    has_more: hasMore,
    limit,
    next_cursor: nextCursor,
  }
}

export async function listImageAssistantVersions(
  userId: number,
  sessionId: string,
  options?: ImageAssistantListVersionsOptions,
) {
  return (await listImageAssistantVersionsPage(userId, sessionId, options)).data
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

  const baseVersion =
    params.baseVersionId != null ? await getImageAssistantVersionForSession(params.sessionId, params.baseVersionId) : null
  if (params.baseVersionId && !baseVersion) {
    throw new Error("image_assistant_version_not_found")
  }

  const backgroundAsset =
    params.backgroundAssetId != null
      ? await getImageAssistantAssetForSession(params.userId, params.sessionId, params.backgroundAssetId)
      : null
  if (params.backgroundAssetId && !backgroundAsset) {
    throw new Error("image_assistant_asset_not_found")
  }

  const referencedLayerAssetIds = Array.from(
    new Set(params.layers.map((layer) => layer.asset_id).filter((assetId): assetId is string => Boolean(assetId))),
  )
  if (referencedLayerAssetIds.length) {
    const allowedLayerAssetIds = await listImageAssistantAssetsForSession(params.userId, params.sessionId, referencedLayerAssetIds)
    if (allowedLayerAssetIds.size !== referencedLayerAssetIds.length) {
      throw new Error("image_assistant_asset_not_found")
    }
  }

  let documentId = params.canvasDocumentId ? Number(params.canvasDocumentId) : null
  let nextRevision = 1

  if (!documentId) {
    const created = await withDbRetry("create-image-canvas-document", () =>
      db
        .insert(imageDesignCanvasDocuments)
        .values({
          sessionId: Number(params.sessionId),
          baseVersionId: baseVersion?.id || null,
          width: params.width,
          height: params.height,
          backgroundAssetId: backgroundAsset?.id || null,
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
    const existingDocument = await getImageAssistantCanvasDocumentForSession(params.sessionId, String(documentId))
    if (!existingDocument) {
      throw new Error("image_assistant_canvas_document_not_found")
    }
    if (typeof params.revision === "number" && params.revision !== existingDocument.revision) {
      throw new Error("image_assistant_canvas_revision_conflict")
    }
    documentId = existingDocument.id
    nextRevision = existingDocument.revision + 1

    await withDbRetry("update-image-canvas-document", () =>
      db
        .update(imageDesignCanvasDocuments)
        .set({
          baseVersionId: baseVersion?.id || null,
          width: params.width,
          height: params.height,
          backgroundAssetId: backgroundAsset?.id || null,
          revision: nextRevision,
          status: "saved",
          lastSavedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(imageDesignCanvasDocuments.id, documentId!)),
    )

    await withDbRetry("delete-existing-image-canvas-layers", () =>
      db.delete(imageDesignCanvasLayers).where(eq(imageDesignCanvasLayers.canvasDocumentId, documentId!)),
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
          assetId: layer.asset_id ? parseDatabaseId(layer.asset_id) : null,
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
    ? parseDatabaseId(canvasDocumentId)
    : typeof session.currentCanvasDocumentId === "number"
      ? session.currentCanvasDocumentId
      : null
  if (targetId == null || !Number.isFinite(targetId) || targetId <= 0) return null

  const documentRow = await getImageAssistantCanvasDocumentForSession(sessionId, String(targetId))
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
        db
          .select()
          .from(imageDesignAssets)
          .where(
            and(
              inArray(imageDesignAssets.id, assetIds),
              eq(imageDesignAssets.userId, userId),
              eq(imageDesignAssets.sessionId, Number(sessionId)),
            ),
          ),
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

export async function getImageAssistantSessionDetail(
  userId: number,
  sessionId: string,
  options?: ImageAssistantSessionDetailOptions,
): Promise<ImageAssistantSessionDetail | null> {
  const session = await getImageAssistantSession(userId, sessionId)
  if (!session) return null

  const config = {
    includeMessages: options?.includeMessages ?? true,
    includeVersions: options?.includeVersions ?? true,
    includeAssets: options?.includeAssets ?? true,
    includeCanvas: options?.includeCanvas ?? true,
    messageLimit: options?.messageLimit,
    versionLimit: options?.versionLimit,
    assetLimit: options?.assetLimit,
    assetTypes: options?.assetTypes,
  }

  const [summary, messagePage, versionPage, assets, canvasDocument] = await Promise.all([
    Promise.resolve(
      mapSession(session, normalizeListCoverUrl(typeof session.coverAssetUrl === "string" ? session.coverAssetUrl : null)),
    ),
    config.includeMessages
      ? listImageAssistantMessagesPage(userId, sessionId, { limit: config.messageLimit })
      : Promise.resolve({ data: [], has_more: false, limit: config.messageLimit || 0, next_cursor: null }),
    config.includeVersions
      ? listImageAssistantVersionsPage(userId, sessionId, { limit: config.versionLimit })
      : Promise.resolve({ data: [], has_more: false, limit: config.versionLimit || 0, next_cursor: null }),
    config.includeAssets
      ? listImageAssistantAssets(userId, sessionId, {
          limit: config.assetLimit,
          assetTypes: config.assetTypes,
        })
      : Promise.resolve([]),
    config.includeCanvas ? getImageAssistantCanvasDocument(userId, sessionId) : Promise.resolve(null),
  ])

  const [messageTotal, versionTotal] = await Promise.all([
    config.includeMessages ? countImageAssistantMessages(sessionId) : Promise.resolve(0),
    config.includeVersions ? countImageAssistantVersions(sessionId) : Promise.resolve(0),
  ])

  const meta: ImageAssistantSessionDetailMeta = {
    messages_total: messageTotal,
    messages_loaded: messagePage.data.length,
    messages_has_more: messagePage.has_more,
    messages_next_cursor: messagePage.next_cursor,
    versions_total: versionTotal,
    versions_loaded: versionPage.data.length,
    versions_has_more: versionPage.has_more,
    versions_next_cursor: versionPage.next_cursor,
  }

  return {
    session: summary,
    messages: messagePage.data,
    versions: versionPage.data,
    assets,
    canvas_document: canvasDocument,
    meta,
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

  const asset = await getImageAssistantAssetForSession(params.userId, params.sessionId, params.assetId)
  if (!asset) {
    throw new Error("image_assistant_asset_not_found")
  }

  if (params.versionId) {
    const version = await getImageAssistantVersionForSession(params.sessionId, params.versionId)
    if (!version) {
      throw new Error("image_assistant_version_not_found")
    }
  }

  if (params.canvasDocumentId) {
    const canvasDocument = await getImageAssistantCanvasDocumentForSession(params.sessionId, params.canvasDocumentId)
    if (!canvasDocument) {
      throw new Error("image_assistant_canvas_document_not_found")
    }
  }

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
        ${asset.id},
        ${params.format},
        ${params.sizePreset},
        ${params.transparentBackground},
        NOW()
      )
    `),
  )

  return true
}

