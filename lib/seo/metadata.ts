import type { Metadata } from "next"

import { getAppBaseUrl } from "@/lib/app-url"
import type { AppLocale } from "@/lib/i18n/config"
import { buildLocalizedPublicUrl, getLocalizedPublicAlternates } from "@/lib/i18n/routing"
import type { SeoPage } from "@/lib/seo/pages"
import { seoPathForPage } from "@/lib/seo/pages"

export function metadataForSeoPage(page: SeoPage, locale: AppLocale): Metadata {
  const path = seoPathForPage(page)
  const canonical = buildLocalizedPublicUrl(path, locale)

  return {
    title: {
      absolute: page.title,
    },
    description: page.description,
    alternates: {
      canonical,
      languages: getLocalizedPublicAlternates(path),
    },
    openGraph: {
      title: page.title,
      description: page.description,
      url: canonical,
      siteName: "AI Marketing",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: page.title,
      description: page.description,
    },
  }
}

export function siteBaseUrl() {
  return getAppBaseUrl()
}
