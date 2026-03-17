-- Database migration to add templates functionality with prefixed tables
CREATE TABLE IF NOT EXISTS "AI_MARKETING_templates" (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100) NOT NULL,
  is_official BOOLEAN DEFAULT false,
  created_by INTEGER REFERENCES "AI_MARKETING_users"(id),
  workflow_type VARCHAR(20) NOT NULL CHECK (workflow_type IN ('n8n', 'dify')),
  api_url TEXT NOT NULL,
  api_key VARCHAR(500),
  workflow_id VARCHAR(255),
  input_fields TEXT,
  output_format VARCHAR(50) DEFAULT 'text' CHECK (output_format IN ('text', 'html', 'markdown')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "AI_MARKETING_template_usage" (
  id SERIAL PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES "AI_MARKETING_templates"(id),
  user_id INTEGER NOT NULL REFERENCES "AI_MARKETING_users"(id),
  conversation_id INTEGER REFERENCES "AI_MARKETING_conversations"(id),
  input_data TEXT,
  output_data TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  execution_time INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "AI_MARKETING_templates_category_idx" ON "AI_MARKETING_templates"(category);
CREATE INDEX IF NOT EXISTS "AI_MARKETING_templates_official_idx" ON "AI_MARKETING_templates"(is_official);
CREATE INDEX IF NOT EXISTS "AI_MARKETING_templates_created_by_idx" ON "AI_MARKETING_templates"(created_by);
CREATE INDEX IF NOT EXISTS "AI_MARKETING_template_usage_template_id_idx" ON "AI_MARKETING_template_usage"(template_id);
CREATE INDEX IF NOT EXISTS "AI_MARKETING_template_usage_user_id_idx" ON "AI_MARKETING_template_usage"(user_id);

INSERT INTO "AI_MARKETING_templates" (name, description, category, is_official, workflow_type, api_url, input_fields) VALUES
('社交媒体帖子生成', '生成吸引人的社交媒体内容，适用于微博、朋友圈等平台', 'social_media', true, 'dify', '/api/workflows/social-media', '{"topic": "string", "tone": "string", "platform": "string"}'),
('产品营销邮件', '创建专业的产品推广邮件模板', 'email', true, 'dify', '/api/workflows/marketing-email', '{"product": "string", "audience": "string", "cta": "string"}'),
('SEO优化文章', '生成搜索引擎友好的长篇内容', 'article', true, 'n8n', '/api/workflows/seo-article', '{"keyword": "string", "length": "number", "style": "string"}'),
('电商产品描述', '为电商平台创建吸引人的产品描述', 'ecommerce', true, 'dify', '/api/workflows/product-description', '{"product": "string", "features": "array", "target_audience": "string"}');
