import { getPricingMetadata, renderPricingPage } from "@/lib/seo/localized-public-pages"

export const metadata = getPricingMetadata("zh")

export default async function ZhPricingPage() {
  return renderPricingPage()
}
