import { getPlatformDirectoryMetadata, renderPlatformDirectoryPage } from "@/lib/seo/localized-public-pages"

export const metadata = getPlatformDirectoryMetadata("en", "agents")

export default async function EnAgentsPage() {
  return renderPlatformDirectoryPage("en", "agents")
}
