import { getPlatformDirectoryMetadata, renderPlatformDirectoryPage } from "@/lib/seo/localized-public-pages"

export const metadata = getPlatformDirectoryMetadata("zh", "workflows")

export default async function ZhWorkflowsPage() {
  return renderPlatformDirectoryPage("zh", "workflows")
}
