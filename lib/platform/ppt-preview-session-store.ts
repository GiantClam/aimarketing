import { gzipSync, gunzipSync } from "node:zlib"

import { pool } from "@/lib/db"
import type { PptPreviewDeck } from "@/lib/lead-tools/ppt-preview-data-fixed"
import type {
  PptPreviewSessionStore,
} from "@/lib/lead-tools/ppt-preview-session-store"
import { toUint8Array } from "@/lib/utils/binary"

const PLATFORM_PPT_PREVIEW_SESSIONS_TABLE = "AI_MARKETING_platform_ppt_preview_sessions"

type PptPreviewSessionRow = {
  session_id: string
  created_at: Date | string
  deck_blob: Buffer | Uint8Array
}

type GlobalWithEnsurePptPreviewSessionTableState = typeof globalThis & {
  __aimarketingEnsurePptPreviewSessionTablePromise__?: Promise<void> | null
}

const ensureState = globalThis as GlobalWithEnsurePptPreviewSessionTableState
let ensureTablePromise = ensureState.__aimarketingEnsurePptPreviewSessionTablePromise__ ?? null

function toTimestampIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function encodeDeck(deck: PptPreviewDeck) {
  return gzipSync(toUint8Array(Buffer.from(JSON.stringify(deck), "utf8")))
}

function decodeDeck(blob: Buffer | Uint8Array) {
  return JSON.parse(gunzipSync(toUint8Array(blob)).toString("utf8")) as PptPreviewDeck
}

export async function ensurePptPreviewSessionStoreTables() {
  if (!ensureTablePromise) {
    ensureTablePromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${PLATFORM_PPT_PREVIEW_SESSIONS_TABLE}" (
          id SERIAL PRIMARY KEY,
          session_id VARCHAR(64) NOT NULL UNIQUE,
          created_at TIMESTAMP NOT NULL,
          deck_blob BYTEA NOT NULL,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `)

      await pool.query(`
        CREATE INDEX IF NOT EXISTS "AI_MARKETING_platform_ppt_preview_sessions_created_idx"
        ON "${PLATFORM_PPT_PREVIEW_SESSIONS_TABLE}" (created_at DESC)
      `)
    })().catch((error) => {
      ensureTablePromise = null
      ensureState.__aimarketingEnsurePptPreviewSessionTablePromise__ = null
      throw error
    })

    ensureState.__aimarketingEnsurePptPreviewSessionTablePromise__ = ensureTablePromise
  }

  await ensureTablePromise
}

export function createPostgresPptPreviewSessionStore(): PptPreviewSessionStore {
  return {
    async saveSession(session) {
      await ensurePptPreviewSessionStoreTables()
      await pool.query(
        `
          INSERT INTO "${PLATFORM_PPT_PREVIEW_SESSIONS_TABLE}" (
            session_id,
            created_at,
            deck_blob,
            updated_at
          )
          VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
          ON CONFLICT (session_id)
          DO UPDATE SET
            created_at = EXCLUDED.created_at,
            deck_blob = EXCLUDED.deck_blob,
            updated_at = CURRENT_TIMESTAMP
        `,
        [session.sessionId, session.createdAt, toUint8Array(encodeDeck(session.deck))],
      )
    },
    async getSession(sessionId) {
      await ensurePptPreviewSessionStoreTables()
      const result = await pool.query<PptPreviewSessionRow>(
        `
          SELECT
            session_id,
            created_at,
            deck_blob
          FROM "${PLATFORM_PPT_PREVIEW_SESSIONS_TABLE}"
          WHERE session_id = $1
          LIMIT 1
        `,
        [sessionId],
      )

      const row = result.rows[0]
      if (!row) return null

      return {
        sessionId: row.session_id,
        createdAt: toTimestampIso(row.created_at),
        deck: decodeDeck(row.deck_blob),
      }
    },
  }
}
