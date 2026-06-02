import { getAiCostMetadata, renderAiCostPage } from "@/lib/seo/localized-public-pages"

export const metadata = getAiCostMetadata("zh")

export default function ZhAiCostCalculatorPage() {
  return renderAiCostPage("zh")
}
