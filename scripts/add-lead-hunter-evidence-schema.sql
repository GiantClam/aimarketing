CREATE TABLE IF NOT EXISTS "AI_MARKETING_lead_hunter_evidences" (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES "AI_MARKETING_lead_hunter_conversations"(id) ON DELETE CASCADE,
  message_id INTEGER NOT NULL REFERENCES "AI_MARKETING_lead_hunter_messages"(id) ON DELETE CASCADE,
  claim TEXT NOT NULL,
  source_title TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_type VARCHAR(32) NOT NULL,
  source_provider VARCHAR(32) NOT NULL,
  extracted_by VARCHAR(32) NOT NULL,
  confidence VARCHAR(16) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "AI_MARKETING_lead_hunter_evidences_message_idx"
ON "AI_MARKETING_lead_hunter_evidences" (message_id, id);

CREATE INDEX IF NOT EXISTS "AI_MARKETING_lead_hunter_evidences_conversation_idx"
ON "AI_MARKETING_lead_hunter_evidences" (conversation_id, id);
