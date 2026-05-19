# Billing Kit Host Contract

This document defines the minimum host-project capabilities that
`modules/billing-kit` expects.

The goal is to make migration predictable: when you copy the module into a new
app, you should only need to rewire the files under `host/` plus the migration
env helpers.

## Adapter surfaces

### `host/auth.ts`

Must export:

- `requireSessionUser(request)`

Expected result:

- success: `{ user: { id, email, enterpriseId } }`
- failure: `{ response }`

The `response` object is returned directly by route handlers, so it should be a
valid framework response for the host app.

### `host/db.ts`

Must export:

- `pool`

Expected capabilities:

- `pool.query(sql, params?)`
- `pool.connect()`
- client returned from `connect()` supports:
  - `query(sql, params?)`
  - `release()`

The module relies on transaction control through SQL statements such as
`BEGIN`, `COMMIT`, and `ROLLBACK`.

### `host/enterprise.ts`

Must export:

- `type AuthUserPayload`
- `getUserAuthPayload(userId)`

Minimum user shape used by the module:

```ts
{
  id: number
  email: string
  enterpriseId: number | null
}
```

### `host/locale.ts`

Must export:

- `useI18n()`

Expected shape:

```ts
{
  locale: string
  messages: {
    billing: Record<string, string>
  }
}
```

`billing` must contain all strings used by the billing UI components.

### `host/ui.ts`

Must export these UI primitives:

- `Button`
- `Badge`
- `Card`
- `CardContent`
- `CardHeader`
- `CardTitle`

They can come from any design system as long as their React component API is
compatible with ordinary JSX usage in the billing UI.

## Database expectations

The module expects these tables to exist:

- `AI_MARKETING_user_subscriptions`
- `AI_MARKETING_credit_accounts`
- `AI_MARKETING_credit_ledger`
- `AI_MARKETING_paypal_webhook_events`
- `AI_MARKETING_stripe_webhook_events`

Apply the SQL in:

- `migrations/add-billing-subscription-schema.sql`
- `migrations/add-billing-plan-change-schema.sql`
- `migrations/add-billing-stripe-schema.sql`

## Environment expectations

The module itself reads PayPal and Stripe env vars through the host app's
process environment. Migration scripts additionally depend on host-repo helpers:

- `scripts/load-env.js`
- `scripts/get-db-connection.js`

If your target project uses a different migration setup, either:

1. keep the module SQL files and run them with your own migration tool, or
2. adapt the module's migration runner scripts.

## Framework assumptions

Current server handlers are written for Next.js route handlers and return
`NextResponse`. If the target app is not Next.js:

1. keep `core/` as-is,
2. treat `server/` as reference adapters,
3. rewrite only the thin route layer for your framework.

## Migration checklist

1. Copy `modules/billing-kit`.
2. Reimplement `host/auth.ts`, `host/db.ts`, `host/enterprise.ts`,
   `host/locale.ts`, and `host/ui.ts`.
3. Port billing message keys into the new app's i18n source.
4. Apply the billing SQL migrations.
5. Recreate payment env vars for PayPal and Stripe.
6. If not using Next.js, rewrite the files in `server/` as host-framework
   adapters and keep `core/` unchanged.

## Starter templates

See `example-host/` for copyable adapter stubs that match this contract.
