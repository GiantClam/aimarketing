import { getResourcesMetadata, renderResourcesPage } from "@/lib/seo/localized-public-pages"

export const metadata = getResourcesMetadata("zh")

export default function ZhResourcesPage() {
  return renderResourcesPage("zh")
}
