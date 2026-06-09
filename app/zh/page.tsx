import { getHomeMetadata, renderHomePage } from "@/lib/seo/localized-public-pages"

export const metadata = getHomeMetadata("zh")

export default async function ZhHomePage() {
  return await renderHomePage("zh")
}
