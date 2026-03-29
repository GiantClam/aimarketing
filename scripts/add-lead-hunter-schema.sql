CREATE TABLE IF NOT EXISTS "AI_MARKETING_lead_hunter_conversations" (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES "AI_MARKETING_users"(id) ON DELETE CASCADE,
  advisor_type VARCHAR(32) NOT NULL DEFAULT 'company-search',
  title VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE "AI_MARKETING_lead_hunter_conversations"
ADD COLUMN IF NOT EXISTS advisor_type VARCHAR(32);

UPDATE "AI_MARKETING_lead_hunter_conversations"
SET advisor_type = CASE
  WHEN advisor_type IS NULL OR advisor_type = '' OR advisor_type = 'lead-hunter' THEN 'company-search'
  ELSE advisor_type
END;

ALTER TABLE "AI_MARKETING_lead_hunter_conversations"
ALTER COLUMN advisor_type SET DEFAULT 'company-search';

ALTER TABLE "AI_MARKETING_lead_hunter_conversations"
ALTER COLUMN advisor_type SET NOT NULL;

CREATE INDEX IF NOT EXISTS "AI_MARKETING_lead_hunter_conversations_user_updated_idx"
ON "AI_MARKETING_lead_hunter_conversations" (user_id, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS "AI_MARKETING_lead_hunter_conversations_user_type_updated_idx"
ON "AI_MARKETING_lead_hunter_conversations" (user_id, advisor_type, updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS "AI_MARKETING_lead_hunter_messages" (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES "AI_MARKETING_lead_hunter_conversations"(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "AI_MARKETING_lead_hunter_messages_conversation_id_desc_idx"
ON "AI_MARKETING_lead_hunter_messages" (conversation_id, id DESC);
