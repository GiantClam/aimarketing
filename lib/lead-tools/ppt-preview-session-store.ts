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

export function getPptPreviewSessionRootDir() {
  const explicitRoot = process.env.LEAD_TOOLS_PPT_SESSION_ROOT_DIR?.trim()
  if (explicitRoot) return explicitRoot

  if (process.env.NODE_ENV !== "production") {
    return path.join(process.cwd(), ".cache", "ppt-preview-sessions")
  }

  return path.join(os.tmpdir(), "aimarketing-ppt-preview-sessions")
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

export async function storePptPreviewSessionDeck(deck: PptPreviewDeck) {
  await cleanupExpiredSessions()

  const sessionId = deck.previewSessionId ?? randomUUID()
  const manifestPath = getManifestPath(sessionId)
  const session: StoredPreviewSession = {
    sessionId,
    createdAt: new Date().toISOString(),
    deck: {
      ...deck,
      previewSessionId: sessionId,
    },
  }

  await fs.mkdir(path.dirname(manifestPath), { recursive: true })
  await fs.writeFile(manifestPath, JSON.stringify(session, null, 2), "utf8")

  return session.deck
}

export async function getPptPreviewSessionDeck(sessionId: string) {
  try {
    const manifest = await fs.readFile(getManifestPath(sessionId), "utf8")
    const payload = JSON.parse(manifest) as StoredPreviewSession
    return payload.deck
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === "ENOENT") {
      throw new Error(`missing_preview_session:${sessionId}`)
    }
    throw error
  }
}
