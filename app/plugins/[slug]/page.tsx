import type { Metadata } from "next"

import {
  getPlatformPluginMetadata,
  getPlatformPluginStaticParams,
  renderPlatformPluginPage,
} from "@/lib/platform/public-detail-pages"
import { getRequestLocale } from "@/lib/i18n/request-locale"

type Props = {
  params: Promise<{ slug: string }>
}

export const dynamicParams = false

export function generateStaticParams() {
  return getPlatformPluginStaticParams()
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const locale = await getRequestLocale()
  return getPlatformPluginMetadata(locale, slug)
}

export default async function PluginDetailPage({ params }: Props) {
  const { slug } = await params
  const locale = await getRequestLocale()
  return renderPlatformPluginPage(locale, slug)
}
