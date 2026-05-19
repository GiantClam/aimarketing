ALTER TABLE "AI_MARKETING_subscription_plans"
ADD COLUMN IF NOT EXISTS stripe_price_id VARCHAR(128);

CREATE INDEX IF NOT EXISTS "AI_MARKETING_subscription_plans_stripe_price_idx"
ON "AI_MARKETING_subscription_plans"(stripe_price_id);

ALTER TABLE "AI_MARKETING_user_subscriptions"
ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(24);

ALTER TABLE "AI_MARKETING_user_subscriptions"
ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(128);

ALTER TABLE "AI_MARKETING_user_subscriptions"
ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(128);

ALTER TABLE "AI_MARKETING_user_subscriptions"
ADD COLUMN IF NOT EXISTS stripe_checkout_session_id VARCHAR(128);

CREATE INDEX IF NOT EXISTS "AI_MARKETING_user_subscriptions_provider_idx"
ON "AI_MARKETING_user_subscriptions"(payment_provider);

CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_user_subscriptions_stripe_subscription_idx"
ON "AI_MARKETING_user_subscriptions"(stripe_subscription_id);

CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_user_subscriptions_stripe_checkout_session_idx"
ON "AI_MARKETING_user_subscriptions"(stripe_checkout_session_id);

CREATE TABLE IF NOT EXISTS "AI_MARKETING_stripe_webhook_events" (
  id SERIAL PRIMARY KEY,
  stripe_event_id VARCHAR(128) NOT NULL,
  event_type VARCHAR(96) NOT NULL,
  resource_id VARCHAR(128),
  payload JSONB NOT NULL,
  processed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_stripe_webhook_events_event_idx"
ON "AI_MARKETING_stripe_webhook_events"(stripe_event_id);

CREATE INDEX IF NOT EXISTS "AI_MARKETING_stripe_webhook_events_resource_idx"
ON "AI_MARKETING_stripe_webhook_events"(resource_id);
