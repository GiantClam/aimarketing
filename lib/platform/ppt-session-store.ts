import { pool } from "@/lib/db"
import type {
  PersistedPptMasterSession,
  PptMasterSessionStore,
} from "@/lib/lead-tools/ppt-master-session-store"
import { toUint8Array } from "@/lib/utils/binary"

const PLATFORM_PPT_MASTER_SESSIONS_TABLE = "AI_MARKETING_platform_ppt_master_sessions"

type PptMasterSessionRow = {
  session_id: string
  created_at: Date | string
  manifest_payload: unknown
  archive_blob: Buffer | Uint8Array
}

type GlobalWithEnsurePptMasterSessionTableState = typeof globalThis & {
  __aimarketingEnsurePptMasterSessionTablePromise__?: Promise<void> | null
}

const ensureState = globalThis as GlobalWithEnsurePptMasterSessionTableState
let ensureTablePromise = ensureState.__aimarketingEnsurePptMasterSessionTablePromise__ ?? null

function toTimestampIso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function mapRow(row: PptMasterSessionRow): PersistedPptMasterSession {
  return {
    sessionId: row.session_id,
    createdAt: toTimestampIso(row.created_at),
    manifest: row.manifest_payload,
    archive: Buffer.from(toUint8Array(row.archive_blob)),
  }
}

export async function ensurePptMasterSessionStoreTables() {
  if (!ensureTablePromise) {
    ensureTablePromise = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "${PLATFORM_PPT_MASTER_SESSIONS_TABLE}" (
          id SERIAL PRIMARY KEY,
          session_id VARCHAR(64) NOT NULL UNIQUE,
          created_at TIMESTAMP NOT NULL,
          manifest_payload JSONB NOT NULL,
          archive_blob BYTEA NOT NULL,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `)

      await pool.query(`
        CREATE INDEX IF NOT EXISTS "AI_MARKETING_platform_ppt_master_sessions_created_idx"
        ON "${PLATFORM_PPT_MASTER_SESSIONS_TABLE}" (created_at DESC)
      `)
    })().catch((error) => {
      ensureTablePromise = null
      ensureState.__aimarketingEnsurePptMasterSessionTablePromise__ = null
      throw error
    })

    ensureState.__aimarketingEnsurePptMasterSessionTablePromise__ = ensureTablePromise
  }

  await ensureTablePromise
}

export function createPostgresPptMasterSessionStore(): PptMasterSessionStore {
  return {
    async saveSession(session) {
      await ensurePptMasterSessionStoreTables()
      await pool.query(
        `
          INSERT INTO "${PLATFORM_PPT_MASTER_SESSIONS_TABLE}" (
            session_id,
            created_at,
            manifest_payload,
            archive_blob,
            updated_at
          )
          VALUES ($1, $2, $3::jsonb, $4, CURRENT_TIMESTAMP)
          ON CONFLICT (session_id)
          DO UPDATE SET
            created_at = EXCLUDED.created_at,
            manifest_payload = EXCLUDED.manifest_payload,
            archive_blob = EXCLUDED.archive_blob,
            updated_at = CURRENT_TIMESTAMP
        `,
        [session.sessionId, session.createdAt, JSON.stringify(session.manifest), toUint8Array(session.archive)],
      )
    },
    async getSession(sessionId) {
      await ensurePptMasterSessionStoreTables()
      const result = await pool.query<PptMasterSessionRow>(
        `
          SELECT
            session_id,
            created_at,
            manifest_payload,
            archive_blob
          FROM "${PLATFORM_PPT_MASTER_SESSIONS_TABLE}"
          WHERE session_id = $1
          LIMIT 1
        `,
        [sessionId],
      )

      const row = result.rows[0]
      return row ? mapRow(row) : null
    },
  }
}
