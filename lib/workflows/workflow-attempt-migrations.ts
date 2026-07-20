import { sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { ensureWorkflowTables } from "@/lib/workflows/store"

let ensurePromise: Promise<void> | null = null

/**
 * Development/test safety net for databases that have not run the explicit
 * workflow iteration migration yet. The migration is memoized per process;
 * production deployments should run scripts/run-workflow-iteration-migration.js
 * during release/startup and therefore never issue CREATE TABLE per request.
 */
export function ensureWorkflowAttemptTables() {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      await ensureWorkflowTables()
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "AI_MARKETING_platform_workflow_run_snapshots" (
          task_run_id INTEGER PRIMARY KEY REFERENCES "AI_MARKETING_platform_task_runs"(id) ON DELETE CASCADE,
          workflow_id INTEGER NOT NULL REFERENCES "AI_MARKETING_platform_workflows"(id) ON DELETE RESTRICT,
          revision_id INTEGER NOT NULL REFERENCES "AI_MARKETING_platform_workflow_revisions"(id) ON DELETE RESTRICT,
          definition_hash VARCHAR(64) NOT NULL,
          definition JSONB NOT NULL,
          request_id VARCHAR(64) NOT NULL,
          cancel_requested_at TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `)
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "AI_MARKETING_platform_workflow_iterations" (
          id SERIAL PRIMARY KEY,
          run_id INTEGER NOT NULL REFERENCES "AI_MARKETING_platform_task_runs"(id) ON DELETE CASCADE,
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
        )
      `)
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "AI_MARKETING_platform_workflow_node_attempts" (
          id SERIAL PRIMARY KEY,
          node_execution_id INTEGER NOT NULL REFERENCES "AI_MARKETING_platform_workflow_node_executions"(id) ON DELETE CASCADE,
          iteration_id INTEGER REFERENCES "AI_MARKETING_platform_workflow_iterations"(id) ON DELETE CASCADE,
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
        )
      `)
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_platform_workflow_run_snapshots_workflow_request_idx" ON "AI_MARKETING_platform_workflow_run_snapshots"(workflow_id, request_id)`)
      await db.execute(sql`CREATE INDEX IF NOT EXISTS "AI_MARKETING_platform_workflow_run_snapshots_revision_idx" ON "AI_MARKETING_platform_workflow_run_snapshots"(revision_id)`)
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_platform_workflow_iterations_run_scope_key_idx" ON "AI_MARKETING_platform_workflow_iterations"(run_id, scope_node_key, iteration_key)`)
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_platform_workflow_iterations_run_scope_index_idx" ON "AI_MARKETING_platform_workflow_iterations"(run_id, scope_node_key, iteration_index)`)
      await db.execute(sql`CREATE INDEX IF NOT EXISTS "AI_MARKETING_platform_workflow_iterations_run_status_idx" ON "AI_MARKETING_platform_workflow_iterations"(run_id, status)`)
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_platform_workflow_node_attempts_idempotency_idx" ON "AI_MARKETING_platform_workflow_node_attempts"(idempotency_key)`)
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_platform_workflow_node_attempts_node_scope_number_idx" ON "AI_MARKETING_platform_workflow_node_attempts"(node_execution_id, scope_key, attempt_number)`)
      await db.execute(sql`CREATE INDEX IF NOT EXISTS "AI_MARKETING_platform_workflow_node_attempts_provider_task_idx" ON "AI_MARKETING_platform_workflow_node_attempts"(provider_task_id)`)
      await db.execute(sql`CREATE INDEX IF NOT EXISTS "AI_MARKETING_platform_workflow_node_attempts_node_created_idx" ON "AI_MARKETING_platform_workflow_node_attempts"(node_execution_id, created_at DESC)`)
      await db.execute(sql`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AI_MARKETING_platform_workflow_iterations_status_check') THEN
            ALTER TABLE "AI_MARKETING_platform_workflow_iterations"
              ADD CONSTRAINT "AI_MARKETING_platform_workflow_iterations_status_check"
              CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled'));
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AI_MARKETING_platform_workflow_node_attempts_status_check') THEN
            ALTER TABLE "AI_MARKETING_platform_workflow_node_attempts"
              ADD CONSTRAINT "AI_MARKETING_platform_workflow_node_attempts_status_check"
              CHECK (status IN ('queued', 'submitting', 'running', 'cancel_requested', 'succeeded', 'failed', 'cancelled'));
          END IF;
        END $$;
      `)
    })().catch((error) => {
      ensurePromise = null
      throw error
    })
  }
  return ensurePromise
}
