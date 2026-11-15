import type { Metadata } from "next"

import { PublicPricingPageContent } from "@/components/seo/public-pricing-page"
import { getPricingMetadata } from "@/lib/seo/localized-public-pages"

export const metadata: Metadata = getPricingMetadata("en")

export default function PricingPage() {
  return <PublicPricingPageContent />
}
