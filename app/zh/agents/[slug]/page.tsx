import {
  getAgentMetadata,
  getAgentStaticParams,
  renderAgentPage,
} from "@/lib/seo/localized-public-pages"

type Props = {
  params: Promise<{ slug: string }>
}

export const dynamicParams = false

export function generateStaticParams() {
  return getAgentStaticParams()
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  return getAgentMetadata("zh", slug)
}

export default async function ZhAgentSeoPage({ params }: Props) {
  const { slug } = await params
  return renderAgentPage("zh", slug)
}
