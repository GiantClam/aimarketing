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
  return getUseCaseMetadata("en", slug)
}

export default async function EnUseCasePage({ params }: Props) {
  const { slug } = await params
  return renderUseCasePage("en", slug)
}
