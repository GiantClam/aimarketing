CREATE TABLE IF NOT EXISTS "AI_MARKETING_lead_hunter_conversations" (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES "AI_MARKETING_users"(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "AI_MARKETING_lead_hunter_conversations_user_updated_idx"
ON "AI_MARKETING_lead_hunter_conversations" (user_id, updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS "AI_MARKETING_lead_hunter_messages" (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES "AI_MARKETING_lead_hunter_conversations"(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "AI_MARKETING_lead_hunter_messages_conversation_id_desc_idx"
ON "AI_MARKETING_lead_hunter_messages" (conversation_id, id DESC);
