CREATE TABLE IF NOT EXISTS "AI_MARKETING_password_reset_tokens" (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES "AI_MARKETING_users"(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  requested_ip VARCHAR(64),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_password_reset_tokens_token_hash_idx"
  ON "AI_MARKETING_password_reset_tokens"(token_hash);
