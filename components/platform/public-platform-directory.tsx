import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getDeferredEntryCopy, isDeferredAvailability } from "@/lib/platform/deferred-entry"
import { localizePublicPath } from "@/lib/i18n/routing"
import type { PlatformDirectoryAvailability } from "@/lib/platform/directory-registry"
import { buildPlatformLaunchPath } from "@/lib/platform/launch-path"
import { cn } from "@/lib/utils"

type PublicPlatformDirectoryItem = {
  slug: string
  status: "live" | "beta" | "planned"
  availability?: PlatformDirectoryAvailability
  title: string
  summary: string
  proofPoints: string[]
  publicHref?: string
  workspaceHref?: string
  detailHref?: string
  extraLabel?: string
  launchItemType?: "capability" | "agent" | "plugin" | "mcp_service" | "workflow"
}

function getStatusLabel(
  status: PublicPlatformDirectoryItem["status"],
  availability: PublicPlatformDirectoryItem["availability"],
  locale: "zh" | "en",
) {
  if (availability === "available") return locale === "zh" ? "已开放" : "Available"
  if (availability === "coming_soon") return locale === "zh" ? "即将开放" : "Coming soon"
  if (availability === "waitlist") return locale === "zh" ? "等待名单" : "Waitlist"
  if (availability === "enterprise_only") return locale === "zh" ? "企业专享" : "Enterprise only"
  if (status === "live") return locale === "zh" ? "已上线" : "Live"
  if (status === "beta") return locale === "zh" ? "Beta" : "Beta"
  return locale === "zh" ? "规划中" : "Planned"
}

export function PublicPlatformDirectory({
  locale,
  eyebrow,
  title,
  description,
  items,
}: {
  locale: "zh" | "en"
  eyebrow: string
  title: string
  description: string
  items: PublicPlatformDirectoryItem[]
}) {
  const openLabel = locale === "zh" ? "打开入口" : "Open Entry"
  const workspaceLabel = locale === "zh" ? "企业工作台" : "Workspace"
  const detailsLabel = locale === "zh" ? "查看详情" : "View Details"

  return (
    <section className="public-grid-bg mx-auto max-w-7xl px-6 py-16 lg:py-20">
      <div className="space-y-8">
        <div className="max-w-4xl space-y-4">
          <div className="public-kicker text-muted-foreground">{eyebrow}</div>
          <h1 className="public-display max-w-5xl text-5xl text-foreground lg:text-6xl">{title}</h1>
          <p className="max-w-3xl text-lg leading-8 text-muted-foreground">{description}</p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((item) => {
            const deferred = isDeferredAvailability(item.availability)
            const deferredCopy = getDeferredEntryCopy(locale, item.availability)
            const publicHref = deferred
              ? (item.publicHref ? localizePublicPath(item.publicHref, locale) : undefined)
              : item.launchItemType
                ? buildPlatformLaunchPath({
                    itemType: item.launchItemType,
                    slug: item.slug,
                    surface: "public",
                    locale,
                  })
                : (item.publicHref ? localizePublicPath(item.publicHref, locale) : undefined)
            const workspaceHref = deferred
              ? item.workspaceHref
              : item.launchItemType
                ? buildPlatformLaunchPath({
                    itemType: item.launchItemType,
                    slug: item.slug,
                    surface: "workspace",
                    locale,
                  })
                : item.workspaceHref

            return (
              <article key={item.slug} className="public-panel rounded-[12px] border border-border bg-card/80 p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-3">
                    <Badge variant="outline" className="rounded-[4px] border-primary/30 bg-background/75 font-display text-[11px] uppercase tracking-[0.08em]">
                      {getStatusLabel(item.status, item.availability, locale)}
                    </Badge>
                    {item.extraLabel ? (
                      <div className="public-kicker text-muted-foreground">{item.extraLabel}</div>
                    ) : null}
                    <h2 className="font-display text-3xl font-extrabold uppercase tracking-[0.02em] text-foreground">{item.title}</h2>
                  </div>
                </div>

                <p className="mt-4 text-sm leading-7 text-muted-foreground">{item.summary}</p>
                {deferred ? <p className="mt-3 text-xs leading-6 text-muted-foreground">{deferredCopy.inlineLabel}</p> : null}

                <div className="mt-5 flex flex-wrap gap-2">
                  {item.proofPoints.map((point) => (
                    <span
                      key={point}
                      className="public-system-chip rounded-[4px] px-3 py-2 text-xs leading-5 text-muted-foreground"
                    >
                      {point}
                    </span>
                  ))}
                </div>

                <div className={cn("mt-6 flex flex-wrap gap-3", !item.workspaceHref && !item.publicHref && !item.detailHref && "hidden")}>
                  {item.detailHref ? (
                    <Button className="public-button-secondary h-10 px-4" asChild>
                      <Link href={localizePublicPath(item.detailHref, locale)}>{detailsLabel}</Link>
                    </Button>
                  ) : null}
                  {publicHref ? (
                    <Button className="public-button-primary h-10 px-4" asChild>
                      <Link href={publicHref}>{deferred ? deferredCopy.primaryActionLabel : openLabel}</Link>
                    </Button>
                  ) : null}
                  {workspaceHref ? (
                    <Button className="public-button-secondary h-10 px-4" asChild>
                      <Link href={workspaceHref}>{deferred ? deferredCopy.secondaryActionLabel : workspaceLabel}</Link>
                    </Button>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
