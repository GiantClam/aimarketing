import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowRight, CreditCard, Network, Settings, Users2 } from "lucide-react"

import { PlatformGovernanceSettingsPanel } from "@/components/platform/platform-governance-settings-panel"
import { Button } from "@/components/ui/button"
import { getServerSessionUser } from "@/lib/auth/server-session"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import { getCustomerGovernanceSnapshot } from "@/lib/platform/customer-governance"
import {
  getLocalizedWorkspaceEnterpriseSettingEntryBySlug,
  type WorkspaceEnterpriseSettingSlug,
} from "@/lib/platform/workspace-enterprise-settings"

const iconMap = {
  seats: Users2,
  usage: CreditCard,
  compute: Network,
  sso: Settings,
} as const

export default async function DashboardPlatformSettingDetailPage({
  params,
}: {
  params: Promise<{ section: string }>
}) {
  const [{ section }, locale, currentUser] = await Promise.all([params, getRequestLocale(), getServerSessionUser()])
  if (!currentUser) {
    redirect("/login?next=%2Fdashboard%2Fplatform-settings")
  }
  const displayLocale = locale === "zh" ? "zh" : "en"
  const entry = getLocalizedWorkspaceEnterpriseSettingEntryBySlug(
    locale,
    section as WorkspaceEnterpriseSettingSlug,
  )

  if (!entry) {
    notFound()
  }

  const Icon = iconMap[entry.slug]
  const customerSnapshot =
    entry.slug === "compute" && currentUser.enterpriseId
      ? await getCustomerGovernanceSnapshot(currentUser).catch(() => null)
      : null
  const relatedLabel = displayLocale === "zh" ? "关联入口" : "Related entries"
  const openLabel = displayLocale === "zh" ? "打开入口" : "Open entry"
  const noteLabel = displayLocale === "zh" ? "信息架构说明" : "Information architecture note"
  const noteBody =
    displayLocale === "zh"
      ? "该页面只补齐企业设置的信息架构入口；算力编排页会额外承接企业模型配置，其余栏目不改现有登录、支付、权限底层。"
      : "This page keeps the enterprise-settings information architecture entry. The compute section additionally hosts enterprise model configuration, while other sections do not rewrite auth, payments, or permission foundations."

  return (
    <div className="h-full overflow-auto bg-transparent">
      <section className="public-grid-bg workspace-page-shell mx-auto max-w-7xl">
        <div className="workspace-stack">
          <div className="public-panel workspace-hero-panel rounded-[12px] border border-border bg-card/80">
            <div className="public-kicker text-muted-foreground">Enterprise Settings</div>
            <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-4xl">
                <h1 className="font-display text-4xl font-extrabold uppercase tracking-[0.02em] text-foreground lg:text-5xl">
                  {entry.title}
                </h1>
                <p className="mt-4 text-sm leading-7 text-muted-foreground lg:text-base">{entry.description}</p>
              </div>
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[8px] border border-primary/30 bg-primary/95">
                <Icon className="h-6 w-6 text-primary-foreground" />
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <span className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">{entry.summary}</span>
              <span className="dashboard-chip rounded-[4px] px-3 py-2 text-sm text-foreground/85">{noteBody}</span>
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
            <article className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
              <div className="dashboard-kicker text-muted-foreground">{noteLabel}</div>
              <div className="mt-5 space-y-3">
                {entry.bullets.map((item) => (
                  <div key={item} className="dashboard-chip rounded-[8px] px-4 py-3 text-sm text-foreground/85">
                    {item}
                  </div>
                ))}
              </div>
            </article>

            <article className="dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85">
              <div className="dashboard-kicker text-muted-foreground">{relatedLabel}</div>
              <div className="mt-5 space-y-3">
                {entry.relatedLinks.map((link) => (
                  <div key={link.href} className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-border bg-background px-4 py-3">
                    <div className="text-sm text-foreground">{link.label}</div>
                    <Button variant="outline" className="h-9 rounded-[6px] px-3" asChild>
                      <Link href={link.href}>
                        {openLabel}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>
            </article>
          </div>

          {entry.slug === "compute" && customerSnapshot ? (
            <PlatformGovernanceSettingsPanel
              locale={locale}
              snapshot={customerSnapshot}
              initialCategory="text_generation"
            />
          ) : null}
        </div>
      </section>
    </div>
  )
}
