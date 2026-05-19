# Example Host Adapters

These files are copy-first templates for wiring `billing-kit` into another
project.

Use them when you move the module to a new codebase and want a concrete
starting point instead of rebuilding the adapter layer from scratch.

## Suggested workflow

1. Copy the files in this folder into the target project's `host/` location.
2. Replace the stubbed logic with the target app's real auth, db, locale, and
   UI wiring.
3. Keep the exported names the same so `billing-kit` internals do not need to
   change.

## Files

- `auth.example.ts`
- `db.example.ts`
- `enterprise.example.ts`
- `locale.example.ts`
- `ui.example.tsx`

These examples are intentionally minimal. They show the expected shape, not a
production-ready implementation.

