import { notFound } from "next/navigation"

import { getRequestLocale } from "@/lib/i18n/request-locale"
import {
  getPlatformAgentMetadata,
  getPlatformAgentStaticParams,
  renderPlatformAgentPage,
} from "@/lib/platform/public-detail-pages"
import { getSeoPage, getSeoPagesByGroup } from "@/lib/seo/pages"
import { metadataForSeoPage } from "@/lib/seo/metadata"
import { localizeSeoPage } from "@/lib/seo/i18n"

type Props = {
  params: Promise<{ slug: string }>
}

export const dynamicParams = false

export function generateStaticParams() {
  return [...new Map(
    [...getSeoPagesByGroup("agents").map((page) => ({ slug: page.slug })), ...getPlatformAgentStaticParams()].map((item) => [item.slug, item]),
  ).values()]
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const locale = await getRequestLocale()
  const platformMetadata = getPlatformAgentMetadata(locale, slug)
  if (Object.keys(platformMetadata).length > 0) return platformMetadata
  const page = getSeoPage("agents", slug)
  if (!page) return {}
  return metadataForSeoPage(localizeSeoPage(page, locale), locale)
}

export default async function AgentSeoPage({ params }: Props) {
  const { slug } = await params
  const locale = await getRequestLocale()
  const platformPage = await renderPlatformAgentPage(locale, slug)
  if (platformPage) return platformPage
  const page = getSeoPage("agents", slug)
  if (!page) notFound()

  const { SeoLandingPage } = await import("@/components/seo/seo-landing-page")
  return <SeoLandingPage page={localizeSeoPage(page, locale)} locale={locale} />
}
