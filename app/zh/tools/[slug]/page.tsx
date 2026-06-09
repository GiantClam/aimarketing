import type { Metadata } from "next"

import { getLeadToolMetadata } from "@/lib/lead-tools/public-metadata"
import { renderLeadToolPage, type LeadToolRouteSearchParams } from "@/lib/lead-tools/public-pages"

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<LeadToolRouteSearchParams>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  return getLeadToolMetadata("zh", slug)
}

export default async function ZhToolPage({ params, searchParams }: Props) {
  const { slug } = await params
  const query = await searchParams
  return renderLeadToolPage("zh", slug, query)
}
