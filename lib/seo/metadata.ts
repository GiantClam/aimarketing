import type { Metadata } from "next"

import { getAppBaseUrl } from "@/lib/app-url"
import type { AppLocale } from "@/lib/i18n/config"
import { buildLocalizedPublicUrl, getLocalizedPublicAlternates } from "@/lib/i18n/routing"
import type { SeoPage } from "@/lib/seo/pages"
import { seoPathForPage } from "@/lib/seo/pages"

const PUBLIC_BRAND = "AIMarketingSite"

export function normalizePublicTitle(title: string) {
  const withoutLegacySuffix = title
    .trim()
    .replace(/\s*\|\s*(?:AI Marketing|AIMarketingSite)\s*$/i, "")
    .trim()

  return withoutLegacySuffix ? `${withoutLegacySuffix} | ${PUBLIC_BRAND}` : PUBLIC_BRAND
}

export function metadataForSeoPage(page: SeoPage, locale: AppLocale): Metadata {
  const path = seoPathForPage(page)
  const canonical = buildLocalizedPublicUrl(path, locale)
  const title = normalizePublicTitle(page.title)

  return {
    title: {
      absolute: title,
    },
    description: page.description,
    alternates: {
      canonical,
      languages: getLocalizedPublicAlternates(path),
    },
    openGraph: {
      title,
      description: page.description,
      url: canonical,
      siteName: PUBLIC_BRAND,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: page.description,
    },
  }
}

export function siteBaseUrl() {
  return getAppBaseUrl()
}
