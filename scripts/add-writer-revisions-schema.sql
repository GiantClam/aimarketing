ALTER TABLE "AI_MARKETING_writer_conversations" ADD COLUMN IF NOT EXISTS active_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AI_MARKETING_writer_conversations" ADD COLUMN IF NOT EXISTS active_draft_message_id INTEGER;
ALTER TABLE "AI_MARKETING_writer_conversations" ADD COLUMN IF NOT EXISTS turn_outcome VARCHAR(32);
ALTER TABLE "AI_MARKETING_writer_conversations" ADD COLUMN IF NOT EXISTS asset_status VARCHAR(32) NOT NULL DEFAULT 'none';
ALTER TABLE "AI_MARKETING_writer_conversations" ADD COLUMN IF NOT EXISTS active_platform_skill_id VARCHAR(120);
ALTER TABLE "AI_MARKETING_writer_conversations" ADD COLUMN IF NOT EXISTS context_hash VARCHAR(128);
ALTER TABLE "AI_MARKETING_writer_conversations" ADD COLUMN IF NOT EXISTS skill_release VARCHAR(64);
ALTER TABLE "AI_MARKETING_writer_conversations" ADD COLUMN IF NOT EXISTS skill_digest VARCHAR(128);
ALTER TABLE "AI_MARKETING_writer_messages" ADD COLUMN IF NOT EXISTS revision INTEGER;
ALTER TABLE "AI_MARKETING_writer_messages" ADD COLUMN IF NOT EXISTS expected_base_revision INTEGER;
ALTER TABLE "AI_MARKETING_writer_messages" ADD COLUMN IF NOT EXISTS is_active_draft BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS "AI_MARKETING_writer_messages_conversation_revision_idx"
  ON "AI_MARKETING_writer_messages" (conversation_id, revision DESC);

WITH latest AS (
  SELECT DISTINCT ON (conversation_id) id, conversation_id
  FROM "AI_MARKETING_writer_messages"
  WHERE role = 'assistant' AND length(trim(content)) > 0
  ORDER BY conversation_id, id DESC
)
UPDATE "AI_MARKETING_writer_messages" AS message
SET revision = 1, is_active_draft = TRUE
FROM latest
WHERE message.id = latest.id
  AND NOT EXISTS (
    SELECT 1 FROM "AI_MARKETING_writer_messages" existing
    WHERE existing.conversation_id = message.conversation_id
      AND existing.revision IS NOT NULL
  );

UPDATE "AI_MARKETING_writer_conversations" AS conversation
SET active_revision = 1,
    active_draft_message_id = latest.id,
    turn_outcome = 'draft_ready',
    status = CASE WHEN conversation.status = 'drafting' THEN 'text_ready' ELSE conversation.status END
FROM (
  SELECT DISTINCT ON (conversation_id) id, conversation_id
  FROM "AI_MARKETING_writer_messages"
  WHERE role = 'assistant' AND revision = 1 AND is_active_draft = TRUE
  ORDER BY conversation_id, id DESC
) AS latest
WHERE conversation.id = latest.conversation_id
  AND conversation.active_revision = 0;
