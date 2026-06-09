import type { Metadata } from "next"

import {
  getPlatformWorkflowMetadata,
  getPlatformWorkflowStaticParams,
  renderPlatformWorkflowPage,
} from "@/lib/platform/public-detail-pages"

type Props = {
  params: Promise<{ slug: string }>
}

export const dynamicParams = false

export function generateStaticParams() {
  return getPlatformWorkflowStaticParams()
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  return getPlatformWorkflowMetadata("en", slug)
}

export default async function EnWorkflowDetailPage({ params }: Props) {
  const { slug } = await params
  return renderPlatformWorkflowPage("en", slug)
}
