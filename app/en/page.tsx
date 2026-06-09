import { getHomeMetadata, renderHomePage } from "@/lib/seo/localized-public-pages"

export const metadata = getHomeMetadata("en")

export default async function EnHomePage() {
  return await renderHomePage("en")
}
