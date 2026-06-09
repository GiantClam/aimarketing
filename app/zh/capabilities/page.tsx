import { getPlatformDirectoryMetadata, renderPlatformDirectoryPage } from "@/lib/seo/localized-public-pages"

export const metadata = getPlatformDirectoryMetadata("zh", "capabilities")

export default async function ZhCapabilitiesPage() {
  return renderPlatformDirectoryPage("zh", "capabilities")
}
