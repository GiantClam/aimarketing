CREATE TABLE IF NOT EXISTS "AI_MARKETING_subscription_plans" (
  id SERIAL PRIMARY KEY,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(80) NOT NULL,
  price_usd_cents INTEGER NOT NULL,
  monthly_credits INTEGER NOT NULL,
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  paypal_plan_id VARCHAR(128),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_subscription_plans_code_idx"
ON "AI_MARKETING_subscription_plans"(code);

CREATE INDEX IF NOT EXISTS "AI_MARKETING_subscription_plans_paypal_plan_idx"
ON "AI_MARKETING_subscription_plans"(paypal_plan_id);

CREATE TABLE IF NOT EXISTS "AI_MARKETING_user_subscriptions" (
  id SERIAL PRIMARY KEY,
  enterprise_id INTEGER REFERENCES "AI_MARKETING_enterprises"(id) ON DELETE SET NULL,
  subscribed_by_user_id INTEGER REFERENCES "AI_MARKETING_users"(id) ON DELETE SET NULL,
  plan_code VARCHAR(32) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  paypal_subscription_id VARCHAR(128),
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "AI_MARKETING_user_subscriptions_enterprise_status_idx"
ON "AI_MARKETING_user_subscriptions"(enterprise_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_user_subscriptions_paypal_subscription_idx"
ON "AI_MARKETING_user_subscriptions"(paypal_subscription_id);

CREATE TABLE IF NOT EXISTS "AI_MARKETING_credit_accounts" (
  id SERIAL PRIMARY KEY,
  account_type VARCHAR(24) NOT NULL DEFAULT 'enterprise',
  enterprise_id INTEGER REFERENCES "AI_MARKETING_enterprises"(id) ON DELETE CASCADE,
  owner_user_id INTEGER REFERENCES "AI_MARKETING_users"(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0,
  reserved_balance INTEGER NOT NULL DEFAULT 0,
  monthly_grant_balance INTEGER NOT NULL DEFAULT 0,
  purchased_balance INTEGER NOT NULL DEFAULT 0,
  period_start TIMESTAMP,
  period_end TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "AI_MARKETING_credit_accounts_enterprise_idx"
ON "AI_MARKETING_credit_accounts"(enterprise_id);

CREATE INDEX IF NOT EXISTS "AI_MARKETING_credit_accounts_owner_user_idx"
ON "AI_MARKETING_credit_accounts"(owner_user_id);

CREATE TABLE IF NOT EXISTS "AI_MARKETING_credit_ledger" (
  id SERIAL PRIMARY KEY,
  credit_account_id INTEGER NOT NULL REFERENCES "AI_MARKETING_credit_accounts"(id) ON DELETE CASCADE,
  enterprise_id INTEGER REFERENCES "AI_MARKETING_enterprises"(id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES "AI_MARKETING_users"(id) ON DELETE SET NULL,
  subscription_id INTEGER REFERENCES "AI_MARKETING_user_subscriptions"(id) ON DELETE SET NULL,
  entry_type VARCHAR(24) NOT NULL,
  feature_key VARCHAR(80),
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reserved_balance_after INTEGER NOT NULL DEFAULT 0,
  idempotency_key VARCHAR(160) NOT NULL,
  provider VARCHAR(40),
  model VARCHAR(160),
  official_cost_usd REAL,
  cost_basis_usd REAL,
  usage_payload JSONB,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_credit_ledger_account_idempotency_idx"
ON "AI_MARKETING_credit_ledger"(credit_account_id, idempotency_key);

CREATE INDEX IF NOT EXISTS "AI_MARKETING_credit_ledger_account_created_idx"
ON "AI_MARKETING_credit_ledger"(credit_account_id, created_at);

CREATE INDEX IF NOT EXISTS "AI_MARKETING_credit_ledger_user_created_idx"
ON "AI_MARKETING_credit_ledger"(user_id, created_at);

CREATE TABLE IF NOT EXISTS "AI_MARKETING_paypal_webhook_events" (
  id SERIAL PRIMARY KEY,
  paypal_event_id VARCHAR(128) NOT NULL,
  event_type VARCHAR(96) NOT NULL,
  resource_id VARCHAR(128),
  payload JSONB NOT NULL,
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_paypal_webhook_events_event_idx"
ON "AI_MARKETING_paypal_webhook_events"(paypal_event_id);

CREATE INDEX IF NOT EXISTS "AI_MARKETING_paypal_webhook_events_resource_idx"
ON "AI_MARKETING_paypal_webhook_events"(resource_id);

INSERT INTO "AI_MARKETING_subscription_plans" (
  code,
  name,
  price_usd_cents,
  monthly_credits,
  features
) VALUES
  (
    'starter',
    'Starter',
    990,
    3000,
    '{"sharedMemberLimit":2,"gptImage2":true,"maskEdit":"limited","videoGeneration":"trial"}'::jsonb
  ),
  (
    'creator',
    'Creator',
    1990,
    10000,
    '{"sharedMemberLimit":5,"gptImage2":true,"maskEdit":"standard","videoGeneration":"limited"}'::jsonb
  ),
  (
    'studio',
    'Studio',
    5990,
    35000,
    '{"sharedMemberLimit":10,"gptImage2":true,"maskEdit":"high","priorityQueue":true,"videoGeneration":"standard"}'::jsonb
  )
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  price_usd_cents = EXCLUDED.price_usd_cents,
  monthly_credits = EXCLUDED.monthly_credits,
  features = EXCLUDED.features,
  updated_at = CURRENT_TIMESTAMP;
