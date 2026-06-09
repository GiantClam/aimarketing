import { getPlatformDirectoryMetadata, renderPlatformDirectoryPage } from "@/lib/seo/localized-public-pages"

export const metadata = getPlatformDirectoryMetadata("zh", "plugins")

export default async function ZhPluginsPage() {
  return renderPlatformDirectoryPage("zh", "plugins")
}
