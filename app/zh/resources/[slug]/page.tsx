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
  return getResourceMetadata("zh", slug)
}

export default async function ZhResourcePage({ params }: Props) {
  const { slug } = await params
  return renderResourcePage("zh", slug)
}
