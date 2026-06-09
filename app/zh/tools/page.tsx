import { getToolsHubMetadata } from "@/lib/lead-tools/public-metadata"
import { renderToolsHubPage } from "@/lib/lead-tools/public-pages"

export const metadata = getToolsHubMetadata("zh")

export default async function ZhToolsHubPage() {
  return renderToolsHubPage("zh")
}
