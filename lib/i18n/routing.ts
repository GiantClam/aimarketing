import { buildAppUrl } from "@/lib/app-url"
import { DEFAULT_LOCALE, type AppLocale, normalizeLocale } from "@/lib/i18n/config"

export const LOCALE_REQUEST_HEADER_NAME = "x-aimarketing-locale"

const LOCALIZED_PUBLIC_PATHS = new Set([
  "/",
  "/agents",
  "/capabilities",
  "/plugins",
  "/mcp-services",
  "/pricing",
  "/resources",
  "/tools",
  "/workflows",
  "/agents/brand-strategy-agent",
  "/agents/growth-marketing-agent",
  "/agents/seo-article-agent",
  "/agents/website-copy-agent",
  "/agents/video-script-agent",
  "/agents/image-generation-agent",
  "/alternatives/chatgpt-team-alternative",
  "/compare/best-ai-workspace-for-marketing-teams",
  "/use-cases/ai-workspace-for-marketing-teams",
  "/use-cases/ai-workspace-for-seo-teams",
  "/use-cases/ai-workspace-for-content-creators",
  "/use-cases/ai-workspace-for-indie-founders",
  "/compare/compare-ai-tool-costs",
  "/prompts/marketing-strategy-prompts",
  "/prompts/growth-marketing-prompts",
  "/prompts/seo-article-prompts",
  "/prompts/website-copy-prompts",
  "/prompts/video-script-prompts",
  "/prompts/image-generation-prompts",
  "/resources/ai-subscription-cost-calculator",
])

const LOCALIZED_PUBLIC_PREFIXES = [
  "/agents/",
  "/capabilities/",
  "/plugins/",
  "/mcp-services/",
  "/resources/",
  "/tools/",
  "/workflows/",
] as const

type LocalizedPathParts = {
  locale: AppLocale | null
  pathname: string
}

function normalizePathname(pathname: string) {
  if (!pathname) return "/"
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`
  return normalized !== "/" ? normalized.replace(/\/+$/, "") : normalized
}

export function extractLocaleFromPathname(pathname: string): LocalizedPathParts {
  const normalizedPathname = normalizePathname(pathname)
  const segments = normalizedPathname.split("/")
  const locale = normalizeLocale(segments[1])

  if (!locale) {
    return {
      locale: null,
      pathname: normalizedPathname,
    }
  }

  const strippedPathname = normalizePathname(`/${segments.slice(2).join("/")}`)
  return {
    locale,
    pathname: strippedPathname,
  }
}

export function isLocalizedPublicPath(pathname: string) {
  const normalizedPathname = normalizePathname(pathname)

  if (LOCALIZED_PUBLIC_PATHS.has(normalizedPathname)) {
    return true
  }

  return LOCALIZED_PUBLIC_PREFIXES.some(
    (prefix) =>
      normalizedPathname.startsWith(prefix) && normalizedPathname.length > prefix.length,
  )
}

export function localizePublicPath(path: string, locale: AppLocale) {
  const [pathnameWithQuery, hash = ""] = path.split("#")
  const [pathnamePart, query = ""] = pathnameWithQuery.split("?")
  const { pathname } = extractLocaleFromPathname(pathnamePart)
  const localizedPathname = isLocalizedPublicPath(pathname)
    ? `/${locale}${pathname === "/" ? "" : pathname}`
    : pathname

  const querySuffix = query ? `?${query}` : ""
  const hashSuffix = hash ? `#${hash}` : ""
  return `${localizedPathname}${querySuffix}${hashSuffix}`
}

export function buildLocalizedPublicUrl(path: string, locale: AppLocale) {
  return buildAppUrl(localizePublicPath(path, locale))
}

export function getLocalizedPublicAlternates(path: string) {
  if (!isLocalizedPublicPath(path)) return undefined

  return {
    en: buildLocalizedPublicUrl(path, "en"),
    zh: buildLocalizedPublicUrl(path, "zh"),
    "x-default": buildLocalizedPublicUrl(path, DEFAULT_LOCALE),
  }
}
