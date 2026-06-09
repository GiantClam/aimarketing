import { getPlatformDirectoryMetadata, renderPlatformDirectoryPage } from "@/lib/seo/localized-public-pages"

export const metadata = getPlatformDirectoryMetadata("en", "workflows")

export default async function EnWorkflowsPage() {
  return renderPlatformDirectoryPage("en", "workflows")
}
