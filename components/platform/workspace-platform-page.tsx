import Link from "next/link"

import { RegistryExecutionPanel } from "@/components/platform/registry-execution-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getDeferredEntryCopy, isDeferredAvailability } from "@/lib/platform/deferred-entry"
import type { PlatformDirectoryAvailability } from "@/lib/platform/directory-config"

type WorkspacePlatformItem = {
  itemType: "capability" | "agent" | "plugin" | "mcp_service" | "workflow"
  slug: string
  status: "live" | "beta" | "planned"
  availability?: PlatformDirectoryAvailability
  title: string
  summary: string
  proofPoints: string[]
  bindingTarget: string
  runtimeStatus: "ready" | "deferred" | "runtime_disabled" | null
  accessState: "public" | "public_then_login" | "login_required" | "authorized" | "permission_required" | "admin_required" | null
  workspaceHref?: string
  publicHref?: string
  workspaceLaunchPath?: string
  publicLaunchPath?: string
  meta?: string
}

function getStatusLabel(
  status: WorkspacePlatformItem["status"],
  availability: WorkspacePlatformItem["availability"],
  locale: "zh" | "en",
) {
  if (availability === "available") return locale === "zh" ? "已开放" : "Available"
  if (availability === "coming_soon") return locale === "zh" ? "即将开放" : "Coming soon"
  if (availability === "waitlist") return locale === "zh" ? "等待名单" : "Waitlist"
  if (availability === "enterprise_only") return locale === "zh" ? "企业专享" : "Enterprise only"
  if (status === "live") return locale === "zh" ? "已上线" : "Live"
  if (status === "beta") return "Beta"
  return locale === "zh" ? "规划中" : "Planned"
}

export function WorkspacePlatformPage({
  locale,
  eyebrow,
  title,
  description,
  items,
  currentUser,
}: {
  locale: "zh" | "en"
  eyebrow: string
  title: string
  description: string
  items: WorkspacePlatformItem[]
  currentUser: boolean
}) {
  const workspaceLabel = locale === "zh" ? "打开工作台" : "Open Workspace"
  const publicLabel = locale === "zh" ? "查看公共入口" : "View Public Entry"

  return (
    <div className="h-full overflow-auto bg-transparent">
      <section className="public-grid-bg mx-auto max-w-7xl px-6 py-10">
        <div className="space-y-8">
          <div className="public-panel rounded-[12px] border border-border bg-card/80 p-6 lg:p-8">
            <div className="public-kicker text-muted-foreground">{eyebrow}</div>
            <h1 className="mt-3 font-display text-4xl font-extrabold uppercase tracking-[0.02em] text-foreground lg:text-5xl">
              {title}
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground lg:text-base">{description}</p>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {items.map((item) => {
              const deferred = isDeferredAvailability(item.availability)
              const deferredCopy = getDeferredEntryCopy(locale, item.availability)
              const workspaceHref = deferred ? item.workspaceHref : item.workspaceLaunchPath || item.workspaceHref
              const publicHref = deferred ? item.publicHref : item.publicLaunchPath || item.publicHref

              return (
                <article key={item.slug} className="dashboard-panel rounded-[12px] border border-border bg-card/85 p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-3">
                      <Badge variant="outline" className="rounded-[4px] border-primary/30 bg-background/70 font-display text-[11px] uppercase tracking-[0.08em]">
                        {getStatusLabel(item.status, item.availability, locale)}
                      </Badge>
                      {item.meta ? <div className="dashboard-kicker text-muted-foreground">{item.meta}</div> : null}
                      <h2 className="font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                        {item.title}
                      </h2>
                    </div>
                  </div>

                  <p className="mt-4 text-sm leading-7 text-muted-foreground">{item.summary}</p>
                  {deferred ? <p className="mt-3 text-xs leading-6 text-muted-foreground">{deferredCopy.inlineLabel}</p> : null}

                  <ul className="mt-5 space-y-2 text-sm text-foreground/85">
                    {item.proofPoints.map((point) => (
                      <li key={point} className="dashboard-chip rounded-[4px] px-3 py-2">
                        {point}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-6 flex flex-wrap gap-3">
                    {workspaceHref ? (
                      <Button className="public-button-primary h-10 px-4" asChild>
                        <Link href={workspaceHref}>{deferred ? deferredCopy.primaryActionLabel : workspaceLabel}</Link>
                      </Button>
                    ) : null}
                    {publicHref ? (
                      <Button className="public-button-secondary h-10 px-4" asChild>
                        <Link href={publicHref}>{deferred ? deferredCopy.secondaryActionLabel : publicLabel}</Link>
                      </Button>
                    ) : null}
                  </div>

                  <RegistryExecutionPanel
                    compact
                    locale={locale}
                    surface="workspace"
                    itemType={item.itemType}
                    slug={item.slug}
                    bindingTarget={item.bindingTarget}
                    runtimeStatus={item.runtimeStatus}
                    availability={item.availability}
                    accessState={item.accessState}
                    currentUser={currentUser}
                    loginHref={workspaceHref}
                  />
                </article>
              )
            })}
          </div>
        </div>
      </section>
    </div>
  )
}
