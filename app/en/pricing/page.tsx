import { getPricingMetadata, renderPricingPage } from "@/lib/seo/localized-public-pages"

export const metadata = getPricingMetadata("en")

export default async function EnPricingPage() {
  return renderPricingPage()
}
