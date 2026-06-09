import { getPlatformDirectoryMetadata, renderPlatformDirectoryPage } from "@/lib/seo/localized-public-pages"

export const metadata = getPlatformDirectoryMetadata("zh", "mcp-services")

export default async function ZhMcpServicesPage() {
  return renderPlatformDirectoryPage("zh", "mcp-services")
}
