const { Pool } = require("pg")
const { createHash } = require("node:crypto")
require("./load-env")
const { getMigrationPoolConfig } = require("./get-db-connection")

const WORKFLOWS = '"AI_MARKETING_platform_workflows"'
const NODES = '"AI_MARKETING_platform_workflow_nodes"'
const EDGES = '"AI_MARKETING_platform_workflow_edges"'
const REVISIONS = '"AI_MARKETING_platform_workflow_revisions"'
const USERS = '"AI_MARKETING_users"'
const REVISIONS_REGCLASS = "'\"AI_MARKETING_platform_workflow_revisions\"'"
const WORKFLOWS_REGCLASS = "'\"AI_MARKETING_platform_workflows\"'"

// This migration is intentionally idempotent.  It can be run against a v1
// database before enabling WORKFLOW_DEFINITION_V2_WRITE.
const MIGRATION_SQL = `
ALTER TABLE ${WORKFLOWS} ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE ${WORKFLOWS} ADD COLUMN IF NOT EXISTS current_revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE ${NODES} ADD COLUMN IF NOT EXISTS node_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE ${EDGES} ADD COLUMN IF NOT EXISTS edge_key VARCHAR(180);
ALTER TABLE ${EDGES} ADD COLUMN IF NOT EXISTS source_port_id VARCHAR(120);
ALTER TABLE ${EDGES} ADD COLUMN IF NOT EXISTS target_port_id VARCHAR(120);

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY workflow_id ORDER BY id
  ) - 1 AS ordinal
  FROM ${EDGES}
  WHERE edge_key IS NULL
)
UPDATE ${EDGES} e
SET edge_key = 'legacy:' || e.source_node_key || ':' || e.target_node_key || ':' || COALESCE(e.input_name, 'input') || ':' || ranked.ordinal,
    source_port_id = COALESCE(e.source_port_id, CASE COALESCE(e.input_name, '') WHEN 'text' THEN 'text' WHEN 'assets' THEN 'asset' WHEN 'images' THEN 'image' WHEN 'videos' THEN 'video' WHEN 'audios' THEN 'audio' WHEN 'presentations' THEN 'ppt' ELSE 'output' END),
    target_port_id = COALESCE(e.target_port_id, CASE COALESCE(e.input_name, '') WHEN 'text' THEN 'text' WHEN 'assets' THEN 'assets' WHEN 'images' THEN 'images' WHEN 'videos' THEN 'videos' WHEN 'audios' THEN 'audios' WHEN 'presentations' THEN 'presentations' ELSE 'input' END)
FROM ranked
WHERE e.id = ranked.id;

UPDATE ${EDGES}
SET source_port_id = COALESCE(source_port_id, 'output'),
    target_port_id = COALESCE(target_port_id, 'input')
WHERE edge_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_platform_workflow_edges_workflow_edge_key_idx"
  ON ${EDGES}(workflow_id, edge_key);
CREATE INDEX IF NOT EXISTS "AI_MARKETING_platform_workflow_edges_workflow_edge_created_idx"
  ON ${EDGES}(workflow_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ${REVISIONS} (
  id SERIAL PRIMARY KEY,
  workflow_id INTEGER NOT NULL REFERENCES ${WORKFLOWS}(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL,
  schema_version INTEGER NOT NULL,
  definition_hash VARCHAR(64) NOT NULL,
  definition JSONB NOT NULL,
  created_by_user_id INTEGER NOT NULL REFERENCES ${USERS}(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "AI_MARKETING_platform_workflow_revisions_workflow_revision_unique" UNIQUE(workflow_id, revision)
);
CREATE INDEX IF NOT EXISTS "AI_MARKETING_platform_workflow_revisions_workflow_created_idx"
  ON ${REVISIONS}(workflow_id, created_at DESC);

-- Existing installations may have created the revision FK with the original
-- CASCADE action. Rebuild that FK idempotently so historical revisions make a
-- workflow deletion fail at the database boundary instead of cascading.
DO $$
DECLARE constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = ${REVISIONS_REGCLASS}::regclass
      AND c.confrelid = ${WORKFLOWS_REGCLASS}::regclass
      AND c.contype = 'f'
  LOOP
    EXECUTE format('ALTER TABLE ${REVISIONS} DROP CONSTRAINT %I', constraint_name);
  END LOOP;
  ALTER TABLE ${REVISIONS}
    ADD CONSTRAINT "AI_MARKETING_platform_workflow_revisions_workflow_fk"
    FOREIGN KEY (workflow_id) REFERENCES ${WORKFLOWS}(id) ON DELETE RESTRICT;
END $$;

-- Existing normalized definitions become immutable revision 1.  The hash is
-- recomputed by the application when loaded; migration only guarantees a
-- complete, deterministic JSON snapshot and a non-null hash placeholder.
INSERT INTO ${REVISIONS} (workflow_id, revision, schema_version, definition_hash, definition, created_by_user_id)
SELECT w.id,
       1,
       2,
       repeat('0', 64),
       jsonb_build_object(
         'workflowId', w.id,
         'title', w.title,
         'description', w.description,
         'status', w.status,
         'triggerType', w.trigger_type,
         'metadata', w.metadata,
         'definition', jsonb_build_object(
           'schemaVersion', 2,
           'revision', 1,
           'definitionHash', repeat('0', 64),
           'nodes', COALESCE((SELECT jsonb_agg(jsonb_build_object(
             'nodeKey', n.node_key, 'type', n.type, 'nodeVersion', COALESCE(n.node_version, 1),
             'title', n.title, 'positionX', n.position_x, 'positionY', n.position_y, 'config', n.config
           ) ORDER BY n.node_key) FROM ${NODES} n WHERE n.workflow_id = w.id), '[]'::jsonb),
           'edges', COALESCE((SELECT jsonb_agg(jsonb_build_object(
             'edgeKey', e.edge_key, 'sourceNodeKey', e.source_node_key,
             'sourcePortId', COALESCE(e.source_port_id, 'output'),
             'targetNodeKey', e.target_node_key, 'targetPortId', COALESCE(e.target_port_id, 'input'),
             'inputName', e.input_name
           ) ORDER BY e.edge_key) FROM ${EDGES} e WHERE e.workflow_id = w.id), '[]'::jsonb)
         )
       ),
       w.owner_user_id
FROM ${WORKFLOWS} w
WHERE NOT EXISTS (SELECT 1 FROM ${REVISIONS} r WHERE r.workflow_id = w.id);

UPDATE ${WORKFLOWS} w
SET schema_version = 2,
    current_revision = GREATEST(COALESCE(w.current_revision, 1), 1)
WHERE EXISTS (SELECT 1 FROM ${REVISIONS} r WHERE r.workflow_id = w.id);
`

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]))
}

function hashDefinition(definition) {
  const envelope = definition.definition
  const payload = stable({
    schemaVersion: envelope.schemaVersion,
    nodes: [...(envelope.nodes || [])].sort((a, b) => String(a.nodeKey) < String(b.nodeKey) ? -1 : String(a.nodeKey) > String(b.nodeKey) ? 1 : 0),
    edges: [...(envelope.edges || [])].sort((a, b) => String(a.edgeKey) < String(b.edgeKey) ? -1 : String(a.edgeKey) > String(b.edgeKey) ? 1 : 0),
  })
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex")
}

async function backfillHashes(pool) {
  const rows = await pool.query(`SELECT id, definition FROM ${REVISIONS}`)
  for (const row of rows.rows) {
    const definition = row.definition
    const hash = hashDefinition(definition)
    definition.definition.definitionHash = hash
    await pool.query(`UPDATE ${REVISIONS} SET definition_hash = $1, definition = $2::jsonb WHERE id = $3`, [hash, JSON.stringify(definition), row.id])
  }
}

async function verify(pool) {
  const tables = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1) ORDER BY table_name`,
    [[
      "AI_MARKETING_platform_workflow_revisions",
      "AI_MARKETING_platform_workflows",
      "AI_MARKETING_platform_workflow_nodes",
      "AI_MARKETING_platform_workflow_edges",
    ]],
  )
  if (tables.rows.length !== 4) throw new Error("workflow_v2_schema_missing")
  const bad = await pool.query(
    `SELECT COUNT(*)::int AS count FROM ${EDGES} WHERE edge_key IS NULL OR source_port_id IS NULL OR target_port_id IS NULL`,
  )
  if (bad.rows[0].count !== 0) throw new Error("workflow_v2_edge_backfill_incomplete")
  const duplicate = await pool.query(
    `SELECT COUNT(*)::int AS count FROM (SELECT workflow_id, edge_key FROM ${EDGES} GROUP BY workflow_id, edge_key HAVING COUNT(*) > 1) d`,
  )
  if (duplicate.rows[0].count !== 0) throw new Error("workflow_v2_duplicate_edge_keys")
  const missingRevisions = await pool.query(
    `SELECT COUNT(*)::int AS count FROM ${WORKFLOWS} w WHERE NOT EXISTS (SELECT 1 FROM ${REVISIONS} r WHERE r.workflow_id = w.id)`,
  )
  if (missingRevisions.rows[0].count !== 0) throw new Error("workflow_v2_revision_backfill_incomplete")
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
    await backfillHashes(pool)
    await pool.query("COMMIT")
    if (process.argv.includes("--verify")) await verify(pool)
    else console.log("Workflow Definition V2 migration completed successfully")
  } catch (error) {
    await pool.query("ROLLBACK").catch(() => undefined)
    throw error
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error("Workflow Definition V2 migration failed:", error)
  process.exit(1)
})
