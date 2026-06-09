import { PublicSiteFooter } from "@/components/seo/public-site-footer"
import { PublicSiteHeader } from "@/components/seo/public-site-header"
import { PublicPlatformDirectory } from "@/components/platform/public-platform-directory"
import { getServerSessionUser } from "@/lib/auth/server-session"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import { getLocalizedPlatformDirectoryEntryBySlug } from "@/lib/platform/directory-registry"
import { listPlatformRegistryEntryExecutionStates } from "@/lib/platform/registry-entry-execution"

export default async function PluginsPage() {
  const locale = await getRequestLocale()
  const displayLocale = locale === "zh" ? "zh" : "en"
  const currentUser = await getServerSessionUser().catch(() => null)
  const items = (await listPlatformRegistryEntryExecutionStates({
    locale,
    itemType: "plugin",
    surface: "public",
    enterpriseId: currentUser?.enterpriseId,
    currentUser,
  })).map((item) => ({
    ...item,
    availability: getLocalizedPlatformDirectoryEntryBySlug(locale, "plugin", item.slug)?.availability,
    launchItemType: "plugin" as const,
    detailHref: `/plugins/${item.slug}`,
    extraLabel: item.label,
    proofPoints: item.notes.slice(0, 4),
  }))

  const copy =
    locale === "zh"
      ? {
          eyebrow: "Extensions",
          title: "插件目录",
          description:
            "把 Writer、图片、知识、搜索和媒体扩展整理成统一插件目录，先完成注册、展示和绑定位，再逐步补齐更深的执行层。",
        }
      : {
          eyebrow: "Extensions",
          title: "Plugin Directory",
          description:
            "Group writer, image, knowledge, search, and media extensions under one directory first, then deepen the execution layer later.",
        }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <PublicSiteHeader activeKey="tools" />
      <PublicPlatformDirectory locale={displayLocale} eyebrow={copy.eyebrow} title={copy.title} description={copy.description} items={items} />
      <PublicSiteFooter />
    </main>
  )
}
