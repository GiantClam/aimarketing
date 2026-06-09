import type { AppLocale } from "@/lib/i18n/config"
import { localizePublicPath } from "@/lib/i18n/routing"
import type { AuthUser } from "@/lib/auth/session"
import { getLocalizedPlatformCapabilityBySlug } from "@/lib/platform/catalog"
import { listVisiblePlatformRegistryEntries } from "@/lib/platform/directory-resolver"
import { getPlatformCapabilityExecutionState } from "@/lib/platform/execution"
import {
  buildPlatformLaunchPath,
  type PlatformLaunchItemType,
  type PlatformLaunchSurface,
} from "@/lib/platform/launch-path"

export type PlatformLaunchTarget = {
  href: string
  requiresLogin: boolean
}

function withLoginRedirect(targetHref: string) {
  return `/login?next=${encodeURIComponent(targetHref)}`
}

function toResolvedPublicHref(href: string | undefined, locale: AppLocale) {
  return href ? localizePublicPath(href, locale) : undefined
}

function buildFallbackHubHref(itemType: PlatformLaunchItemType, surface: PlatformLaunchSurface, locale: AppLocale) {
  if (itemType === "capability") {
    return surface === "public" ? localizePublicPath("/capabilities", locale) : "/dashboard/capabilities"
  }

  if (itemType === "agent") {
    return surface === "public" ? localizePublicPath("/agents", locale) : "/dashboard/agent-platform"
  }

  if (itemType === "plugin") {
    return surface === "public" ? localizePublicPath("/plugins", locale) : "/dashboard/plugins"
  }

  if (itemType === "mcp_service") {
    return surface === "public" ? localizePublicPath("/mcp-services", locale) : "/dashboard/mcp-services"
  }

  return surface === "public" ? localizePublicPath("/workflows", locale) : "/dashboard/workflows"
}

export { buildPlatformLaunchPath }

export async function resolvePlatformLaunchTarget(input: {
  itemType: PlatformLaunchItemType
  slug: string
  surface: PlatformLaunchSurface
  locale: AppLocale
  currentUser?: AuthUser | null
}): Promise<PlatformLaunchTarget> {
  const { itemType, slug, surface, locale, currentUser } = input

  if (itemType === "capability") {
    const capability = getLocalizedPlatformCapabilityBySlug(locale, slug)
    if (!capability) {
      return {
        href: buildFallbackHubHref(itemType, surface, locale),
        requiresLogin: surface === "workspace",
      }
    }

    const execution = await getPlatformCapabilityExecutionState(slug, locale, currentUser || null)

    const publicHref = toResolvedPublicHref(capability.publicHref, locale)
    const workspaceHref = capability.workspaceHref

    if (surface === "public") {
      if (publicHref) {
        return {
          href: publicHref,
          requiresLogin: false,
        }
      }

      if (workspaceHref) {
        return {
          href: currentUser ? workspaceHref : withLoginRedirect(workspaceHref),
          requiresLogin: !currentUser,
        }
      }
    }

    if (workspaceHref) {
      const needsLogin =
        !currentUser &&
        (execution?.accessState === "login_required" ||
          execution?.accessState === "public_then_login" ||
          execution?.accessState === "permission_required" ||
          execution?.accessState === "admin_required")

      return {
        href: needsLogin ? withLoginRedirect(workspaceHref) : workspaceHref,
        requiresLogin: needsLogin,
      }
    }

    return {
      href: publicHref || buildFallbackHubHref(itemType, surface, locale),
      requiresLogin: false,
    }
  }

  const entry = (
    await listVisiblePlatformRegistryEntries({
      locale,
      itemType,
      surface,
      enterpriseId: currentUser?.enterpriseId,
    })
  ).find((item) => item.slug === slug)

  if (!entry) {
    return {
      href: buildFallbackHubHref(itemType, surface, locale),
      requiresLogin: surface === "workspace",
    }
  }

  const publicHref = toResolvedPublicHref(entry.publicHref, locale)
  const workspaceHref = entry.workspaceHref

  if (surface === "public") {
    if (publicHref) {
      return {
        href: publicHref,
        requiresLogin: false,
      }
    }

    if (workspaceHref) {
      return {
        href: currentUser ? workspaceHref : withLoginRedirect(workspaceHref),
        requiresLogin: !currentUser,
      }
    }
  }

  if (workspaceHref) {
    return {
      href: currentUser ? workspaceHref : withLoginRedirect(workspaceHref),
      requiresLogin: !currentUser,
    }
  }

  return {
    href: publicHref || buildFallbackHubHref(itemType, surface, locale),
    requiresLogin: false,
  }
}
