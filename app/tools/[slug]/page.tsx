import type { Metadata } from "next"

import { getRequestLocale } from "@/lib/i18n/request-locale"
import { getLeadToolMetadata } from "@/lib/lead-tools/public-metadata"
import { renderLeadToolPage, type LeadToolRouteSearchParams } from "@/lib/lead-tools/public-pages"

type ToolPageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<LeadToolRouteSearchParams>
}

export async function generateMetadata({ params }: ToolPageProps): Promise<Metadata> {
  const { slug } = await params
  const locale = await getRequestLocale()
  return getLeadToolMetadata(locale, slug)
}

export default async function ToolPage({ params, searchParams }: ToolPageProps) {
  const { slug } = await params
  const query = await searchParams
  const locale = await getRequestLocale()
  return renderLeadToolPage(locale, slug, query)
}
