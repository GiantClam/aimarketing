import { notFound } from "next/navigation"

import { SeoLandingPage } from "@/components/seo/seo-landing-page"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import { getSeoPage, getSeoPagesByGroup } from "@/lib/seo/pages"
import { metadataForSeoPage } from "@/lib/seo/metadata"
import { localizeSeoPage } from "@/lib/seo/i18n"

type Props = {
  params: Promise<{ slug: string }>
}

export const dynamicParams = false

export function generateStaticParams() {
  return getSeoPagesByGroup("solutions").map((page) => ({ slug: page.slug }))
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const page = getSeoPage("solutions", slug)
  if (!page) return {}
  const locale = await getRequestLocale()
  return metadataForSeoPage(localizeSeoPage(page, locale), locale)
}

export default async function SolutionSeoPage({ params }: Props) {
  const { slug } = await params
  const page = getSeoPage("solutions", slug)
  if (!page) notFound()
  const locale = await getRequestLocale()

  return <SeoLandingPage page={localizeSeoPage(page, locale)} locale={locale} />
}
