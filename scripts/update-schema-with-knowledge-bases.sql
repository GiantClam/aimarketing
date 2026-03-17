CREATE TABLE IF NOT EXISTS "AI_MARKETING_industry_knowledge_bases" (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  source VARCHAR(255),
  milvus_collection_name VARCHAR(255) NOT NULL UNIQUE,
  updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "AI_MARKETING_personal_knowledge_bases" (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES "AI_MARKETING_users"(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  source VARCHAR(255),
  milvus_collection_name VARCHAR(255) NOT NULL UNIQUE,
  updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE "AI_MARKETING_templates"
ADD COLUMN IF NOT EXISTS tags TEXT,
ADD COLUMN IF NOT EXISTS industry_knowledge_base_id INTEGER REFERENCES "AI_MARKETING_industry_knowledge_bases"(id),
ADD COLUMN IF NOT EXISTS workflow_url TEXT,
ADD COLUMN IF NOT EXISTS workflow_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS workflow_api_key VARCHAR(500),
ADD COLUMN IF NOT EXISTS template_type VARCHAR(20) DEFAULT 'public',
ADD COLUMN IF NOT EXISTS custom_user_id INTEGER REFERENCES "AI_MARKETING_users"(id);

CREATE INDEX IF NOT EXISTS "AI_MARKETING_personal_kb_user_id_idx" ON "AI_MARKETING_personal_knowledge_bases"(user_id);
CREATE INDEX IF NOT EXISTS "AI_MARKETING_templates_category_idx" ON "AI_MARKETING_templates"(category);
CREATE INDEX IF NOT EXISTS "AI_MARKETING_templates_type_idx" ON "AI_MARKETING_templates"(template_type);
CREATE INDEX IF NOT EXISTS "AI_MARKETING_templates_industry_kb_idx" ON "AI_MARKETING_templates"(industry_knowledge_base_id);
