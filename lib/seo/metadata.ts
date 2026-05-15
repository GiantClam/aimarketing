import type { Metadata } from "next"

import { buildAppUrl, getAppBaseUrl } from "@/lib/app-url"
import type { SeoPage } from "@/lib/seo/pages"
import { seoPathForPage } from "@/lib/seo/pages"

export function metadataForSeoPage(page: SeoPage): Metadata {
  const path = seoPathForPage(page)
  const canonical = buildAppUrl(path)

  return {
    title: {
      absolute: page.title,
    },
    description: page.description,
    alternates: {
      canonical,
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
