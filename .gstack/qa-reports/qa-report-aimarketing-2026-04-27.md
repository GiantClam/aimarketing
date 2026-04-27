# QA Report: aimarketing remediation acceptance

- Date: 2026-04-27
- Base URL: http://localhost:3017
- Health score: 100
- Checks: 16/16 passed

## Static and regression checks
- [x] Targeted ESLint passed for changed files.
- [x] LSP diagnostics returned 0 errors for changed AI chat, settings, Dify chat, member-management route, and web-search tool files.
- [x] `pnpm test:ai-entry:chat-interaction` passed: 3/3 tests.
- [x] `pnpm test:ai-entry:provider-routing` passed: 8/8 tests.
- [x] Full `pnpm exec tsc --noEmit` was attempted earlier; it is still blocked by pre-existing writer/image-assistant/test-stub errors outside this remediation.
- [x] Full `pnpm lint` was attempted earlier; it is still blocked by pre-existing lint errors outside this remediation.

## Runtime acceptance checks
- [x] Demo auth endpoint returned 200 on the current app.
- [x] `/api/auth/profile` returned active admin demo user.
- [x] `/api/enterprise/members` returned 200 and member rows.
- [x] `PATCH /api/enterprise/members/1` with `suspend` returned `400 cannot_modify_self`, proving the self-protection branch without mutating data.
- [x] Settings page rendered authenticated admin state.
- [x] Settings member-management controls are visible: reset password, suspend, remove.
- [x] Settings page no longer contains `仅企业管理员`, `Only enterprise admins`, or `admins only` identity-hint wording.
- [x] Yellow labels use filled `bg-primary text-primary-foreground` badge styling.
- [x] AI chat page renders and exposes an attachment input.
- [x] AI chat text attachment selection renders a visible attachment chip.
- [x] Advisor page renders and exposes an attachment input.
- [x] Advisor attachment selection shows the unsupported-upload prompt.
- [x] `SERPER_API_KEY` present exposes `web_search`; no provider key hides it.
- [x] Markdown link renderers include `target="_blank" rel="noopener noreferrer"`.

## Screenshots
- `.gstack/qa-reports/screenshots/settings-member-section-check.png`
- `.gstack/qa-reports/screenshots/ai-entry-attachment-selected-rerun.png`
- `.gstack/qa-reports/screenshots/advisor-unsupported-attachment-rerun.png`

## Console and environment notes
- No remediation-specific browser error was reproduced after waiting for page readiness.
- The first browser pass produced `Failed to fetch` console noise because the script navigated away while first-time Next.js dev compilation was still serving slow API requests. The rerun waited for page-ready controls and passed.
- The local Dify/advisor APIs emit DB retry logs in dev, but the tested advisor page recovered and rendered.
- `localhost:3000` and `localhost:3001` were occupied by other projects, so this app was tested on `localhost:3017`.

## Issues
- None found in the tested remediation paths.
