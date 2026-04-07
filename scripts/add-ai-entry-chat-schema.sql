CREATE TABLE IF NOT EXISTS "AI_MARKETING_conversations" (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES "AI_MARKETING_users"(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  current_model_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "AI_MARKETING_conversations"
ADD COLUMN IF NOT EXISTS current_model_id VARCHAR(255);

CREATE TABLE IF NOT EXISTS "AI_MARKETING_messages" (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES "AI_MARKETING_conversations"(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  knowledge_source VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "AI_MARKETING_conversations_user_created_idx"
ON "AI_MARKETING_conversations"(user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS "AI_MARKETING_messages_conversation_created_idx"
ON "AI_MARKETING_messages"(conversation_id, created_at ASC, id ASC);
