import { PublicSiteFooter } from "@/components/seo/public-site-footer"
import { PublicSiteHeader } from "@/components/seo/public-site-header"
import { PublicPlatformDirectory } from "@/components/platform/public-platform-directory"
import { getServerSessionUser } from "@/lib/auth/server-session"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import { getLocalizedPlatformDirectoryEntryBySlug } from "@/lib/platform/directory-registry"
import { listPlatformRegistryEntryExecutionStates } from "@/lib/platform/registry-entry-execution"

export default async function WorkflowsPage() {
  const locale = await getRequestLocale()
  const displayLocale = locale === "zh" ? "zh" : "en"
  const currentUser = await getServerSessionUser().catch(() => null)
  const items = (await listPlatformRegistryEntryExecutionStates({
    locale,
    itemType: "workflow",
    surface: "public",
    enterpriseId: currentUser?.enterpriseId,
    currentUser,
  })).map((item) => ({
    ...item,
    availability: getLocalizedPlatformDirectoryEntryBySlug(locale, "workflow", item.slug)?.availability,
    launchItemType: "workflow" as const,
    detailHref: `/workflows/${item.slug}`,
    extraLabel: item.label,
    proofPoints: item.notes.slice(0, 4),
  }))

  const copy =
    locale === "zh"
      ? {
          eyebrow: "Workflow Templates",
          title: "工作流模板",
          description:
            "把反复出现的营销任务沉淀成跨 public 与 enterprise 共用的工作流模板，先做目录和绑定关系，再逐步扩展自动化执行。",
        }
      : {
          eyebrow: "Workflow Templates",
          title: "Workflow Templates",
          description:
            "Turn recurring marketing work into workflow templates shared by the public toolsite and the enterprise workspace, then deepen automation over time.",
        }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <PublicSiteHeader activeKey="tools" />
      <PublicPlatformDirectory locale={displayLocale} eyebrow={copy.eyebrow} title={copy.title} description={copy.description} items={items} />
      <PublicSiteFooter />
    </main>
  )
}
