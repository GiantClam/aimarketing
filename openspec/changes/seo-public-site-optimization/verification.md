# Production verification — 2026-11-21

## Verified implementation

- Code commit: `3c29ca0f58a14d24ddb4da4fa93118b7841b8059`.
- Production Vercel project: `v0-aimarketing`.
- Deployment: `dpl_FZQXhLiDzwAkBcWMgCxHxuoSWunt`, READY, with both production domains assigned.
- GitHub Vercel status and `writer-new-features` check: success.
- The unused `aimarketing` Vercel project has no Git connection and no longer creates a failing duplicate deployment check.

## Fixes and local verification

- Homepage props previously serialized complete registry records, including `existing_runtime`, configuration objects, provider notes, and unused implementation descriptions. The client now receives an explicit five-field public projection for the four displayed capability cards. Provider chips were removed and card summaries describe customer tasks in both languages.
- The regression test calls both real homepage factories and inspects their serialized props. It failed against the old implementation, then passed after the projection change; entry links and localization remain covered.
- Focused SEO, middleware, public-copy, lead-tool, and homepage tests: **39 passed, 0 failed**.
- TypeScript, ESLint, strict OpenSpec validation, and `git diff --check`: passed.
- Production build: Next.js 15.5.29, **428/428** static pages generated.
- Local production HTTP responses for `/en` and `/zh`: 200; no registry configuration or provider identifiers in the complete response.
- Root `pnpm audit` (including development dependencies): **0 vulnerabilities**.
- Root `npm audit --package-lock-only` (including development dependencies): **0 vulnerabilities**.
- npm lockfile was regenerated because Docker builds still consume it; critical runtime SDK/database versions are pinned to the locally verified pnpm versions. `npm ci --dry-run --ignore-scripts --legacy-peer-deps` and pnpm frozen-lockfile validation passed.

## Production HTTP acceptance

- All **184 sitemap URLs plus two localized homepages** were fetched after deployment: **186/186 HTTP 200**, no unexpected redirects, canonical equals the requested URL, and exactly one `AIMarketingSite` title suffix.
- Full HTML, including RSC data, contains none of the checked internal/retired terms: `existing_runtime`, `entitlement`, `accessModel`, `enterprise_permission`, `copywriting_generation`, `Generic AI workspace`, `Lifetime Basic`, `Team Pro`, `BYOK workspace`. Whole-word matching excludes ordinary phrases such as “small-team production”.
- Both homepages reference the verified deployment and contain no `defaultConfig`, `bindingOptions`, or provider/implementation names from the former registry props.
- English homepage title: `AI Workspace for Marketing Teams | AIMarketingSite`.
- Chinese homepage title: `面向营销团队的 AI 工作台 | AIMarketingSite`.
- The sitemap contains unique `https://www.aimarketingsite.com/en/...` and `/zh/...` URLs only; private routes are excluded.
- `/login`, `/register`, `/forgot-password`, `/reset-password`, and `/verify-email`: 200 with `noindex, nofollow`. Robots retains private-route exclusions and points to the canonical sitemap.
- `www` root returns 301 to `/en`, even with a Chinese locale cookie, and preserves its query string.
- Unprefixed `/pricing` with a Chinese locale cookie returns 301 to `/zh/pricing`, preserving queries. Explicit `/en/pricing` and `/zh/pricing` remain 200 with an opposite-language cookie.
- The Vercel domain redirect for `aimarketingsite.com` was explicitly set to `www.aimarketingsite.com` with **301**, replacing its default 307. Verified `/zh/pricing?seo-check=1` keeps both language and query. Root redirect chains terminate at the English homepage without loops.

## Remaining independent security work

GitHub's live open-alert inventory no longer includes either root lockfile. **184 alerts remain** in separate package manifests:

- `zola-reference/package-lock.json`: 116.
- `infra/cloudflare/opencode-runner/package-lock.json`: 34.
- `infra/cloudflare/dashi-ppt-smoke/package-lock.json`: 33.
- `infra/railway/ppt-master-worker/package-lock.json`: 1.

Those packages were not upgraded or deployed by this public SEO change. Root dependency audit results must not be described as a clean audit of the entire repository. Registration, billing, and model invocation logic was not edited; no paid provider or payment end-to-end acceptance is claimed.
