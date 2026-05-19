# Billing Kit

This folder groups the billing, subscription, and payment code so it can be
lifted into another project with minimal path churn.

## Layout

- `core/`: provider-agnostic billing logic plus PayPal and Stripe adapters
- `ui/`: billing page components and provider checkout buttons
- `screens/`: page-level billing screen composition
- `migrations/`: SQL files for subscription, plan-change, and Stripe schema
- `scripts/`: migration runners that execute the SQL in `migrations/`

## Compatibility in this repo

This repo keeps thin compatibility wrappers at the original paths:

- `lib/billing/*`
- `components/billing/*`
- `app/dashboard/billing/page.tsx`
- `scripts/run-billing-*.js`

Those wrappers exist so the current app, routes, and tests can keep their
imports stable while the billing code lives under one portable directory.

## Host integration points

Most project-specific dependencies are intentionally funneled through
`host/`:

- `host/auth.ts`
- `host/db.ts`
- `host/enterprise.ts`
- `host/locale.ts`
- `host/ui.ts`

When moving this module into another app, those files are the first place to
retarget. Billing-related message keys and the migration env/DB helpers still
need host-project equivalents as well.

See [HOST-CONTRACT.md](./HOST-CONTRACT.md)
for the exact adapter expectations and migration checklist.

## Migration strategy

1. Copy `modules/billing-kit`.
2. Recreate the host-project dependencies listed above.
3. Either keep compatibility wrappers or repoint imports directly to
   `modules/billing-kit/*`.
4. Run the SQL in `migrations/` or the runners in `scripts/`.

## Starter templates

If you want copyable adapter stubs instead of wiring from scratch, start with
[example-host/README.md](./example-host/README.md).
