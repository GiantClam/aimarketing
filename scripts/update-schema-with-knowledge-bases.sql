-- Create industry knowledge bases table
CREATE TABLE IF NOT EXISTS industry_knowledge_bases (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  source VARCHAR(255),
  milvus_collection_name VARCHAR(255) NOT NULL UNIQUE,
  updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create personal knowledge bases table
CREATE TABLE IF NOT EXISTS personal_knowledge_bases (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  source VARCHAR(255),
  milvus_collection_name VARCHAR(255) NOT NULL UNIQUE,
  updated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Update templates table with new required fields
ALTER TABLE templates 
ADD COLUMN IF NOT EXISTS tags TEXT,
ADD COLUMN IF NOT EXISTS industry_knowledge_base_id INTEGER REFERENCES industry_knowledge_bases(id),
ADD COLUMN IF NOT EXISTS workflow_url TEXT,
ADD COLUMN IF NOT EXISTS workflow_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS workflow_api_key VARCHAR(500),
ADD COLUMN IF NOT EXISTS template_type VARCHAR(20) DEFAULT 'public',
ADD COLUMN IF NOT EXISTS custom_user_id INTEGER REFERENCES users(id);

-- Rename existing columns to match specification
ALTER TABLE templates 
RENAME COLUMN api_url TO workflow_url_old;
ALTER TABLE templates 
RENAME COLUMN api_key TO workflow_api_key_old;
ALTER TABLE templates 
RENAME COLUMN is_official TO template_type_old;
ALTER TABLE templates 
RENAME COLUMN created_by TO custom_user_id_old;

-- Insert default industry knowledge bases
INSERT INTO industry_knowledge_bases (name, description, source, milvus_collection_name) VALUES
('营销策略知识库', '包含各行业营销策略、案例分析和最佳实践', '行业报告和营销案例', 'marketing_strategies_kb'),
('内容创作知识库', '文案写作技巧、创意灵感和内容模板', '专业文案和创意资源', 'content_creation_kb'),
('电商运营知识库', '电商平台运营、产品推广和用户增长策略', '电商平台数据和案例', 'ecommerce_operations_kb'),
('社交媒体知识库', '社交媒体营销、用户互动和品牌建设', '社交媒体平台和案例', 'social_media_kb');

-- Insert default public templates
INSERT INTO templates (name, description, tags, category, industry_knowledge_base_id, workflow_url, workflow_id, workflow_type, template_type) VALUES
('小红书种草文案', '生成吸引人的小红书种草内容，提高产品曝光度', '["小红书", "种草", "社交媒体"]', 'social_media', 4, 'https://n8n.example.com/webhook/xiaohongshu', 'xiaohongshu_template', 'n8n', 'public'),
('产品营销邮件', '创建专业的产品推广邮件，提升转化率', '["邮件营销", "产品推广", "转化"]', 'email', 1, 'https://dify.example.com/api/workflows/email-marketing', 'email_marketing_template', 'dify', 'public'),
('电商产品描述', '生成详细的电商产品描述，突出卖点', '["电商", "产品描述", "转化"]', 'ecommerce', 3, 'https://n8n.example.com/webhook/product-desc', 'product_desc_template', 'n8n', 'public'),
('行业分析文章', '撰写深度的行业分析文章，建立专业权威', '["行业分析", "专业文章", "权威"]', 'article', 1, 'https://dify.example.com/api/workflows/industry-analysis', 'industry_analysis_template', 'dify', 'public');

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_personal_kb_user_id ON personal_knowledge_bases(user_id);
CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);
CREATE INDEX IF NOT EXISTS idx_templates_type ON templates(template_type);
CREATE INDEX IF NOT EXISTS idx_templates_industry_kb ON templates(industry_knowledge_base_id);
