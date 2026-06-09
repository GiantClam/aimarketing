import { getPlatformDirectoryMetadata, renderPlatformDirectoryPage } from "@/lib/seo/localized-public-pages"

export const metadata = getPlatformDirectoryMetadata("en", "capabilities")

export default async function EnCapabilitiesPage() {
  return renderPlatformDirectoryPage("en", "capabilities")
}
