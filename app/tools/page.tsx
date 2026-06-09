import { getRequestLocale } from "@/lib/i18n/request-locale"
import { getToolsHubMetadata } from "@/lib/lead-tools/public-metadata"
import { renderToolsHubPage } from "@/lib/lead-tools/public-pages"

export async function generateMetadata() {
  const locale = await getRequestLocale()
  return getToolsHubMetadata(locale)
}

export default async function ToolsHubPage() {
  const locale = await getRequestLocale()
  return renderToolsHubPage(locale)
}
