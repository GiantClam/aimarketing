import { notFound } from "next/navigation"

import { SeoLandingPage } from "@/components/seo/seo-landing-page"
import { getSeoPage, getSeoPagesByGroup } from "@/lib/seo/pages"
import { metadataForSeoPage } from "@/lib/seo/metadata"

type Props = {
  params: Promise<{ slug: string }>
}

export function generateStaticParams() {
  return getSeoPagesByGroup("agents").map((page) => ({ slug: page.slug }))
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const page = getSeoPage("agents", slug)
  if (!page) return {}
  return metadataForSeoPage(page)
}

export default async function AgentSeoPage({ params }: Props) {
  const { slug } = await params
  const page = getSeoPage("agents", slug)
  if (!page) notFound()

  return <SeoLandingPage page={page} />
}
