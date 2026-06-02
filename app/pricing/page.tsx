import type { Metadata } from "next"

import { PublicPricingPageContent } from "@/components/seo/public-pricing-page"
import { buildAppUrl } from "@/lib/app-url"

const canonical = buildAppUrl("/pricing")

export const metadata: Metadata = {
  title: "AI Workspace Pricing for Marketing Teams",
  description:
    "Review pricing for a multi-model AI workspace built for marketing content, research, visuals, and shared workflows, including credits and BYOK-ready expansion paths.",
  alternates: {
    canonical,
  },
  openGraph: {
    title: "AI Workspace Pricing for Marketing Teams",
    description:
      "Compare workspace pricing for marketing teams, creators, and operators who need multiple AI models in one shared system.",
    url: canonical,
    siteName: "AIMarketingSite",
    type: "website",
  },
}

export default function PricingPage() {
  return <PublicPricingPageContent />
}
