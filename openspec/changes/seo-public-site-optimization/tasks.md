## 1. Canonical routing and locale behavior

- [x] 1.1 Add production-only bare-host canonicalization and make `/` permanently redirect to `/en/` while preserving queries.
- [x] 1.2 Make explicit `/en/` and `/zh/` path locales authoritative and verify unprefixed public aliases redirect once to a prefixed path.
- [x] 1.3 Add focused middleware and routing regression coverage for host, root, locale precedence, query preservation, and no redirect loops.

## 2. Metadata, sitemap, robots, and noindex

- [x] 2.1 Centralize public title suffix normalization, `www` canonical URLs, language alternates, and Open Graph URLs.
- [x] 2.2 Add noindex metadata at authentication and dashboard route boundaries.
- [x] 2.3 Restrict sitemap entries to canonical localized public URLs and align robots sitemap and disallow rules.
- [x] 2.4 Extend SEO regression tests for unique titles, canonical host, alternates, sitemap filtering, and private indexing directives.

## 3. Public marketing content

- [x] 3.1 Rewrite bilingual homepage hero, benefits, calls to action, and supporting copy around one marketing brief and verified capabilities.
- [x] 3.2 Rewrite public workflow directory/detail language around inputs, outputs, next steps, preview, and save boundaries; remove internal runtime and entitlement tokens.
- [x] 3.3 Rewrite the marketing-team use-case page around one brief flowing through research, copy, visuals, and team review with verifiable evidence.
- [x] 3.4 Rewrite the ChatGPT Team alternative page with dated factual comparison, audience fit, model/workflow coverage, pricing/usage boundaries, and fair-fit cases.

## 4. Pricing and free-tool continuation

- [x] 4.1 Remove retired calculator package names and derive public pricing/recommendation labels from the current billing catalog.
- [x] 4.2 Verify English and Chinese pricing show the same current plan set, prices, credits, and limits.
- [x] 4.3 Add context-aware localized next actions for content brief and SEO title results using existing workspace/tool/workflow routes.
- [x] 4.4 Add focused tests for pricing catalog consistency and tool continuation links.

## 5. Verification

- [x] 5.1 Run focused SEO, routing, pricing, and lead-tool tests.
- [x] 5.2 Run lint and the production build.
- [x] 5.3 Run representative local HTTP/page checks for `/`, `/en/`, `/zh/`, pricing, marketing-team, ChatGPT Team alternative, workflow, and tool pages; record any evidence or remaining limitations.
