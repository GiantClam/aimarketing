import {
  getPromptMetadata,
  getPromptStaticParams,
  renderPromptPage,
} from "@/lib/seo/localized-public-pages"

type Props = {
  params: Promise<{ slug: string }>
}

export const dynamicParams = false

export function generateStaticParams() {
  return getPromptStaticParams()
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  return getPromptMetadata("zh", slug)
}

export default async function ZhPromptSeoPage({ params }: Props) {
  const { slug } = await params
  return renderPromptPage("zh", slug)
}
