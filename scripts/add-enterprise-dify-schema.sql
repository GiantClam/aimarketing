DO $$
BEGIN
  IF to_regclass('public.enterprise_dify_bindings') IS NOT NULL
    AND to_regclass('public.aimarketing_enterprise_dify_bindings') IS NULL THEN
    ALTER TABLE enterprise_dify_bindings RENAME TO aimarketing_enterprise_dify_bindings;
  END IF;

  IF to_regclass('public.enterprise_dify_datasets') IS NOT NULL
    AND to_regclass('public.aimarketing_enterprise_dify_datasets') IS NULL THEN
    ALTER TABLE enterprise_dify_datasets RENAME TO aimarketing_enterprise_dify_datasets;
  END IF;

  IF to_regclass('public.enterprise_dify_bindings_enterprise_idx') IS NOT NULL
    AND to_regclass('public.aimarketing_enterprise_dify_bindings_enterprise_idx') IS NULL THEN
    ALTER INDEX enterprise_dify_bindings_enterprise_idx RENAME TO aimarketing_enterprise_dify_bindings_enterprise_idx;
  END IF;

  IF to_regclass('public.enterprise_dify_datasets_binding_dataset_idx') IS NOT NULL
    AND to_regclass('public.aimarketing_enterprise_dify_datasets_binding_dataset_idx') IS NULL THEN
    ALTER INDEX enterprise_dify_datasets_binding_dataset_idx RENAME TO aimarketing_enterprise_dify_datasets_binding_dataset_idx;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS aimarketing_enterprise_dify_bindings (
  id SERIAL PRIMARY KEY,
  enterprise_id INTEGER NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
  base_url TEXT NOT NULL,
  api_key VARCHAR(500),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS aimarketing_enterprise_dify_bindings_enterprise_idx
ON aimarketing_enterprise_dify_bindings(enterprise_id);

CREATE TABLE IF NOT EXISTS aimarketing_enterprise_dify_datasets (
  id SERIAL PRIMARY KEY,
  binding_id INTEGER NOT NULL REFERENCES aimarketing_enterprise_dify_bindings(id) ON DELETE CASCADE,
  dataset_id VARCHAR(255) NOT NULL,
  dataset_name VARCHAR(255) NOT NULL,
  scope VARCHAR(32) NOT NULL DEFAULT 'brand',
  priority INTEGER NOT NULL DEFAULT 100,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS aimarketing_enterprise_dify_datasets_binding_dataset_idx
ON aimarketing_enterprise_dify_datasets(binding_id, dataset_id);

CREATE TABLE IF NOT EXISTS aimarketing_enterprise_dify_advisor_configs (
  id SERIAL PRIMARY KEY,
  enterprise_id INTEGER NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
  advisor_type VARCHAR(32) NOT NULL,
  base_url TEXT NOT NULL,
  api_key VARCHAR(500),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS aimarketing_enterprise_dify_advisors_enterprise_type_idx
ON aimarketing_enterprise_dify_advisor_configs(enterprise_id, advisor_type);
