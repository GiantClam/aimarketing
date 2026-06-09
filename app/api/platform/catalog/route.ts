import { NextResponse } from "next/server"

import { detectLocaleFromAcceptLanguage, normalizeLocale, type AppLocale } from "@/lib/i18n/config"
import { getLocalizedPlatformCatalog, type PlatformCatalogSurface } from "@/lib/platform/catalog"

function normalizeSurface(value: string | null): PlatformCatalogSurface {
  if (value === "public" || value === "workspace" || value === "all") return value
  return "all"
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const requestedLocale = normalizeLocale(url.searchParams.get("locale"))
  const locale: AppLocale = requestedLocale || detectLocaleFromAcceptLanguage(request.headers.get("accept-language"))
  const surface = normalizeSurface(url.searchParams.get("surface"))

  return NextResponse.json({
    locale,
    surface,
    catalog: getLocalizedPlatformCatalog(locale, surface),
  })
}
