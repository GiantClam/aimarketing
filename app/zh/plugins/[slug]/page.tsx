import type { Metadata } from "next"

import {
  getPlatformPluginMetadata,
  getPlatformPluginStaticParams,
  renderPlatformPluginPage,
} from "@/lib/platform/public-detail-pages"

type Props = {
  params: Promise<{ slug: string }>
}

export const dynamicParams = false

export function generateStaticParams() {
  return getPlatformPluginStaticParams()
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  return getPlatformPluginMetadata("zh", slug)
}

export default async function ZhPluginDetailPage({ params }: Props) {
  const { slug } = await params
  return renderPlatformPluginPage("zh", slug)
}
