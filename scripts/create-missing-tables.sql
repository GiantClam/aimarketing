-- Create templates table
CREATE TABLE IF NOT EXISTS "AI_MARKETING_templates" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',
    category TEXT NOT NULL,
    industry_kb_id TEXT,
    workflow_url TEXT NOT NULL,
    workflow_id TEXT NOT NULL,
    workflow_api_key TEXT NOT NULL,
    workflow_type TEXT NOT NULL CHECK (workflow_type IN ('n8n', 'dify')),
    template_type TEXT NOT NULL DEFAULT 'public' CHECK (template_type IN ('public', 'custom')),
    user_id TEXT,
    prompt TEXT NOT NULL,
    workflow_config JSONB DEFAULT '{}',
    usage_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES "AI_MARKETING_users"(id) ON DELETE CASCADE,
    FOREIGN KEY (industry_kb_id) REFERENCES "AI_MARKETING_industry_knowledge_bases"(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "AI_MARKETING_industry_knowledge_bases" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    description TEXT,
    milvus_collection_name TEXT NOT NULL UNIQUE,
    source_url TEXT,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "AI_MARKETING_personal_knowledge_bases" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    description TEXT,
    milvus_collection_name TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    source_info JSONB DEFAULT '{}',
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES "AI_MARKETING_users"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "AI_MARKETING_templates_category_idx" ON "AI_MARKETING_templates"(category);
CREATE INDEX IF NOT EXISTS "AI_MARKETING_templates_user_id_idx" ON "AI_MARKETING_templates"(user_id);
CREATE INDEX IF NOT EXISTS "AI_MARKETING_templates_template_type_idx" ON "AI_MARKETING_templates"(template_type);
CREATE INDEX IF NOT EXISTS "AI_MARKETING_templates_is_active_idx" ON "AI_MARKETING_templates"(is_active);
CREATE INDEX IF NOT EXISTS "AI_MARKETING_personal_kb_user_id_idx" ON "AI_MARKETING_personal_knowledge_bases"(user_id);
