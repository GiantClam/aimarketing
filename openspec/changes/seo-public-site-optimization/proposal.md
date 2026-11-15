## Why

The public site already has localized routes and SEO helpers, but they do not form one consistent contract: the root and unprefixed public URLs can be rendered through request state, metadata still mixes `AI Marketing` and `AIMarketingSite`, and the sitemap, redirects, and noindex rules can drift apart. Public copy also exposes internal platform language, legacy pricing labels, and generic calls to action that make the product promise harder to verify.

This change makes the public site search-ready before directory submission or link building. It keeps registration, billing behavior, and model execution unchanged while making public URLs, content, pricing presentation, and tool-to-workspace paths consistent and testable.

## What Changes

- Canonicalize production public URLs to the `www` host and locale-prefixed `/en/` and `/zh/` paths, with `/` using `/en/` as the x-default entry.
- Make localized public pages render according to their path locale, generate consistent canonical and `hreflang` metadata, and keep only canonical URLs in the sitemap.
- Add coordinated `noindex` behavior for authentication and dashboard pages while preserving robots exclusions for private and API paths.
- Normalize public title branding to one `AIMarketingSite` suffix and set the English homepage title to `AI Workspace for Marketing Teams | AIMarketingSite`.
- Rewrite homepage, workflow, marketing-team, and ChatGPT Team alternative messaging around verified user outcomes and explicit inputs, outputs, preview, save, and next-step boundaries.
- Remove internal runtime and entitlement terms from public marketing surfaces without changing internal platform or administration screens.
- Make the public pricing grid and cost calculator read current billing catalog values and remove legacy plan names.
- Add tool-specific next actions from content brief and SEO title flows into the localized workspace or related workflow pages.
- Add regression coverage for URL normalization, locale routing, metadata, sitemap and robots alignment, noindex, pricing data, and public funnel links.

## Capabilities

### New Capabilities

- `public-seo-routing`: Canonical host and locale redirects, localized metadata, sitemap inclusion, robots rules, and noindex behavior for private surfaces.
- `public-marketing-pages`: Verified bilingual homepage, workflow, marketing-team, and ChatGPT Team alternative messaging with factual comparison boundaries and evidence links.
- `public-pricing-and-tool-funnel`: Billing-catalog-backed public pricing and cost presentation plus context-aware next actions from free tools into the workspace.

### Modified Capabilities

None. No existing OpenSpec capability requirements are present under `openspec/specs/`; these contracts introduce the first public SEO capability specs for this repository.

## Impact

- Affected routing and metadata: `middleware.ts`, `app/layout.tsx`, auth and dashboard layouts, `app/robots.ts`, `app/sitemap.ts`, `lib/app-url.ts`, `lib/i18n/routing.ts`, and SEO metadata helpers.
- Affected public UI and copy: homepage, pricing, workflow directory/detail pages, SEO landing-page data, cost calculator, and lead-tool public pages in `app/`, `components/`, `lib/i18n/`, `lib/seo/`, and `lib/lead-tools/`.
- Affected verification: focused unit/regression tests, lint, production build, and representative local page/redirect checks.
- Billing is read-only from the public presentation layer; registration, checkout, subscription APIs, and model invocation paths are out of scope.
- Existing unrelated `.cache` deletions in the worktree remain untouched.
