import type { Metadata } from "next"

import { getLeadToolExampleParams } from "@/lib/lead-tools/examples"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import { getLeadToolExampleMetadata } from "@/lib/lead-tools/public-metadata"
import { renderLeadToolExamplePage } from "@/lib/lead-tools/public-pages"

type LeadToolExamplePageProps = {
  params: Promise<{ slug: string; exampleSlug: string }>
}

export function generateStaticParams() {
  return getLeadToolExampleParams()
}

export async function generateMetadata({ params }: LeadToolExamplePageProps): Promise<Metadata> {
  const { slug, exampleSlug } = await params
  const locale = await getRequestLocale()
  return getLeadToolExampleMetadata(locale, slug, exampleSlug)
}

export default async function LeadToolExamplePage({ params }: LeadToolExamplePageProps) {
  const { slug, exampleSlug } = await params
  const locale = await getRequestLocale()
  return renderLeadToolExamplePage(locale, slug, exampleSlug)
}
