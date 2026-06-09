import type { AppLocale } from "@/lib/i18n/config"
import type { PlatformRegistryItemType } from "@/lib/platform/control-plane"

export type PlatformLaunchSurface = "public" | "workspace"
export type PlatformLaunchItemType = PlatformRegistryItemType

export function buildPlatformLaunchPath(input: {
  itemType: PlatformLaunchItemType
  slug: string
  surface: PlatformLaunchSurface
  locale: AppLocale
}) {
  const search = new URLSearchParams({
    type: input.itemType,
    slug: input.slug,
    surface: input.surface,
    locale: input.locale,
  })

  return `/api/platform/launch?${search.toString()}`
}
