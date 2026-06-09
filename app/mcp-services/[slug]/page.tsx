import type { Metadata } from "next"

import {
  getPlatformMcpServiceMetadata,
  getPlatformMcpServiceStaticParams,
  renderPlatformMcpServicePage,
} from "@/lib/platform/public-detail-pages"
import { getRequestLocale } from "@/lib/i18n/request-locale"

type Props = {
  params: Promise<{ slug: string }>
}

export const dynamicParams = false

export function generateStaticParams() {
  return getPlatformMcpServiceStaticParams()
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const locale = await getRequestLocale()
  return getPlatformMcpServiceMetadata(locale, slug)
}

export default async function McpServiceDetailPage({ params }: Props) {
  const { slug } = await params
  const locale = await getRequestLocale()
  return renderPlatformMcpServicePage(locale, slug)
}
