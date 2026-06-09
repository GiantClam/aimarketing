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
  return getPlatformMcpServiceMetadata("en", slug)
}

export default async function EnMcpServiceDetailPage({ params }: Props) {
  const { slug } = await params
  return renderPlatformMcpServicePage("en", slug)
}
