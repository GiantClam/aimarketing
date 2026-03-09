-- Dify Connections table for storing Dify workflow API configurations
CREATE TABLE IF NOT EXISTS dify_connections (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  base_url TEXT NOT NULL,
  api_key VARCHAR(500),
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_dify_connections_user_id ON dify_connections(user_id);

-- Optional: Add a sample default connection for the first user (usually ID 1) if it exists
INSERT INTO dify_connections (user_id, name, base_url, api_key, is_default)
SELECT id, 'Default Dify API', 'https://api.dify.ai/v1', '', TRUE
FROM users 
WHERE id = 1
ON CONFLICT DO NOTHING;
