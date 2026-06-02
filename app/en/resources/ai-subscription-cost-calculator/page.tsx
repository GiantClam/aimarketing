import { getAiCostMetadata, renderAiCostPage } from "@/lib/seo/localized-public-pages"

export const metadata = getAiCostMetadata("en")

export default function EnAiCostCalculatorPage() {
  return renderAiCostPage("en")
}
