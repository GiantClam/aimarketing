import { getPlatformDirectoryMetadata, renderPlatformDirectoryPage } from "@/lib/seo/localized-public-pages"

export const metadata = getPlatformDirectoryMetadata("zh", "agents")

export default async function ZhAgentsPage() {
  return renderPlatformDirectoryPage("zh", "agents")
}
