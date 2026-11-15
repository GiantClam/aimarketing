## Purpose

This capability gives every indexable public page one stable, language-specific URL contract so search engines and users see the same canonical host, locale, metadata, sitemap entries, and indexing policy.

## ADDED Requirements

### Requirement: Public URLs use the production www host and locale prefixes

The public site MUST use `https://www.aimarketingsite.com/en/...` and `https://www.aimarketingsite.com/zh/...` as canonical indexable URL forms. In production, the bare production host and unprefixed localized public paths MUST permanently redirect to the corresponding canonical form while preserving the path meaning and query string.

#### Scenario: Bare production host is requested
- **WHEN** a user requests an indexable public path on `https://aimarketingsite.com`
- **THEN** the response permanently redirects to the same path on `https://www.aimarketingsite.com`

#### Scenario: Root path is requested
- **WHEN** a user requests `https://www.aimarketingsite.com/`
- **THEN** the response permanently redirects to `https://www.aimarketingsite.com/en/` without redirecting back to `/`

#### Scenario: Unprefixed localized public path is requested
- **WHEN** a user requests an unprefixed path such as `/pricing` or `/tools/content-brief-generator`
- **THEN** the response permanently redirects to exactly one `/en/...` or `/zh/...` path selected by the existing locale preference, defaulting to `/en/...`, and preserves the query string

### Requirement: Path locale controls localized rendering

An explicit `/en/` or `/zh/` prefix MUST take precedence over cookies, headers, or other request language preferences. A canonical localized URL MUST render content, links, metadata, and structured data for its path locale, and following a canonical localized URL MUST NOT trigger another locale redirect.

#### Scenario: English path is requested with a Chinese preference
- **WHEN** a user requests `/en/pricing` while a Chinese locale cookie or header is present
- **THEN** the page renders English content and remains at `/en/pricing`

#### Scenario: Chinese path is requested with an English preference
- **WHEN** a user requests `/zh/pricing` while an English locale cookie or header is present
- **THEN** the page renders Chinese content and remains at `/zh/pricing`

### Requirement: Public metadata exposes one canonical and language alternates

Every indexable localized public page MUST emit an absolute `www` canonical URL for its own language and absolute `en`, `zh`, and `x-default` alternates for the equivalent page where that equivalent exists. Public titles MUST contain the `AIMarketingSite` brand suffix at most once.

#### Scenario: English public page emits metadata
- **WHEN** a crawler requests an indexable English page
- **THEN** metadata contains a canonical ending in `/en/...`, an English alternate, a Chinese alternate, and an `x-default` alternate, all on the `www` host

#### Scenario: Page title already contains a brand suffix
- **WHEN** a public page title is assembled from localized content that includes a legacy brand suffix
- **THEN** the emitted title contains only one `AIMarketingSite` suffix

### Requirement: Sitemap contains only canonical public URLs

The sitemap MUST contain only absolute `www` URLs for indexable `/en/` and `/zh/` public pages. It MUST omit the root alias, unprefixed public aliases, authentication pages, dashboard pages, API routes, and any page whose public content is not intended for search indexing.

#### Scenario: Sitemap is generated
- **WHEN** the sitemap is requested
- **THEN** every entry uses the `www` host and an `/en/` or `/zh/` path, and no entry is an unprefixed or private URL

### Requirement: Private surfaces are excluded from indexing

Authentication pages and dashboard pages MUST emit `noindex, nofollow` metadata or an equivalent response indexing directive. Robots rules MUST continue to disallow authentication, dashboard, and API paths and MUST reference the canonical `www` sitemap.

#### Scenario: Authentication page is crawled
- **WHEN** a crawler requests `/login`, `/register`, `/forgot-password`, `/reset-password`, or `/verify-email`
- **THEN** the response carries a noindex directive and the path is disallowed by robots rules

#### Scenario: Dashboard page is crawled
- **WHEN** a crawler requests any `/dashboard/...` page
- **THEN** the response carries a noindex directive and the path is disallowed by robots rules
