-- Website Generation Schema

-- Templates table for industry-specific HTML/Tailwind skeletons
CREATE TABLE IF NOT EXISTS web_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  industry TEXT NOT NULL,
  content TEXT NOT NULL, -- HTML/Tailwind skeleton
  embedding VECTOR(1536), -- For pgvector similarity search
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for industry tags
CREATE INDEX IF NOT EXISTS idx_web_templates_industry ON web_templates(industry);

-- Sites table for metadata of generated sites
CREATE TABLE IF NOT EXISTS web_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT UNIQUE NOT NULL,
  project_name TEXT NOT NULL,
  deployment_url TEXT,
  html_content TEXT,
  assets JSONB, -- List of assets generated
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
