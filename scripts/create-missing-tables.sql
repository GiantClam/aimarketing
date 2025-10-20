-- Create templates table
CREATE TABLE IF NOT EXISTS templates (
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
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (industry_kb_id) REFERENCES industry_knowledge_bases(id) ON DELETE SET NULL
);

-- Create industry knowledge bases table
CREATE TABLE IF NOT EXISTS industry_knowledge_bases (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    description TEXT,
    milvus_collection_name TEXT NOT NULL UNIQUE,
    source_url TEXT,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create personal knowledge bases table
CREATE TABLE IF NOT EXISTS personal_knowledge_bases (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name TEXT NOT NULL,
    description TEXT,
    milvus_collection_name TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    source_info JSONB DEFAULT '{}',
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Insert default industry knowledge bases
INSERT INTO industry_knowledge_bases (name, description, milvus_collection_name, source_url) VALUES
('科技行业知识库', '包含最新科技趋势、产品发布、技术分析等内容', 'tech_industry_kb', 'https://techcrunch.com'),
('金融行业知识库', '金融市场分析、投资策略、经济趋势等专业内容', 'finance_industry_kb', 'https://bloomberg.com'),
('电商行业知识库', '电商运营、营销策略、用户行为分析等实用知识', 'ecommerce_industry_kb', 'https://shopify.com/blog'),
('教育行业知识库', '在线教育、学习方法、教育技术等相关资源', 'education_industry_kb', 'https://edutopia.org'),
('医疗健康知识库', '医疗资讯、健康管理、医疗技术发展等专业内容', 'healthcare_industry_kb', 'https://medscape.com')
ON CONFLICT (milvus_collection_name) DO NOTHING;

-- Insert default templates
INSERT INTO templates (name, description, category, workflow_url, workflow_id, workflow_api_key, workflow_type, template_type, prompt, tags, industry_kb_id) VALUES
('科技产品发布文案', '为科技产品发布创建专业的营销文案，突出产品特色和技术优势', '产品营销', 'https://demo-n8n.com/webhook/tech-product', 'tech_product_launch', 'demo_api_key_123', 'n8n', 'public', '请为我们的新科技产品创建一份发布文案，重点突出：1. 产品的核心功能 2. 技术创新点 3. 用户价值 4. 市场定位', ARRAY['科技', '产品发布', '营销文案'], (SELECT id FROM industry_knowledge_bases WHERE milvus_collection_name = 'tech_industry_kb')),

('金融投资分析报告', '生成专业的金融投资分析报告，包含市场趋势和投资建议', '金融分析', 'https://demo-dify.com/api/workflows/finance-analysis', 'finance_analysis_v1', 'dify_key_456', 'dify', 'public', '基于当前市场数据，生成一份投资分析报告，包括：1. 市场概况 2. 风险评估 3. 投资机会 4. 建议策略', ARRAY['金融', '投资', '分析报告'], (SELECT id FROM industry_knowledge_bases WHERE milvus_collection_name = 'finance_industry_kb')),

('电商促销活动文案', '为电商平台创建吸引人的促销活动文案和营销内容', '电商营销', 'https://demo-n8n.com/webhook/ecommerce-promo', 'ecommerce_promo_gen', 'n8n_key_789', 'n8n', 'public', '为即将到来的促销活动创建营销文案：1. 活动主题设计 2. 优惠信息展示 3. 紧迫感营造 4. 行动号召', ARRAY['电商', '促销', '营销活动'], (SELECT id FROM industry_knowledge_bases WHERE milvus_collection_name = 'ecommerce_industry_kb')),

('在线课程推广内容', '为在线教育课程创建推广文案和课程介绍', '教育培训', 'https://demo-dify.com/api/workflows/education-content', 'edu_course_promo', 'dify_edu_key', 'dify', 'public', '为在线课程创建推广内容：1. 课程价值介绍 2. 学习成果展示 3. 讲师资质说明 4. 学员评价展示', ARRAY['教育', '在线课程', '推广'], (SELECT id FROM industry_knowledge_bases WHERE milvus_collection_name = 'education_industry_kb')),

('健康科普文章', '创建专业的健康科普文章，传播正确的健康知识', '医疗健康', 'https://demo-n8n.com/webhook/health-content', 'health_article_gen', 'health_api_key', 'n8n', 'public', '创建一篇健康科普文章：1. 选择健康话题 2. 科学依据支撑 3. 通俗易懂表达 4. 实用建议提供', ARRAY['健康', '科普', '医疗'], (SELECT id FROM industry_knowledge_bases WHERE milvus_collection_name = 'healthcare_industry_kb'))
ON CONFLICT DO NOTHING;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
CREATE INDEX IF NOT EXISTS idx_templates_user_id ON templates(user_id);
CREATE INDEX IF NOT EXISTS idx_templates_template_type ON templates(template_type);
CREATE INDEX IF NOT EXISTS idx_templates_is_active ON templates(is_active);
CREATE INDEX IF NOT EXISTS idx_personal_kb_user_id ON personal_knowledge_bases(user_id);
