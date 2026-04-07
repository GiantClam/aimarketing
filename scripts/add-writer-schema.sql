CREATE TABLE IF NOT EXISTS "AI_MARKETING_writer_conversations" (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES "AI_MARKETING_users"(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  platform VARCHAR(32) NOT NULL DEFAULT 'wechat',
  mode VARCHAR(32) NOT NULL DEFAULT 'article',
  language VARCHAR(32) NOT NULL DEFAULT 'auto',
  status VARCHAR(32) NOT NULL DEFAULT 'drafting',
  images_requested BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "AI_MARKETING_writer_conversations" ADD COLUMN IF NOT EXISTS platform VARCHAR(32) NOT NULL DEFAULT 'wechat';
ALTER TABLE "AI_MARKETING_writer_conversations" ADD COLUMN IF NOT EXISTS mode VARCHAR(32) NOT NULL DEFAULT 'article';
ALTER TABLE "AI_MARKETING_writer_conversations" ADD COLUMN IF NOT EXISTS language VARCHAR(32) NOT NULL DEFAULT 'auto';
ALTER TABLE "AI_MARKETING_writer_conversations" ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'drafting';
ALTER TABLE "AI_MARKETING_writer_conversations" ADD COLUMN IF NOT EXISTS images_requested BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS "AI_MARKETING_writer_conversations_user_created_idx"
ON "AI_MARKETING_writer_conversations"(user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS "AI_MARKETING_writer_conversations_user_updated_idx"
ON "AI_MARKETING_writer_conversations"(user_id, updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS "AI_MARKETING_writer_messages" (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES "AI_MARKETING_writer_conversations"(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  diagnostics JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "AI_MARKETING_writer_messages" ADD COLUMN IF NOT EXISTS diagnostics JSONB;

CREATE INDEX IF NOT EXISTS "AI_MARKETING_writer_messages_conversation_created_idx"
ON "AI_MARKETING_writer_messages"(conversation_id, created_at ASC, id ASC);
