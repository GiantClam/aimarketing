import { getHomeMetadata, renderHomePage } from "@/lib/seo/localized-public-pages"

export const metadata = getHomeMetadata("en")

export default function EnHomePage() {
  return renderHomePage()
}
