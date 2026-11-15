## Context

The repository is a Next.js App Router application with public pages duplicated under unprefixed, `/en/`, and `/zh/` route trees. `middleware.ts` already adds locale prefixes for known public paths and `lib/app-url.ts` already normalizes the production host for generated URLs, but request locale, metadata, sitemap, and indexing behavior are spread across several helpers. Public pricing already imports the billing catalog, while the cost calculator and several SEO content records still contain legacy labels or internal platform vocabulary.

The implementation must preserve the existing registration, checkout, subscription, and model execution paths. The worktree also contains unrelated tracked `.cache` deletions that must remain untouched.

## Goals / Non-Goals

**Goals:**

- Establish one production URL contract for `www` plus locale-prefixed public pages.
- Keep explicit path locale authoritative and make metadata, sitemap, robots, and noindex agree.
- Make the public product story and comparison pages factual, bilingual, and tied to verified product evidence.
- Read public pricing presentation from the existing billing catalog and connect free-tool results to relevant existing routes.
- Add focused regression coverage and run lint, build, and representative page checks.

**Non-Goals:**

- Changing authentication, registration, billing APIs, plan entitlements, checkout providers, or model invocation.
- Adding new provider integrations, new workflow execution capabilities, or new competitor data sources.
- Treating concept artwork as a product screenshot or inventing unsupported performance, quota, or feature claims.
- Submitting directories, building external links, or changing deployment configuration.

## Decisions

### Canonical URL enforcement at the request boundary

Keep URL normalization in the existing middleware boundary so host and locale redirects happen before a page is rendered. Production requests to the bare host redirect to the normalized `www` host, `/` redirects to `/en/`, and known unprefixed localized public paths redirect once to the locale selected by the existing preference mechanism. Explicit path locale is passed through as the authoritative locale. Local development and non-production hosts keep their existing behavior so local testing does not redirect to production.

This is preferred over relying only on canonical tags because duplicate pages would still be served and users could see the wrong language. It is also preferred over a Next.js rewrite because the browser and crawlers must observe the canonical URL.

### One metadata construction contract

Extend the shared public metadata helpers rather than hand-editing every route. The helpers will normalize legacy title suffixes, append `AIMarketingSite` once, generate same-path language alternates, and set `openGraph.url` from the same canonical value. Auth and dashboard layouts will provide noindex metadata at the route segment boundary.

This keeps localized route files small and prevents the existing mix of `AI Marketing`, `AIMarketingSite`, and inherited title templates from creating duplicate titles.

### Sitemap derives only from localized public paths

Build sitemap entries from the existing public catalogs, but expand each eligible path into `/en` and `/zh` forms and filter out aliases and private routes. The sitemap uses the same normalized app base URL as metadata. A regression test will assert host, locale prefix, uniqueness, and private-path exclusion.

### Billing remains the source of truth

Reuse the existing billing plan reader in the public pricing and calculator presentation. Legacy calculator recommendation keys will become current catalog-oriented labels or generic workspace guidance derived from the current plans. No billing catalog values or checkout behavior will be changed by this SEO change.

### Content is data-first and evidence-bounded

Rewrite localized copy and SEO page records in their current data structures, keeping rendering components generic. Add a small public evidence block for the marketing-team page that references repository screenshots only when they are traceable to current product verification; use meaningful alt text and describe the evidence date or context. Comparison content will carry a visible checked date supplied by the page data. Internal platform enums remain available to admin and runtime screens but are translated or omitted from public surfaces.

### Tool handoffs use existing routes and query context

Add next actions to lead-tool definitions and their result/related-link rendering. Handoffs will use existing localized paths and, where useful, a source or context query parameter that the destination already understands or can safely ignore. A tool without a verified receiving route will not receive a new promise.

## Risks / Trade-offs

- [Risk] A production host redirect could affect preview deployments → [Mitigation] restrict host canonicalization to the configured production host and preserve localhost/preview behavior.
- [Risk] Cookie-based locale selection can make an unprefixed alias vary by user → [Mitigation] keep aliases out of the sitemap, redirect once to the selected prefixed path, and make the prefixed path authoritative thereafter.
- [Risk] Billing catalog changes can alter public pricing without a copy review → [Mitigation] derive numeric values from the catalog and keep feature labels generic; test that both locales expose the same plan set.
- [Risk] Existing screenshots may represent an older UI state → [Mitigation] inspect their provenance and use only verified current evidence; if an asset is not verifiable, use a text evidence block or a fresh local screenshot instead of labeling concept art as a product screenshot.
- [Risk] Public platform pages may still expose internal state through a shared component → [Mitigation] test rendered public copy for known internal tokens and leave admin/runtime components unchanged.

## Migration Plan

1. Add and validate the OpenSpec artifacts.
2. Implement routing, metadata, sitemap, robots, and noindex changes.
3. Update public copy, pricing presentation, workflow explanations, comparison content, evidence blocks, and tool handoffs.
4. Run focused regression tests, lint, production build, and representative local HTTP checks for redirects and metadata.
5. If a redirect or content regression appears, revert the public SEO change files while leaving the unrelated `.cache` worktree state untouched.
