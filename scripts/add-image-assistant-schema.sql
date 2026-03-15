CREATE TABLE IF NOT EXISTS image_design_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enterprise_id INTEGER REFERENCES enterprises(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  current_mode VARCHAR(16) NOT NULL DEFAULT 'chat',
  current_version_id INTEGER,
  current_canvas_document_id INTEGER,
  cover_asset_id INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS image_design_messages (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES image_design_sessions(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  message_type VARCHAR(32) NOT NULL DEFAULT 'prompt',
  content TEXT NOT NULL,
  task_type VARCHAR(32),
  request_payload JSONB,
  response_payload JSONB,
  created_version_id INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS image_design_assets (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES image_design_sessions(id) ON DELETE SET NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_type VARCHAR(32) NOT NULL,
  reference_role VARCHAR(32),
  storage_provider VARCHAR(32) NOT NULL DEFAULT 'r2',
  storage_key TEXT NOT NULL UNIQUE,
  public_url TEXT,
  mime_type VARCHAR(100) NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  width INTEGER,
  height INTEGER,
  sha256 VARCHAR(64),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  meta JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS image_design_canvas_documents (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES image_design_sessions(id) ON DELETE CASCADE,
  base_version_id INTEGER,
  width INTEGER NOT NULL DEFAULT 1080,
  height INTEGER NOT NULL DEFAULT 1080,
  background_asset_id INTEGER,
  revision INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  last_saved_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS image_design_versions (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES image_design_sessions(id) ON DELETE CASCADE,
  parent_version_id INTEGER,
  source_message_id INTEGER,
  version_kind VARCHAR(32) NOT NULL,
  branch_key VARCHAR(64),
  provider VARCHAR(32),
  model VARCHAR(128),
  prompt_text TEXT,
  snapshot_asset_id INTEGER,
  mask_asset_id INTEGER,
  selected_candidate_id INTEGER,
  canvas_document_id INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'ready',
  meta JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS image_design_version_candidates (
  id SERIAL PRIMARY KEY,
  version_id INTEGER NOT NULL REFERENCES image_design_versions(id) ON DELETE CASCADE,
  asset_id INTEGER NOT NULL REFERENCES image_design_assets(id) ON DELETE CASCADE,
  candidate_index INTEGER NOT NULL,
  is_selected BOOLEAN NOT NULL DEFAULT FALSE,
  score INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS image_design_canvas_layers (
  id SERIAL PRIMARY KEY,
  canvas_document_id INTEGER NOT NULL REFERENCES image_design_canvas_documents(id) ON DELETE CASCADE,
  layer_type VARCHAR(32) NOT NULL,
  name VARCHAR(255) NOT NULL,
  z_index INTEGER NOT NULL DEFAULT 0,
  visible BOOLEAN NOT NULL DEFAULT TRUE,
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  transform JSONB NOT NULL,
  style JSONB,
  content JSONB,
  asset_id INTEGER REFERENCES image_design_assets(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS image_design_masks (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES image_design_sessions(id) ON DELETE CASCADE,
  canvas_document_id INTEGER REFERENCES image_design_canvas_documents(id) ON DELETE SET NULL,
  version_id INTEGER REFERENCES image_design_versions(id) ON DELETE SET NULL,
  mask_type VARCHAR(32) NOT NULL,
  bounds JSONB NOT NULL,
  geometry JSONB,
  mask_asset_id INTEGER REFERENCES image_design_assets(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS image_design_exports (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES image_design_sessions(id) ON DELETE CASCADE,
  version_id INTEGER REFERENCES image_design_versions(id) ON DELETE SET NULL,
  canvas_document_id INTEGER REFERENCES image_design_canvas_documents(id) ON DELETE SET NULL,
  asset_id INTEGER NOT NULL REFERENCES image_design_assets(id) ON DELETE CASCADE,
  format VARCHAR(16) NOT NULL,
  size_preset VARCHAR(16) NOT NULL,
  transparent_background BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS image_design_version_candidate_unique_idx
ON image_design_version_candidates (version_id, candidate_index);

CREATE INDEX IF NOT EXISTS image_design_sessions_user_updated_idx
ON image_design_sessions (user_id, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS image_design_messages_session_created_idx
ON image_design_messages (session_id, created_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS image_design_assets_session_created_idx
ON image_design_assets (session_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS image_design_versions_session_created_idx
ON image_design_versions (session_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS image_design_canvas_layers_document_z_idx
ON image_design_canvas_layers (canvas_document_id, z_index ASC, id ASC);
