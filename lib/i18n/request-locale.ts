import { cookies, headers } from "next/headers"

import { LOCALE_COOKIE_NAME, resolveRequestLocale } from "@/lib/i18n/config"
import { LOCALE_REQUEST_HEADER_NAME } from "@/lib/i18n/routing"

export async function getRequestLocale() {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()])
  return resolveRequestLocale(
    cookieStore.get(LOCALE_COOKIE_NAME)?.value,
    headerStore.get(LOCALE_REQUEST_HEADER_NAME) ?? headerStore.get("accept-language"),
  )
}
