const { Pool } = require("pg")
require("./load-env")
const { getMigrationPoolConfig } = require("./get-db-connection")

const RUNTIME_TABLE = '"AI_MARKETING_platform_opencode_runtime_runs"'
const CHECKPOINT_TABLE = '"AI_MARKETING_platform_opencode_runtime_checkpoints"'
const RAILWAY_STATE_TABLE = '"AI_MARKETING_platform_railway_opencode_runtime_states"'
const RAILWAY_EVENTS_TABLE = '"AI_MARKETING_platform_railway_opencode_runtime_events"'

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS ${RUNTIME_TABLE} (
  id BIGSERIAL PRIMARY KEY,
  task_run_id INTEGER NOT NULL UNIQUE REFERENCES "AI_MARKETING_platform_task_runs"(id) ON DELETE CASCADE,
  runtime_run_id UUID NOT NULL UNIQUE,
  session_key VARCHAR(64) NOT NULL,
  conversation_id VARCHAR(128),
  agent_id VARCHAR(128),
  function_id VARCHAR(64),
  backend VARCHAR(40) NOT NULL DEFAULT 'cloudflare-opencode-session',
  status VARCHAR(24) NOT NULL DEFAULT 'queued',
  dispatch_key TEXT,
  workflow_instance_id VARCHAR(128),
  opencode_session_id VARCHAR(128),
  sandbox_id VARCHAR(128),
  workspace_backup JSONB,
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  deadline_at TIMESTAMPTZ NOT NULL,
  lease_owner VARCHAR(128),
  lease_expires_at TIMESTAMPTZ,
  billing_payload JSONB,
  last_error_code VARCHAR(128),
  last_error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ${CHECKPOINT_TABLE} (
  id BIGSERIAL PRIMARY KEY,
  runtime_run_id UUID NOT NULL REFERENCES ${RUNTIME_TABLE}(runtime_run_id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  stage VARCHAR(128) NOT NULL,
  backup_handle JSONB,
  resume_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  artifact_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "AI_MARKETING_platform_opencode_runtime_checkpoint_sequence_unique" UNIQUE(runtime_run_id, sequence)
);

CREATE INDEX IF NOT EXISTS "AI_MARKETING_platform_opencode_runtime_session_status_idx"
  ON ${RUNTIME_TABLE}(session_key, status);
CREATE INDEX IF NOT EXISTS "AI_MARKETING_platform_opencode_runtime_lease_idx"
  ON ${RUNTIME_TABLE}(status, lease_expires_at);
CREATE INDEX IF NOT EXISTS "AI_MARKETING_platform_opencode_runtime_checkpoints_run_created_idx"
  ON ${CHECKPOINT_TABLE}(runtime_run_id, created_at DESC);

ALTER TABLE ${RUNTIME_TABLE} ENABLE ROW LEVEL SECURITY;
ALTER TABLE ${CHECKPOINT_TABLE} ENABLE ROW LEVEL SECURITY;

ALTER TABLE ${RUNTIME_TABLE} ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(128);
ALTER TABLE ${RUNTIME_TABLE} ADD COLUMN IF NOT EXISTS enterprise_id BIGINT;
ALTER TABLE ${RUNTIME_TABLE} ADD COLUMN IF NOT EXISTS user_id BIGINT;
ALTER TABLE ${RUNTIME_TABLE} ADD COLUMN IF NOT EXISTS conversation_revision BIGINT;
ALTER TABLE ${RUNTIME_TABLE} ADD COLUMN IF NOT EXISTS context_hash CHAR(64);
ALTER TABLE ${RUNTIME_TABLE} ADD COLUMN IF NOT EXISTS bundle_key VARCHAR(255);
ALTER TABLE ${RUNTIME_TABLE} ADD COLUMN IF NOT EXISTS bundle_version VARCHAR(128);
ALTER TABLE ${RUNTIME_TABLE} ADD COLUMN IF NOT EXISTS provider_id VARCHAR(128);
ALTER TABLE ${RUNTIME_TABLE} ADD COLUMN IF NOT EXISTS model_id VARCHAR(128);
ALTER TABLE ${RUNTIME_TABLE} ADD COLUMN IF NOT EXISTS last_event_sequence INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_platform_opencode_runtime_idempotency_idx"
  ON ${RUNTIME_TABLE}(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS ${RAILWAY_STATE_TABLE} (
  runtime_run_id UUID PRIMARY KEY,
  status VARCHAR(24) NOT NULL DEFAULT 'queued',
  events JSONB NOT NULL DEFAULT '[]'::jsonb,
  next_sequence INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "AI_MARKETING_platform_railway_opencode_runtime_states_updated_idx"
  ON ${RAILWAY_STATE_TABLE}(updated_at DESC);
ALTER TABLE ${RAILWAY_STATE_TABLE} ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS ${RAILWAY_EVENTS_TABLE} (
  id BIGSERIAL PRIMARY KEY,
  runtime_run_id UUID NOT NULL REFERENCES ${RAILWAY_STATE_TABLE}(runtime_run_id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  event JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "AI_MARKETING_platform_railway_opencode_runtime_events_sequence_unique" UNIQUE(runtime_run_id, sequence)
);
CREATE INDEX IF NOT EXISTS "AI_MARKETING_platform_railway_opencode_runtime_events_run_sequence_idx"
  ON ${RAILWAY_EVENTS_TABLE}(runtime_run_id, sequence);
ALTER TABLE ${RAILWAY_EVENTS_TABLE} ENABLE ROW LEVEL SECURITY;
`

function isVerifyMode() {
  return process.argv.includes("--verify")
}

function isDryRun() {
  return process.argv.includes("--dry-run")
}

async function verify(pool) {
  const result = await pool.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name IN ('AI_MARKETING_platform_opencode_runtime_runs', 'AI_MARKETING_platform_opencode_runtime_checkpoints', 'AI_MARKETING_platform_railway_opencode_runtime_states', 'AI_MARKETING_platform_railway_opencode_runtime_events')
     ORDER BY table_name`,
  )
  const names = result.rows.map((row) => row.table_name)
  const expected = [
    "AI_MARKETING_platform_opencode_runtime_checkpoints",
    "AI_MARKETING_platform_opencode_runtime_runs",
    "AI_MARKETING_platform_railway_opencode_runtime_events",
    "AI_MARKETING_platform_railway_opencode_runtime_states",
  ]
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(`opencode_runtime_v2_schema_missing:${names.join(",")}`)
  }
  const indexes = await pool.query(
    `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE 'AI_MARKETING_platform_opencode_runtime_%' ORDER BY indexname`,
  )
  if (indexes.rows.length < 3) throw new Error("opencode_runtime_v2_indexes_missing")
  console.log(JSON.stringify({ ok: true, tables: names, indexCount: indexes.rows.length }))
}

async function main() {
  if (isDryRun()) {
    console.log(MIGRATION_SQL.trim())
    return
  }
  const pool = new Pool(getMigrationPoolConfig())
  try {
    await pool.query("BEGIN")
    await pool.query(MIGRATION_SQL)
    await pool.query("COMMIT")
    if (isVerifyMode()) await verify(pool)
    else console.log("OpenCode Runtime V2 migration completed successfully")
  } catch (error) {
    await pool.query("ROLLBACK").catch(() => undefined)
    throw error
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error("OpenCode Runtime V2 migration failed:", error)
  process.exit(1)
})
