CREATE TABLE IF NOT EXISTS "AI_MARKETING_enterprise_dify_bindings" (
  id SERIAL PRIMARY KEY,
  enterprise_id INTEGER NOT NULL REFERENCES "AI_MARKETING_enterprises"(id) ON DELETE CASCADE,
  base_url TEXT NOT NULL,
  api_key VARCHAR(500),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_enterprise_dify_bindings_enterprise_idx"
ON "AI_MARKETING_enterprise_dify_bindings"(enterprise_id);

CREATE TABLE IF NOT EXISTS "AI_MARKETING_enterprise_dify_datasets" (
  id SERIAL PRIMARY KEY,
  binding_id INTEGER NOT NULL REFERENCES "AI_MARKETING_enterprise_dify_bindings"(id) ON DELETE CASCADE,
  dataset_id VARCHAR(255) NOT NULL,
  dataset_name VARCHAR(255) NOT NULL,
  scope VARCHAR(32) NOT NULL DEFAULT 'brand',
  priority INTEGER NOT NULL DEFAULT 100,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_enterprise_dify_datasets_binding_dataset_idx"
ON "AI_MARKETING_enterprise_dify_datasets"(binding_id, dataset_id);

CREATE TABLE IF NOT EXISTS "AI_MARKETING_enterprise_dify_advisor_configs" (
  id SERIAL PRIMARY KEY,
  enterprise_id INTEGER NOT NULL REFERENCES "AI_MARKETING_enterprises"(id) ON DELETE CASCADE,
  advisor_type VARCHAR(32) NOT NULL,
  base_url TEXT NOT NULL,
  api_key VARCHAR(500),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_enterprise_dify_advisors_enterprise_type_idx"
ON "AI_MARKETING_enterprise_dify_advisor_configs"(enterprise_id, advisor_type);
