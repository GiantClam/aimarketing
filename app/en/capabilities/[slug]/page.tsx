import type { Metadata } from "next"

import {
  getPlatformCapabilityMetadata,
  getPlatformCapabilityStaticParams,
  renderPlatformCapabilityPage,
} from "@/lib/platform/public-detail-pages"

type Props = {
  params: Promise<{ slug: string }>
}

export const dynamicParams = false

export function generateStaticParams() {
  return getPlatformCapabilityStaticParams()
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  return getPlatformCapabilityMetadata("en", slug)
}

export default async function EnCapabilityDetailPage({ params }: Props) {
  const { slug } = await params
  return renderPlatformCapabilityPage("en", slug)
}
