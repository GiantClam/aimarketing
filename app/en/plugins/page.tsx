import { getPlatformDirectoryMetadata, renderPlatformDirectoryPage } from "@/lib/seo/localized-public-pages"

export const metadata = getPlatformDirectoryMetadata("en", "plugins")

export default async function EnPluginsPage() {
  return renderPlatformDirectoryPage("en", "plugins")
}
