import type { Metadata } from "next"

import { getLeadToolExampleParams } from "@/lib/lead-tools/examples"
import { getLeadToolExampleMetadata } from "@/lib/lead-tools/public-metadata"
import { renderLeadToolExamplePage } from "@/lib/lead-tools/public-pages"

type Props = {
  params: Promise<{ slug: string; exampleSlug: string }>
}

export function generateStaticParams() {
  return getLeadToolExampleParams()
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, exampleSlug } = await params
  return getLeadToolExampleMetadata("zh", slug, exampleSlug)
}

export default async function ZhLeadToolExamplePage({ params }: Props) {
  const { slug, exampleSlug } = await params
  return renderLeadToolExamplePage("zh", slug, exampleSlug)
}
