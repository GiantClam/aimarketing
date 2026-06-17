CREATE TABLE IF NOT EXISTS "AI_MARKETING_enterprise_knowledge_sources" (
  id SERIAL PRIMARY KEY,
  enterprise_id INTEGER NOT NULL REFERENCES "AI_MARKETING_enterprises"(id) ON DELETE CASCADE,
  provider_type VARCHAR(32) NOT NULL DEFAULT 'ragflow',
  name VARCHAR(255) NOT NULL,
  base_url TEXT NOT NULL,
  api_key VARCHAR(500),
  status VARCHAR(24) NOT NULL DEFAULT 'unavailable',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_checked_at TIMESTAMP,
  last_error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_enterprise_knowledge_sources_enterprise_provider_idx"
ON "AI_MARKETING_enterprise_knowledge_sources"(enterprise_id, provider_type);

CREATE INDEX IF NOT EXISTS "AI_MARKETING_enterprise_knowledge_sources_enterprise_status_idx"
ON "AI_MARKETING_enterprise_knowledge_sources"(enterprise_id, status);

CREATE TABLE IF NOT EXISTS "AI_MARKETING_enterprise_knowledge_datasets" (
  id SERIAL PRIMARY KEY,
  enterprise_id INTEGER NOT NULL REFERENCES "AI_MARKETING_enterprises"(id) ON DELETE CASCADE,
  source_id INTEGER NOT NULL REFERENCES "AI_MARKETING_enterprise_knowledge_sources"(id) ON DELETE CASCADE,
  provider_dataset_id VARCHAR(255),
  name VARCHAR(255) NOT NULL,
  category VARCHAR(32) NOT NULL DEFAULT 'general',
  priority INTEGER NOT NULL DEFAULT 100,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  chunking_config JSONB,
  retrieval_config JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_enterprise_knowledge_datasets_source_provider_idx"
ON "AI_MARKETING_enterprise_knowledge_datasets"(source_id, provider_dataset_id);

CREATE INDEX IF NOT EXISTS "AI_MARKETING_enterprise_knowledge_datasets_enterprise_category_idx"
ON "AI_MARKETING_enterprise_knowledge_datasets"(enterprise_id, category);

CREATE TABLE IF NOT EXISTS "AI_MARKETING_enterprise_knowledge_documents" (
  id SERIAL PRIMARY KEY,
  enterprise_id INTEGER NOT NULL REFERENCES "AI_MARKETING_enterprises"(id) ON DELETE CASCADE,
  source_id INTEGER REFERENCES "AI_MARKETING_enterprise_knowledge_sources"(id) ON DELETE SET NULL,
  dataset_id INTEGER REFERENCES "AI_MARKETING_enterprise_knowledge_datasets"(id) ON DELETE SET NULL,
  provider_document_id VARCHAR(255),
  name VARCHAR(255) NOT NULL,
  source_type VARCHAR(24) NOT NULL,
  source_url TEXT,
  category VARCHAR(32) NOT NULL DEFAULT 'general',
  status VARCHAR(24) NOT NULL DEFAULT 'uploaded',
  chunk_count INTEGER NOT NULL DEFAULT 0,
  parse_summary JSONB,
  chunking_override JSONB,
  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "AI_MARKETING_enterprise_knowledge_documents_enterprise_status_idx"
ON "AI_MARKETING_enterprise_knowledge_documents"(enterprise_id, status);

CREATE INDEX IF NOT EXISTS "AI_MARKETING_enterprise_knowledge_documents_dataset_updated_idx"
ON "AI_MARKETING_enterprise_knowledge_documents"(dataset_id, updated_at);

CREATE TABLE IF NOT EXISTS "AI_MARKETING_enterprise_knowledge_chunks" (
  id SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES "AI_MARKETING_enterprise_knowledge_documents"(id) ON DELETE CASCADE,
  provider_chunk_id VARCHAR(255),
  chunk_index INTEGER NOT NULL DEFAULT 0,
  content TEXT,
  excerpt TEXT,
  keywords JSONB,
  questions JSONB,
  tags JSONB,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  edited BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_enterprise_knowledge_chunks_document_chunk_idx"
ON "AI_MARKETING_enterprise_knowledge_chunks"(document_id, chunk_index);

CREATE INDEX IF NOT EXISTS "AI_MARKETING_enterprise_knowledge_chunks_document_updated_idx"
ON "AI_MARKETING_enterprise_knowledge_chunks"(document_id, updated_at);

CREATE TABLE IF NOT EXISTS "AI_MARKETING_enterprise_knowledge_bindings" (
  id SERIAL PRIMARY KEY,
  dataset_id INTEGER NOT NULL REFERENCES "AI_MARKETING_enterprise_knowledge_datasets"(id) ON DELETE CASCADE,
  target_type VARCHAR(48) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_enterprise_knowledge_bindings_dataset_target_idx"
ON "AI_MARKETING_enterprise_knowledge_bindings"(dataset_id, target_type);
