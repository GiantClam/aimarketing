import { getCompareMetadata, getCompareStaticParams, renderComparePage } from "@/lib/seo/localized-public-pages"

type Props = {
  params: Promise<{ slug: string }>
}

export const dynamicParams = false

export function generateStaticParams() {
  return getCompareStaticParams()
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  return getCompareMetadata("zh", slug)
}

export default async function ZhComparePage({ params }: Props) {
  const { slug } = await params
  return renderComparePage("zh", slug)
}
