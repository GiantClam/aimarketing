import { getResourcesMetadata, renderResourcesPage } from "@/lib/seo/localized-public-pages"

export const metadata = getResourcesMetadata("en")

export default function EnResourcesPage() {
  return renderResourcesPage("en")
}
