import { getUseCaseMetadata, getUseCaseStaticParams, renderUseCasePage } from "@/lib/seo/localized-public-pages"

type Props = {
  params: Promise<{ slug: string }>
}

export const dynamicParams = false

export function generateStaticParams() {
  return getUseCaseStaticParams()
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  return getUseCaseMetadata("zh", slug)
}

export default async function ZhUseCasePage({ params }: Props) {
  const { slug } = await params
  return renderUseCasePage("zh", slug)
}
