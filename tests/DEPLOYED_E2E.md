# Deployed Environment E2E

This suite runs browser regression checks against a deployed `aimarketing` environment.
It is designed for the current production posture:

- Website generation is disabled
- Video generation is disabled
- Dify advisor entry should remain hidden for accounts without Dify config

## Coverage

- Public homepage and login page
- Unauthenticated dashboard redirect
- Admin registration or admin login
- Enterprise settings visibility
- Feature gating on dashboard
- Disabled website/video routes redirect
- Disabled website/video APIs return `410 Feature disabled`
- Dify availability returns `hasAny=false` for fresh accounts
- Member join, approval, permission save, and post-approval login

## Run

```bash
python tests/deployed-e2e.py --base-url https://your-app.vercel.app
```

Use existing accounts if you want to avoid creating new enterprise data:

```bash
python tests/deployed-e2e.py \
  --base-url https://your-app.vercel.app \
  --admin-email qa-admin@example.com \
  --admin-password 'your-password'
```

## Options

- `--base-url`: deployed target URL
- `--admin-email` / `--admin-password`: reuse an existing admin account
- `--member-email` / `--member-password`: reuse an existing member account
- `--skip-member-flow`: skip member join and approval checks
- `--artifact-dir`: screenshot output directory for failures
- `--headed`: run browser in headed mode

## Output

The script prints a JSON summary between:

- `DEPLOYED_E2E_SUMMARY_START`
- `DEPLOYED_E2E_SUMMARY_END`

Each step is marked as:

- `passed`
- `failed`

Failure screenshots are written to `tests/screenshots/deployed/`.

## Production Notes

1. If you do not pass existing account credentials, the script creates new test accounts.
2. The script does not auto-clean database rows. Cleanup should be handled separately.
3. The script intentionally checks disabled website/video APIs; expected `410` responses are not treated as console failures.
