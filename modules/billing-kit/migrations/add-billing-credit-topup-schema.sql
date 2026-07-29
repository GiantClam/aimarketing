CREATE TABLE IF NOT EXISTS "AI_MARKETING_credit_products" (
  id SERIAL PRIMARY KEY,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  credit_amount INTEGER NOT NULL CHECK (credit_amount > 0),
  price_cny_fen INTEGER NOT NULL CHECK (price_cny_fen > 0),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_credit_products_code_idx"
ON "AI_MARKETING_credit_products"(code);

INSERT INTO "AI_MARKETING_credit_products" (code, name, credit_amount, price_cny_fen, sort_order)
VALUES
  ('credits_1000', '1000 积分包', 1000, 1990, 10),
  ('credits_5000', '5000 积分包', 5000, 8990, 20),
  ('credits_15000', '15000 积分包', 15000, 24900, 30),
  ('credits_50000', '50000 积分包', 50000, 69900, 40)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  credit_amount = EXCLUDED.credit_amount,
  price_cny_fen = EXCLUDED.price_cny_fen,
  sort_order = EXCLUDED.sort_order,
  updated_at = CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "AI_MARKETING_payment_orders" (
  id SERIAL PRIMARY KEY,
  order_no VARCHAR(96) NOT NULL,
  enterprise_id INTEGER,
  user_id INTEGER NOT NULL,
  product_type VARCHAR(32) NOT NULL DEFAULT 'one_time',
  product_code VARCHAR(64) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  payment_method VARCHAR(32) NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency VARCHAR(8) NOT NULL DEFAULT 'CNY',
  credit_amount INTEGER NOT NULL CHECK (credit_amount > 0),
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  request_idempotency_key VARCHAR(160) NOT NULL,
  provider_trade_no VARCHAR(128),
  provider_payload JSONB,
  notify_received_at TIMESTAMP,
  paid_at TIMESTAMP,
  refunded_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_payment_orders_order_no_idx"
ON "AI_MARKETING_payment_orders"(order_no);

CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_payment_orders_idempotency_idx"
ON "AI_MARKETING_payment_orders"(request_idempotency_key);

CREATE INDEX IF NOT EXISTS "AI_MARKETING_payment_orders_user_idx"
ON "AI_MARKETING_payment_orders"(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS "AI_MARKETING_payment_orders_status_idx"
ON "AI_MARKETING_payment_orders"(status, expires_at);

CREATE INDEX IF NOT EXISTS "AI_MARKETING_payment_orders_provider_trade_idx"
ON "AI_MARKETING_payment_orders"(provider_trade_no);

CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_payment_orders_provider_trade_unique_idx"
ON "AI_MARKETING_payment_orders"(provider, provider_trade_no)
WHERE provider_trade_no IS NOT NULL;
