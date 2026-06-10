import type { Metadata } from "next"

import { buildLocalizedPublicUrl, getLocalizedPublicAlternates } from "@/lib/i18n/routing"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import { getResourcesMetadata, renderResourcesPage } from "@/lib/seo/localized-public-pages"

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale()
  const metadata = getResourcesMetadata(locale)

  return {
    ...metadata,
    alternates: {
      canonical: buildLocalizedPublicUrl("/resources", locale),
      languages: getLocalizedPublicAlternates("/resources"),
    },
  }
}

export default async function ResourcesPage() {
  const locale = await getRequestLocale()
  return renderResourcesPage(locale)
}
