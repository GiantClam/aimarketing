import { getResourceMetadata, getResourceStaticParams, renderResourcePage } from "@/lib/seo/localized-public-pages"

type Props = {
  params: Promise<{ slug: string }>
}

export const dynamicParams = false

export function generateStaticParams() {
  return getResourceStaticParams()
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  return getResourceMetadata("en", slug)
}

export default async function EnResourcePage({ params }: Props) {
  const { slug } = await params
  return renderResourcePage("en", slug)
}
