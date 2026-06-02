import { getHomeMetadata, renderHomePage } from "@/lib/seo/localized-public-pages"

export const metadata = getHomeMetadata("zh")

export default function ZhHomePage() {
  return renderHomePage()
}
