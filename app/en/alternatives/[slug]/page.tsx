import {
  getAlternativeMetadata,
  getAlternativeStaticParams,
  renderAlternativePage,
} from "@/lib/seo/localized-public-pages"

type Props = {
  params: Promise<{ slug: string }>
}

export const dynamicParams = false

export function generateStaticParams() {
  return getAlternativeStaticParams()
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  return getAlternativeMetadata("en", slug)
}

export default async function EnAlternativeSeoPage({ params }: Props) {
  const { slug } = await params
  return renderAlternativePage("en", slug)
}
