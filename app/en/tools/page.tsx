import { getToolsHubMetadata } from "@/lib/lead-tools/public-metadata"
import { renderToolsHubPage } from "@/lib/lead-tools/public-pages"

export const metadata = getToolsHubMetadata("en")

export default async function EnToolsHubPage() {
  return renderToolsHubPage("en")
}
