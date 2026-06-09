import type { Metadata } from "next"

import {
  getPlatformWorkflowMetadata,
  getPlatformWorkflowStaticParams,
  renderPlatformWorkflowPage,
} from "@/lib/platform/public-detail-pages"
import { getRequestLocale } from "@/lib/i18n/request-locale"

type Props = {
  params: Promise<{ slug: string }>
}

export const dynamicParams = false

export function generateStaticParams() {
  return getPlatformWorkflowStaticParams()
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const locale = await getRequestLocale()
  return getPlatformWorkflowMetadata(locale, slug)
}

export default async function WorkflowDetailPage({ params }: Props) {
  const { slug } = await params
  const locale = await getRequestLocale()
  return renderPlatformWorkflowPage(locale, slug)
}
