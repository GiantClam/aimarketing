import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { gzipSync, gunzipSync } from "node:zlib"
import { toUint8Array } from "@/lib/utils/binary"

type StoredArchiveFile = {
  path: string
  dataBase64: string
}

type StoredArchivePayload = {
  version: 1
  files: StoredArchiveFile[]
}

export type PersistedPptMasterSession = {
  sessionId: string
  createdAt: string
  manifest: unknown
  archive: Buffer
}

export interface PptMasterSessionStore {
  saveSession(session: PersistedPptMasterSession): Promise<void>
  getSession(sessionId: string): Promise<PersistedPptMasterSession | null>
  clearForTests?(): Promise<void> | void
}

function hasDatabaseConfig() {
  return Boolean(
    process.env.AI_MARKETING_DB_POSTGRES_URL?.trim() ||
      process.env.AI_MARKETING_DB_POSTGRES_URL_NON_POOLING?.trim() ||
      process.env.DATABASE_URL?.trim() ||
      process.env.DATABASE_URL_UNPOOLED?.trim(),
  )
}

export function getPptMasterSessionRootDir() {
  return path.join(os.tmpdir(), "aimarketing-ppt-master-sessions")
}

export function getPptMasterSessionDir(sessionId: string) {
  return path.join(getPptMasterSessionRootDir(), sessionId)
}

export function getPptMasterSessionManifestPath(sessionId: string) {
  return path.join(getPptMasterSessionDir(sessionId), "manifest.json")
}

async function listFilesRecursively(rootDir: string, currentDir: string): Promise<StoredArchiveFile[]> {
  const entries = await fs.readdir(currentDir, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(currentDir, entry.name)
      if (entry.isDirectory()) {
        return listFilesRecursively(rootDir, absolutePath)
      }

      if (!entry.isFile()) {
        return []
      }

      const relativePath = path.relative(rootDir, absolutePath)
      const data = await fs.readFile(absolutePath)
      return [
        {
          path: relativePath.split(path.sep).join("/"),
          dataBase64: data.toString("base64"),
        },
      ]
    }),
  )

  return files.flat()
}

export async function createPptMasterSessionArchive(sessionDir: string) {
  const files = await listFilesRecursively(sessionDir, sessionDir)
  const payload: StoredArchivePayload = {
    version: 1,
    files: files.sort((left, right) => left.path.localeCompare(right.path, "en")),
  }

  return gzipSync(toUint8Array(Buffer.from(JSON.stringify(payload), "utf8")))
}

export async function restorePptMasterSessionArchive(sessionDir: string, archive: Uint8Array | Buffer) {
  const payload = JSON.parse(gunzipSync(toUint8Array(archive)).toString("utf8")) as StoredArchivePayload
  if (payload.version !== 1 || !Array.isArray(payload.files)) {
    throw new Error("ppt_master_session_archive_invalid")
  }

  await fs.rm(sessionDir, { recursive: true, force: true })
  await fs.mkdir(sessionDir, { recursive: true })

  await Promise.all(
    payload.files.map(async (file) => {
      const relativePath = file.path.replace(/^\/+/u, "")
      const absolutePath = path.join(sessionDir, relativePath)
      await fs.mkdir(path.dirname(absolutePath), { recursive: true })
      await fs.writeFile(absolutePath, toUint8Array(Buffer.from(file.dataBase64, "base64")))
    }),
  )
}

export function resolvePptMasterSessionStoreMode() {
  const explicit = process.env.PPT_MASTER_SESSION_STORE?.trim().toLowerCase()
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

function createFilesystemNoopStore(): PptMasterSessionStore {
  return {
    async saveSession() {},
    async getSession() {
      return null
    },
  }
}

let configuredStorePromise: Promise<PptMasterSessionStore> | null = null
let testStoreOverride: PptMasterSessionStore | null = null

async function createConfiguredStore() {
  const mode = resolvePptMasterSessionStoreMode()
  if (mode === "filesystem") {
    return createFilesystemNoopStore()
  }

  if (!hasDatabaseConfig()) {
    throw new Error("ppt_master_session_store_db_unavailable")
  }

  const { createPostgresPptMasterSessionStore } = await import("@/lib/platform/ppt-session-store")
  return createPostgresPptMasterSessionStore()
}

export async function getConfiguredPptMasterSessionStore() {
  if (testStoreOverride) {
    return testStoreOverride
  }

  if (!configuredStorePromise) {
    configuredStorePromise = createConfiguredStore().catch((error) => {
      configuredStorePromise = null
      throw error
    })
  }

  return configuredStorePromise
}

export function setConfiguredPptMasterSessionStoreForTests(store: PptMasterSessionStore | null) {
  configuredStorePromise = null
  testStoreOverride = store
}
