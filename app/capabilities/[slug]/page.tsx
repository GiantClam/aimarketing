import type { Metadata } from "next"

import {
  getPlatformCapabilityMetadata,
  getPlatformCapabilityStaticParams,
  renderPlatformCapabilityPage,
} from "@/lib/platform/public-detail-pages"
import { getRequestLocale } from "@/lib/i18n/request-locale"

type Props = {
  params: Promise<{ slug: string }>
}

export const dynamicParams = false

export function generateStaticParams() {
  return getPlatformCapabilityStaticParams()
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const locale = await getRequestLocale()
  return getPlatformCapabilityMetadata(locale, slug)
}

export default async function CapabilityDetailPage({ params }: Props) {
  const { slug } = await params
  const locale = await getRequestLocale()
  return renderPlatformCapabilityPage(locale, slug)
}
