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
  return getAgentMetadata("en", slug)
}

export default async function EnAgentSeoPage({ params }: Props) {
  const { slug } = await params
  return renderAgentPage("en", slug)
}
