import type { Metadata } from "next"

import {
  getPlatformMcpServiceMetadata,
  getPlatformMcpServiceStaticParams,
  renderPlatformMcpServicePage,
} from "@/lib/platform/public-detail-pages"

type Props = {
  params: Promise<{ slug: string }>
}

export const dynamicParams = false

export function generateStaticParams() {
  return getPlatformMcpServiceStaticParams()
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  return getPlatformMcpServiceMetadata("zh", slug)
}

export default async function ZhMcpServiceDetailPage({ params }: Props) {
  const { slug } = await params
  return renderPlatformMcpServicePage("zh", slug)
}
