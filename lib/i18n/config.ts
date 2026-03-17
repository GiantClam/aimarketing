export const LOCALE_COOKIE_NAME = "aimarketing_locale"

export const SUPPORTED_LOCALES = ["zh", "en"] as const

export type AppLocale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: AppLocale = "zh"

export function normalizeLocale(value: string | null | undefined): AppLocale | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  if (normalized.startsWith("zh")) return "zh"
  if (normalized.startsWith("en")) return "en"
  return null
}

export function detectLocaleFromAcceptLanguage(headerValue: string | null | undefined): AppLocale {
  if (!headerValue) return DEFAULT_LOCALE

  const candidates = headerValue.split(",").map((part) => part.trim())
  for (const candidate of candidates) {
    const locale = normalizeLocale(candidate.split(";")[0])
    if (locale) return locale
  }

  return DEFAULT_LOCALE
}

export function resolveRequestLocale(cookieLocale?: string | null, acceptLanguage?: string | null): AppLocale {
  return normalizeLocale(cookieLocale) || detectLocaleFromAcceptLanguage(acceptLanguage) || DEFAULT_LOCALE
}

