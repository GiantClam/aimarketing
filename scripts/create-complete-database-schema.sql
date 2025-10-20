-- Create missing tables for AI Marketing Platform

-- Templates table for content templates with workflow configurations
CREATE TABLE IF NOT EXISTS templates (
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
    FOREIGN KEY (custom_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Industry knowledge bases table (read-only for users)
CREATE TABLE IF NOT EXISTS industry_knowledge_bases (
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

-- Personal knowledge bases table (full CRUD for owners)
CREATE TABLE IF NOT EXISTS personal_knowledge_bases (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    description TEXT,
    user_id TEXT NOT NULL,
    milvus_collection_name TEXT NOT NULL UNIQUE,
    source_type TEXT DEFAULT 'upload', -- 'upload', 'url', 'manual'
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    document_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
CREATE INDEX IF NOT EXISTS idx_templates_template_type ON templates(template_type);
CREATE INDEX IF NOT EXISTS idx_templates_custom_user_id ON templates(custom_user_id);
CREATE INDEX IF NOT EXISTS idx_templates_is_active ON templates(is_active);

CREATE INDEX IF NOT EXISTS idx_industry_kb_category ON industry_knowledge_bases(category);
CREATE INDEX IF NOT EXISTS idx_industry_kb_is_active ON industry_knowledge_bases(is_active);

CREATE INDEX IF NOT EXISTS idx_personal_kb_user_id ON personal_knowledge_bases(user_id);
CREATE INDEX IF NOT EXISTS idx_personal_kb_is_active ON personal_knowledge_bases(is_active);

-- Insert default industry knowledge bases
INSERT INTO industry_knowledge_bases (name, description, category, milvus_collection_name, source_url) VALUES
('电商营销知识库', '包含电商平台营销策略、用户运营、转化优化等专业知识', '电商', 'ecommerce_marketing_kb', 'https://industry-data.example.com/ecommerce'),
('金融科技知识库', '涵盖金融产品营销、风控合规、用户教育等内容', '金融', 'fintech_marketing_kb', 'https://industry-data.example.com/fintech'),
('教育培训知识库', '教育行业营销策略、课程推广、学员转化等专业内容', '教育', 'education_marketing_kb', 'https://industry-data.example.com/education'),
('医疗健康知识库', '医疗健康产品营销、患者教育、合规宣传等知识', '医疗', 'healthcare_marketing_kb', 'https://industry-data.example.com/healthcare'),
('科技互联网知识库', '科技产品营销、技术传播、开发者社区运营等内容', '科技', 'tech_marketing_kb', 'https://industry-data.example.com/tech');

-- Insert default public templates
INSERT INTO templates (name, description, category, workflow_url, workflow_type, template_type, input_fields, output_format) VALUES
('社交媒体文案生成', '基于产品特点和目标用户生成吸引人的社交媒体文案', '社交媒体', 'https://n8n.example.com/webhook/social-media-copy', 'n8n', 'public', 
 '{"product_name": "string", "target_audience": "string", "platform": "string", "tone": "string"}', 'text'),

('产品介绍文章', '生成详细的产品介绍文章，突出产品优势和使用场景', '内容营销', 'https://dify.example.com/api/v1/workflows/product-article', 'dify', 'public',
 '{"product_name": "string", "features": "array", "benefits": "array", "target_market": "string"}', 'markdown'),

('邮件营销模板', '创建个性化的邮件营销内容，提高打开率和转化率', '邮件营销', 'https://n8n.example.com/webhook/email-template', 'n8n', 'public',
 '{"subject_line": "string", "recipient_segment": "string", "call_to_action": "string", "personalization": "object"}', 'html'),

('广告创意文案', '生成多平台广告创意文案，包括标题、描述和行动号召', '广告投放', 'https://dify.example.com/api/v1/workflows/ad-creative', 'dify', 'public',
 '{"platform": "string", "budget": "number", "target_keywords": "array", "campaign_goal": "string"}', 'json'),

('博客文章大纲', '根据关键词和主题生成详细的博客文章大纲和要点', '内容营销', 'https://n8n.example.com/webhook/blog-outline', 'n8n', 'public',
 '{"topic": "string", "keywords": "array", "word_count": "number", "target_audience": "string"}', 'markdown');

-- Update timestamps trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_industry_kb_updated_at BEFORE UPDATE ON industry_knowledge_bases FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_personal_kb_updated_at BEFORE UPDATE ON personal_knowledge_bases FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
