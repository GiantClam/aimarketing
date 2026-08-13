import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const migrationPath = new URL("./add-writer-revisions-schema.sql", import.meta.url)

test("writer revision migration backfills only eligible conversations without rewriting content", async () => {
  const sql = await readFile(migrationPath, "utf8")

  assert.match(sql, /WHERE role = 'assistant' AND length\(trim\(content\)\) > 0/u)
  assert.match(sql, /SET revision = 1, is_active_draft = TRUE/u)
  assert.match(sql, /AND NOT EXISTS \([\s\S]*existing\.revision IS NOT NULL/u)
  assert.match(sql, /SET active_revision = 1,[\s\S]*active_draft_message_id = latest\.id/u)
  assert.match(sql, /AND conversation\.active_revision = 0/u)
  assert.match(sql, /turn_outcome = 'draft_ready'/u)
})
