const { Pool } = require("pg")

require("./load-env")
const { getMigrationPoolConfig } = require("./get-db-connection")

const RUNS = '"AI_MARKETING_platform_task_runs"'
const WORKFLOWS = '"AI_MARKETING_platform_workflows"'
const REVISIONS = '"AI_MARKETING_platform_workflow_revisions"'
const EXECUTIONS = '"AI_MARKETING_platform_workflow_node_executions"'
const SNAPSHOTS = '"AI_MARKETING_platform_workflow_run_snapshots"'
const ITERATIONS = '"AI_MARKETING_platform_workflow_iterations"'
const ATTEMPTS = '"AI_MARKETING_platform_workflow_node_attempts"'
const SNAPSHOTS_REGCLASS = "'\"AI_MARKETING_platform_workflow_run_snapshots\"'"
const WORKFLOWS_REGCLASS = "'\"AI_MARKETING_platform_workflows\"'"

const MIGRATION_SQL = `
ALTER TABLE ${RUNS} ADD COLUMN IF NOT EXISTS status VARCHAR(24) NOT NULL DEFAULT 'queued';

CREATE TABLE IF NOT EXISTS ${SNAPSHOTS} (
  task_run_id INTEGER PRIMARY KEY REFERENCES ${RUNS}(id) ON DELETE CASCADE,
  workflow_id INTEGER NOT NULL REFERENCES ${WORKFLOWS}(id) ON DELETE RESTRICT,
  revision_id INTEGER NOT NULL REFERENCES ${REVISIONS}(id) ON DELETE RESTRICT,
  definition_hash VARCHAR(64) NOT NULL,
  definition JSONB NOT NULL,
  request_id VARCHAR(64) NOT NULL,
  cancel_requested_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ${ITERATIONS} (
  id SERIAL PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES ${RUNS}(id) ON DELETE CASCADE,
  scope_node_key VARCHAR(120) NOT NULL,
  iteration_key VARCHAR(160) NOT NULL,
  iteration_index INTEGER NOT NULL CHECK (iteration_index >= 0),
  status VARCHAR(24) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  input_payload JSONB,
  output_payload JSONB,
  credits_reserved INTEGER NOT NULL DEFAULT 0,
  credits_consumed INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ${ATTEMPTS} (
  id SERIAL PRIMARY KEY,
  node_execution_id INTEGER NOT NULL REFERENCES ${EXECUTIONS}(id) ON DELETE CASCADE,
  iteration_id INTEGER REFERENCES ${ITERATIONS}(id) ON DELETE CASCADE,
  scope_key VARCHAR(160) NOT NULL,
  attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
  status VARCHAR(24) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'submitting', 'running', 'cancel_requested', 'succeeded', 'failed', 'cancelled')),
  idempotency_key VARCHAR(255) NOT NULL,
  provider_id VARCHAR(80),
  model_id VARCHAR(160),
  provider_request_id VARCHAR(255),
  provider_task_id VARCHAR(255),
  input_payload JSONB,
  output_payload JSONB,
  error_code VARCHAR(128),
  error_message TEXT,
  credits_reserved INTEGER NOT NULL DEFAULT 0,
  credits_consumed INTEGER NOT NULL DEFAULT 0,
  submitted_at TIMESTAMP,
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_platform_workflow_run_snapshots_workflow_request_idx"
  ON ${SNAPSHOTS}(workflow_id, request_id);
CREATE INDEX IF NOT EXISTS "AI_MARKETING_platform_workflow_run_snapshots_revision_idx"
  ON ${SNAPSHOTS}(revision_id);

-- Rebuild the snapshot -> workflow FK for databases created before the M3
-- contract. This is idempotent and prevents physical workflow deletion from
-- cascading away immutable run history.
DO $$
DECLARE constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = ${SNAPSHOTS_REGCLASS}::regclass
      AND c.confrelid = ${WORKFLOWS_REGCLASS}::regclass
      AND c.contype = 'f'
  LOOP
    EXECUTE format('ALTER TABLE ${SNAPSHOTS} DROP CONSTRAINT %I', constraint_name);
  END LOOP;
  ALTER TABLE ${SNAPSHOTS}
    ADD CONSTRAINT "AI_MARKETING_platform_workflow_run_snapshots_workflow_fk"
    FOREIGN KEY (workflow_id) REFERENCES ${WORKFLOWS}(id) ON DELETE RESTRICT;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_platform_workflow_iterations_run_scope_key_idx"
  ON ${ITERATIONS}(run_id, scope_node_key, iteration_key);
CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_platform_workflow_iterations_run_scope_index_idx"
  ON ${ITERATIONS}(run_id, scope_node_key, iteration_index);
CREATE INDEX IF NOT EXISTS "AI_MARKETING_platform_workflow_iterations_run_status_idx"
  ON ${ITERATIONS}(run_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_platform_workflow_node_attempts_idempotency_idx"
  ON ${ATTEMPTS}(idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_platform_workflow_node_attempts_node_scope_number_idx"
  ON ${ATTEMPTS}(node_execution_id, scope_key, attempt_number);
CREATE INDEX IF NOT EXISTS "AI_MARKETING_platform_workflow_node_attempts_provider_task_idx"
  ON ${ATTEMPTS}(provider_task_id);
CREATE INDEX IF NOT EXISTS "AI_MARKETING_platform_workflow_node_attempts_node_created_idx"
  ON ${ATTEMPTS}(node_execution_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AI_MARKETING_platform_workflow_iterations_status_check') THEN
    ALTER TABLE ${ITERATIONS}
      ADD CONSTRAINT "AI_MARKETING_platform_workflow_iterations_status_check"
      CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AI_MARKETING_platform_workflow_node_attempts_status_check') THEN
    ALTER TABLE ${ATTEMPTS}
      ADD CONSTRAINT "AI_MARKETING_platform_workflow_node_attempts_status_check"
      CHECK (status IN ('queued', 'submitting', 'running', 'cancel_requested', 'succeeded', 'failed', 'cancelled'));
  END IF;
END $$;
`

async function verify(pool) {
  const names = [
    "AI_MARKETING_platform_workflow_run_snapshots",
    "AI_MARKETING_platform_workflow_iterations",
    "AI_MARKETING_platform_workflow_node_attempts",
  ]
  const tables = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1) ORDER BY table_name",
    [names],
  )
  if (tables.rows.length !== names.length) throw new Error("workflow_iteration_tables_missing")
  const invalidIterationIndexes = await pool.query(`SELECT COUNT(*)::int AS count FROM ${ITERATIONS} WHERE iteration_index < 0`)
  if (invalidIterationIndexes.rows[0].count !== 0) throw new Error("workflow_iteration_index_invalid")
  const duplicateIdempotency = await pool.query(`SELECT COUNT(*)::int AS count FROM (SELECT idempotency_key FROM ${ATTEMPTS} GROUP BY idempotency_key HAVING COUNT(*) > 1) d`)
  if (duplicateIdempotency.rows[0].count !== 0) throw new Error("workflow_attempt_idempotency_duplicate")
  console.log(JSON.stringify({ ok: true, tables: tables.rows.map((row) => row.table_name) }))
}

async function main() {
  if (process.argv.includes("--dry-run")) {
    console.log(MIGRATION_SQL.trim())
    return
  }
  const pool = new Pool(getMigrationPoolConfig())
  try {
    await pool.query("BEGIN")
    await pool.query(MIGRATION_SQL)
    await pool.query("COMMIT")
    if (process.argv.includes("--verify")) await verify(pool)
    else console.log("Workflow Iteration/Attempt migration completed successfully")
  } catch (error) {
    await pool.query("ROLLBACK").catch(() => undefined)
    throw error
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error("Workflow Iteration/Attempt migration failed:", error)
  process.exit(1)
})
