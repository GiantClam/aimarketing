import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import type { PptPreviewDeck } from "@/lib/lead-tools/ppt-preview-data-fixed"

const SESSION_TTL_MS = 1000 * 60 * 60 * 6

type StoredPreviewSession = {
  sessionId: string
  createdAt: string
  deck: PptPreviewDeck
}

export interface PptPreviewSessionStore {
  saveSession(session: StoredPreviewSession): Promise<void>
  getSession(sessionId: string): Promise<StoredPreviewSession | null>
}

type GlobalWithPptPreviewSessionStoreState = typeof globalThis & {
  __aimarketingPptPreviewSessionStorePromise__?: Promise<PptPreviewSessionStore> | null
}

const previewSessionStoreState = globalThis as GlobalWithPptPreviewSessionStoreState
let configuredStorePromise = previewSessionStoreState.__aimarketingPptPreviewSessionStorePromise__ ?? null
let testStoreOverride: PptPreviewSessionStore | null = null

function hasDatabaseConfig() {
  return Boolean(
    process.env.AI_MARKETING_DB_POSTGRES_URL?.trim() ||
      process.env.AI_MARKETING_DB_POSTGRES_URL_NON_POOLING?.trim() ||
      process.env.DATABASE_URL?.trim() ||
      process.env.DATABASE_URL_UNPOOLED?.trim(),
  )
}

export function getPptPreviewSessionRootDir() {
  const explicitRoot = process.env.LEAD_TOOLS_PPT_SESSION_ROOT_DIR?.trim()
  if (explicitRoot) return explicitRoot

  if (process.env.NODE_ENV !== "production") {
    return path.join(process.cwd(), ".cache", "ppt-preview-sessions")
  }

  return path.join(os.tmpdir(), "aimarketing-ppt-preview-sessions")
}

export function resolvePptPreviewSessionStoreMode() {
  const explicit = process.env.PPT_PREVIEW_SESSION_STORE?.trim().toLowerCase()
  if (explicit === "filesystem" || explicit === "postgres") {
    return explicit
  }

  if (process.env.NODE_ENV === "test") {
    return "filesystem" as const
  }

  if (process.env.RAILWAY_ENVIRONMENT?.trim()) {
    return "postgres" as const
  }

  if (hasDatabaseConfig()) {
    return "postgres" as const
  }

  return "filesystem" as const
}

function getSessionDir(sessionId: string) {
  return path.join(getPptPreviewSessionRootDir(), sessionId)
}

function getManifestPath(sessionId: string) {
  return path.join(getSessionDir(sessionId), "manifest.json")
}

async function cleanupExpiredSessions() {
  const rootDir = getPptPreviewSessionRootDir()

  try {
    const entries = await fs.readdir(rootDir, { withFileTypes: true })
    const now = Date.now()

    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const sessionDir = path.join(rootDir, entry.name)
          try {
            const stats = await fs.stat(sessionDir)
            if (now - stats.mtimeMs > SESSION_TTL_MS) {
              await fs.rm(sessionDir, { recursive: true, force: true })
            }
          } catch {
            return
          }
        }),
    )
  } catch {
    return
  }
}

function createFilesystemPptPreviewSessionStore(): PptPreviewSessionStore {
  return {
    async saveSession(session) {
      await cleanupExpiredSessions()
      const manifestPath = getManifestPath(session.sessionId)
      await fs.mkdir(path.dirname(manifestPath), { recursive: true })
      await fs.writeFile(manifestPath, JSON.stringify(session, null, 2), "utf8")
    },
    async getSession(sessionId) {
      try {
        const manifest = await fs.readFile(getManifestPath(sessionId), "utf8")
        return JSON.parse(manifest) as StoredPreviewSession
      } catch (error) {
        if ((error as NodeJS.ErrnoException | null)?.code === "ENOENT") {
          return null
        }
        throw error
      }
    },
  }
}

async function createConfiguredStore() {
  const mode = resolvePptPreviewSessionStoreMode()
  if (mode === "filesystem") {
    return createFilesystemPptPreviewSessionStore()
  }

  if (!hasDatabaseConfig()) {
    throw new Error("ppt_preview_session_store_db_unavailable")
  }

  const { createPostgresPptPreviewSessionStore } = await import("@/lib/platform/ppt-preview-session-store")
  return createPostgresPptPreviewSessionStore()
}

async function getConfiguredPptPreviewSessionStore() {
  if (testStoreOverride) {
    return testStoreOverride
  }

  if (!configuredStorePromise) {
    configuredStorePromise = createConfiguredStore().catch((error) => {
      configuredStorePromise = null
      previewSessionStoreState.__aimarketingPptPreviewSessionStorePromise__ = null
      throw error
    })
    previewSessionStoreState.__aimarketingPptPreviewSessionStorePromise__ = configuredStorePromise
  }

  return configuredStorePromise
}

export function setConfiguredPptPreviewSessionStoreForTests(store: PptPreviewSessionStore | null) {
  configuredStorePromise = null
  previewSessionStoreState.__aimarketingPptPreviewSessionStorePromise__ = null
  testStoreOverride = store
}

function resolveStoredPreviewSession(deck: PptPreviewDeck): StoredPreviewSession {
  const sessionId = deck.previewSessionId ?? randomUUID()
  const createdAt =
    typeof deck.generatedAt === "string" && deck.generatedAt.trim() ? deck.generatedAt : new Date().toISOString()

  return {
    sessionId,
    createdAt,
    deck: {
      ...deck,
      previewSessionId: sessionId,
    },
  }
}

export async function storePptPreviewSessionDeck(deck: PptPreviewDeck) {
  const store = await getConfiguredPptPreviewSessionStore()
  const session = resolveStoredPreviewSession(deck)
  await store.saveSession(session)
  return session.deck
}

export async function getPptPreviewSessionDeck(sessionId: string) {
  const store = await getConfiguredPptPreviewSessionStore()
  const session = await store.getSession(sessionId)
  if (!session) {
    throw new Error(`missing_preview_session:${sessionId}`)
  }
  return session.deck
}
