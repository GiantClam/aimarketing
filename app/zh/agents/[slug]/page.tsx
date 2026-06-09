import {
  getAgentMetadata,
  getAgentStaticParams,
  renderAgentPage,
} from "@/lib/seo/localized-public-pages"
import {
  getPlatformAgentMetadata,
  getPlatformAgentStaticParams,
  renderPlatformAgentPage,
} from "@/lib/platform/public-detail-pages"

type Props = {
  params: Promise<{ slug: string }>
}

export const dynamicParams = false

export function generateStaticParams() {
  return [...new Map([...getAgentStaticParams(), ...getPlatformAgentStaticParams()].map((item) => [item.slug, item])).values()]
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const platformMetadata = getPlatformAgentMetadata("zh", slug)
  if (Object.keys(platformMetadata).length > 0) return platformMetadata
  return getAgentMetadata("zh", slug)
}

export default async function ZhAgentSeoPage({ params }: Props) {
  const { slug } = await params
  const platformPage = await renderPlatformAgentPage("zh", slug)
  if (platformPage) return platformPage
  return renderAgentPage("zh", slug)
}
