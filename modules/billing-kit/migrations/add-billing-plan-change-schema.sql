ALTER TABLE "AI_MARKETING_user_subscriptions"
ADD COLUMN IF NOT EXISTS next_plan_code VARCHAR(32);

CREATE INDEX IF NOT EXISTS "AI_MARKETING_user_subscriptions_next_plan_idx"
ON "AI_MARKETING_user_subscriptions"(next_plan_code);
