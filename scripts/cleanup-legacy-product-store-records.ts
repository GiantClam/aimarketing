import "./load-env"

import { sql } from "drizzle-orm"

import { db, pool } from "@/lib/db"

type CleanupSummary = {
  legacyExecutionCount: number
  legacyArtifactCount: number
  relatedWorkItemCount: number
  relatedKnowledgeJobCount: number
}

function isApplyMode() {
  return process.argv.includes("--apply")
}

async function readSummary(): Promise<CleanupSummary> {
  const result = await db.execute(sql`
    with target_artifacts as (
      select id
      from "AI_MARKETING_platform_artifacts"
      where coalesce(payload->>'source', '') = 'workflow'
        and kind = 'text'
        and payload ? 'text'
        and payload ? 'workflowStoreNodeKey'
        and coalesce(payload->>'embeddedContentBase64', '') = ''
        and storage_key is null
        and external_url is null
    )
    select
      (
        select count(*)::int
        from "AI_MARKETING_platform_workflow_node_executions"
        where node_type = 'product_store'
          and output_payload ? 'text'
      ) as "legacyExecutionCount",
      (select count(*)::int from target_artifacts) as "legacyArtifactCount",
      (
        select count(*)::int
        from "AI_MARKETING_platform_work_items"
        where source_artifact_id in (select id from target_artifacts)
      ) as "relatedWorkItemCount",
      (
        select count(*)::int
        from "AI_MARKETING_platform_knowledge_save_jobs"
        where artifact_id in (select id from target_artifacts)
      ) as "relatedKnowledgeJobCount"
  `)

  const row = result.rows[0] as CleanupSummary | undefined
  return {
    legacyExecutionCount: row?.legacyExecutionCount ?? 0,
    legacyArtifactCount: row?.legacyArtifactCount ?? 0,
    relatedWorkItemCount: row?.relatedWorkItemCount ?? 0,
    relatedKnowledgeJobCount: row?.relatedKnowledgeJobCount ?? 0,
  }
}

async function applyCleanup() {
  return db.transaction(async (tx) => {
    const updatedExecutions = await tx.execute(sql`
      update "AI_MARKETING_platform_workflow_node_executions"
      set
        output_payload = case
          when jsonb_strip_nulls(output_payload - 'text') = '{}'::jsonb then null
          else jsonb_strip_nulls(output_payload - 'text')
        end,
        updated_at = now()
      where node_type = 'product_store'
        and output_payload ? 'text'
      returning id
    `)

    const deletedArtifacts = await tx.execute(sql`
      delete from "AI_MARKETING_platform_artifacts"
      where id in (
        select id
        from "AI_MARKETING_platform_artifacts"
        where coalesce(payload->>'source', '') = 'workflow'
          and kind = 'text'
          and payload ? 'text'
          and payload ? 'workflowStoreNodeKey'
          and coalesce(payload->>'embeddedContentBase64', '') = ''
          and storage_key is null
          and external_url is null
      )
      returning id
    `)

    return {
      updatedExecutionCount: updatedExecutions.rows.length,
      deletedArtifactCount: deletedArtifacts.rows.length,
    }
  })
}

async function main() {
  const before = await readSummary()

  console.info("workflow.product-store.cleanup.summary", {
    mode: isApplyMode() ? "apply" : "dry-run",
    ...before,
  })

  if (!isApplyMode()) {
    return
  }

  const mutation = await applyCleanup()
  const after = await readSummary()

  console.info("workflow.product-store.cleanup.applied", {
    ...mutation,
    after,
  })
}

main()
  .catch((error) => {
    console.error("workflow.product-store.cleanup.failed", {
      message: error instanceof Error ? error.message : String(error),
    })
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end().catch(() => undefined)
  })
