-- Prefixed schema variant for AI Marketing
CREATE TABLE IF NOT EXISTS "AI_MARKETING_users" (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  avatar_url TEXT,
  is_demo BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "AI_MARKETING_conversations" (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "AI_MARKETING_users"(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "AI_MARKETING_messages" (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES "AI_MARKETING_conversations"(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "AI_MARKETING_users"(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  knowledge_source TEXT CHECK (knowledge_source IN ('industry', 'personal')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "AI_MARKETING_user_files" (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "AI_MARKETING_users"(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER,
  processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  dify_document_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "AI_MARKETING_url_submissions" (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "AI_MARKETING_users"(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  processing_status TEXT DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  n8n_execution_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "AI_MARKETING_conversations_user_id_idx" ON "AI_MARKETING_conversations"(user_id);
CREATE INDEX IF NOT EXISTS "AI_MARKETING_messages_conversation_id_idx" ON "AI_MARKETING_messages"(conversation_id);
CREATE INDEX IF NOT EXISTS "AI_MARKETING_messages_user_id_idx" ON "AI_MARKETING_messages"(user_id);
CREATE INDEX IF NOT EXISTS "AI_MARKETING_user_files_user_id_idx" ON "AI_MARKETING_user_files"(user_id);
CREATE INDEX IF NOT EXISTS "AI_MARKETING_url_submissions_user_id_idx" ON "AI_MARKETING_url_submissions"(user_id);

INSERT INTO "AI_MARKETING_users" (id, email, name, is_demo)
VALUES ('demo-user', 'demo@example.com', '演示用户', TRUE)
ON CONFLICT (id) DO NOTHING;
