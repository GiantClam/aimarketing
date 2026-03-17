-- Create missing tables for AI Marketing Platform using prefixed table names

CREATE TABLE IF NOT EXISTS "AI_MARKETING_templates" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    description TEXT,
    tags TEXT[] DEFAULT '{}',
    category TEXT NOT NULL,
    industry_knowledge_base_id TEXT,
    workflow_url TEXT NOT NULL,
    workflow_id TEXT,
    workflow_api_key TEXT,
    workflow_type TEXT NOT NULL CHECK (workflow_type IN ('n8n', 'dify')),
    template_type TEXT NOT NULL CHECK (template_type IN ('public', 'custom')),
    custom_user_id TEXT,
    input_fields JSONB DEFAULT '{}',
    output_format TEXT DEFAULT 'text',
    usage_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (custom_user_id) REFERENCES "AI_MARKETING_users"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "AI_MARKETING_industry_knowledge_bases" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    milvus_collection_name TEXT NOT NULL UNIQUE,
    source_url TEXT,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    document_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "AI_MARKETING_personal_knowledge_bases" (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    description TEXT,
    user_id TEXT NOT NULL,
    milvus_collection_name TEXT NOT NULL UNIQUE,
    source_type TEXT DEFAULT 'upload',
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    document_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES "AI_MARKETING_users"(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "AI_MARKETING_templates_category_idx" ON "AI_MARKETING_templates"(category);
CREATE INDEX IF NOT EXISTS "AI_MARKETING_templates_template_type_idx" ON "AI_MARKETING_templates"(template_type);
CREATE INDEX IF NOT EXISTS "AI_MARKETING_templates_custom_user_id_idx" ON "AI_MARKETING_templates"(custom_user_id);
CREATE INDEX IF NOT EXISTS "AI_MARKETING_templates_is_active_idx" ON "AI_MARKETING_templates"(is_active);
CREATE INDEX IF NOT EXISTS "AI_MARKETING_industry_kb_category_idx" ON "AI_MARKETING_industry_knowledge_bases"(category);
CREATE INDEX IF NOT EXISTS "AI_MARKETING_industry_kb_is_active_idx" ON "AI_MARKETING_industry_knowledge_bases"(is_active);
CREATE INDEX IF NOT EXISTS "AI_MARKETING_personal_kb_user_id_idx" ON "AI_MARKETING_personal_knowledge_bases"(user_id);
CREATE INDEX IF NOT EXISTS "AI_MARKETING_personal_kb_is_active_idx" ON "AI_MARKETING_personal_knowledge_bases"(is_active);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS "AI_MARKETING_update_templates_updated_at" ON "AI_MARKETING_templates";
CREATE TRIGGER "AI_MARKETING_update_templates_updated_at" BEFORE UPDATE ON "AI_MARKETING_templates" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS "AI_MARKETING_update_industry_kb_updated_at" ON "AI_MARKETING_industry_knowledge_bases";
CREATE TRIGGER "AI_MARKETING_update_industry_kb_updated_at" BEFORE UPDATE ON "AI_MARKETING_industry_knowledge_bases" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS "AI_MARKETING_update_personal_kb_updated_at" ON "AI_MARKETING_personal_knowledge_bases";
CREATE TRIGGER "AI_MARKETING_update_personal_kb_updated_at" BEFORE UPDATE ON "AI_MARKETING_personal_knowledge_bases" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
