-- AI Marketing prefixed bootstrap schema
CREATE TABLE IF NOT EXISTS "AI_MARKETING_users" (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  password VARCHAR(255),
  is_demo BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "AI_MARKETING_user_files" (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES "AI_MARKETING_users"(id),
  file_name TEXT NOT NULL,
  file_type VARCHAR(50) NOT NULL,
  file_size INTEGER NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  status VARCHAR(20) DEFAULT 'pending' NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "AI_MARKETING_conversations" (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES "AI_MARKETING_users"(id),
  title VARCHAR(255) NOT NULL,
  current_model_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "AI_MARKETING_messages" (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES "AI_MARKETING_conversations"(id),
  role VARCHAR(20) NOT NULL,
  content TEXT NOT NULL,
  knowledge_source VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "AI_MARKETING_submitted_urls" (
  id SERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  title VARCHAR(255),
  status VARCHAR(20) DEFAULT 'pending' NOT NULL,
  submitted_by INTEGER REFERENCES "AI_MARKETING_users"(id),
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO "AI_MARKETING_users" (email, name, is_demo)
VALUES ('demo@example.com', '演示用户', TRUE)
ON CONFLICT (email) DO NOTHING;
