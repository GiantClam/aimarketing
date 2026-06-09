import { getRequestLocale } from "@/lib/i18n/request-locale"
import { renderHomePage } from "@/lib/seo/localized-public-pages"

export default async function HomePage() {
  const locale = await getRequestLocale()
  return await renderHomePage(locale)
}
