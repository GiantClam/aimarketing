import { getPlatformDirectoryMetadata, renderPlatformDirectoryPage } from "@/lib/seo/localized-public-pages"

export const metadata = getPlatformDirectoryMetadata("en", "mcp-services")

export default async function EnMcpServicesPage() {
  return renderPlatformDirectoryPage("en", "mcp-services")
}
