import { PublicSiteFooter } from "@/components/seo/public-site-footer"
import { PublicSiteHeader } from "@/components/seo/public-site-header"
import { PublicPlatformDirectory } from "@/components/platform/public-platform-directory"
import { getServerSessionUser } from "@/lib/auth/server-session"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import { getLocalizedPlatformDirectoryEntryBySlug } from "@/lib/platform/directory-registry"
import { listPlatformRegistryEntryExecutionStates } from "@/lib/platform/registry-entry-execution"

export default async function AgentsHubPage() {
  const locale = await getRequestLocale()
  const displayLocale = locale === "zh" ? "zh" : "en"
  const currentUser = await getServerSessionUser().catch(() => null)
  const items = (await listPlatformRegistryEntryExecutionStates({
    locale,
    itemType: "agent",
    surface: "public",
    enterpriseId: currentUser?.enterpriseId,
    currentUser,
  })).map((item) => ({
    ...item,
    availability: getLocalizedPlatformDirectoryEntryBySlug(locale, "agent", item.slug)?.availability,
    launchItemType: "agent" as const,
    detailHref: `/agents/${item.slug}`,
    extraLabel: item.label,
    proofPoints: item.notes.slice(0, 4),
  }))

  const copy =
    locale === "zh"
      ? {
          eyebrow: "Agent Square",
          title: "智能体广场",
          description:
            "先用注册表方式把可复用智能体组织起来，统一承接 public 展示、企业配置和后续工作流绑定，而不是让每个 Agent 继续各自散落。",
        }
      : {
          eyebrow: "Agent Square",
          title: "Agent Square",
          description:
            "Start by organizing reusable agents through a shared registry that supports public discovery, enterprise configuration, and later workflow bindings.",
        }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <PublicSiteHeader activeKey="tools" />
      <PublicPlatformDirectory locale={displayLocale} eyebrow={copy.eyebrow} title={copy.title} description={copy.description} items={items} />
      <PublicSiteFooter />
    </main>
  )
}
