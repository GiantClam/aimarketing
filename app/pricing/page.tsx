import type { Metadata } from "next"

import { PublicPricingPageContent } from "@/components/seo/public-pricing-page"
import { buildAppUrl } from "@/lib/app-url"

const canonical = buildAppUrl("/pricing")

export const metadata: Metadata = {
  title: "AI Marketing Pricing for Small Teams",
  description:
    "Affordable AI marketing workspace plans for small teams, including shared credits, marketing agents, team permissions, and optional BYOK for heavier usage.",
  alternates: {
    canonical,
  },
  openGraph: {
    title: "AI Marketing Pricing for Small Teams",
    description:
      "Compare shared-credit AI marketing workspace options for small teams, agencies, startups, and consultants.",
    url: canonical,
    siteName: "AI Marketing",
    type: "website",
  },
}

export default function PricingPage() {
  return <PublicPricingPageContent />
}
