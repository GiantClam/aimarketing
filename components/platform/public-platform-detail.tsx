import Link from "next/link"
import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { getDeferredEntryCopy, getDeferredAvailabilityLabel, isDeferredAvailability } from "@/lib/platform/deferred-entry"
import { localizePublicPath } from "@/lib/i18n/routing"
import type { PlatformDirectoryAvailability } from "@/lib/platform/directory-config"
import { buildPlatformLaunchPath } from "@/lib/platform/launch-path"

type DetailLine = {
  label: string
  value: string
}

export function PublicPlatformDetail({
  locale,
  eyebrow,
  title,
  description,
  status,
  availability,
  extraLabel,
  detailLines,
  proofPoints,
  publicHref,
  workspaceHref,
  launchItemType,
  launchSlug,
  children,
}: {
  locale: "zh" | "en"
  eyebrow: string
  title: string
  description: string
  status: "live" | "beta" | "planned"
  availability?: PlatformDirectoryAvailability
  extraLabel?: string
  detailLines: DetailLine[]
  proofPoints: string[]
  publicHref?: string
  workspaceHref?: string
  launchItemType?: "capability" | "agent" | "plugin" | "mcp_service" | "workflow"
  launchSlug?: string
  children?: ReactNode
}) {
  const copy =
    locale === "zh"
      ? {
          live: "已上线",
          beta: "Beta",
          planned: "规划中",
          openEntry: "打开入口",
          workspace: "企业工作台",
          proof: "运行与落地线索",
          details: "平台详情",
        }
      : {
          live: "Live",
          beta: "Beta",
          planned: "Planned",
          openEntry: "Open Entry",
          workspace: "Workspace",
          proof: "Runtime and rollout signals",
          details: "Platform detail",
        }

  const deferred = isDeferredAvailability(availability)
  const deferredCopy = getDeferredEntryCopy(locale, availability)
  const statusLabel = deferred
    ? getDeferredAvailabilityLabel(locale, availability)
    : status === "live"
      ? copy.live
      : status === "beta"
        ? copy.beta
        : copy.planned

  return (
    <section className="public-grid-bg public-page-hero-shell mx-auto max-w-7xl">
      <div className="workspace-stack">
        <div className="public-panel workspace-hero-panel rounded-[12px] border border-border bg-card/80">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-4xl space-y-4">
              <div className="public-kicker text-muted-foreground">{eyebrow}</div>
              <h1 className="public-display max-w-5xl text-5xl text-foreground lg:text-6xl">{title}</h1>
              <p className="max-w-3xl text-lg leading-8 text-muted-foreground">{description}</p>
            </div>
            <div className="space-y-3">
              <Badge
                variant="outline"
                className="rounded-[4px] border-primary/30 bg-background/75 font-display text-[11px] uppercase tracking-[0.08em]"
              >
                {statusLabel}
              </Badge>
              {extraLabel ? <div className="public-kicker text-muted-foreground">{extraLabel}</div> : null}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {publicHref ? (
              <Button className="public-button-primary h-10 px-4" asChild>
                <Link
                  href={
                    deferred
                      ? localizePublicPath(publicHref, locale)
                      : launchItemType && launchSlug
                        ? buildPlatformLaunchPath({
                            itemType: launchItemType,
                            slug: launchSlug,
                            surface: "public",
                            locale,
                          })
                      : localizePublicPath(publicHref, locale)
                  }
                >
                  {deferred ? deferredCopy.primaryActionLabel : copy.openEntry}
                </Link>
              </Button>
            ) : null}
            {workspaceHref ? (
              <Button className="public-button-secondary h-10 px-4" asChild>
                <Link
                  href={
                    deferred
                      ? workspaceHref
                      : launchItemType && launchSlug
                        ? buildPlatformLaunchPath({
                            itemType: launchItemType,
                            slug: launchSlug,
                            surface: "workspace",
                            locale,
                          })
                      : workspaceHref
                  }
                >
                  {deferred ? deferredCopy.secondaryActionLabel : copy.workspace}
                </Link>
              </Button>
            ) : null}
          </div>
          {deferred ? (
            <div className="mt-6 rounded-[8px] border border-border/70 bg-background/55 p-4">
              <div className="text-sm font-medium text-foreground">{deferredCopy.title}</div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{deferredCopy.body}</p>
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <article className="public-panel rounded-[12px] border border-border bg-card/80 p-6">
            <div className="public-kicker text-muted-foreground">{copy.details}</div>
            <div className="mt-4 space-y-3">
              {detailLines.map((item) => (
                <div key={`${item.label}:${item.value}`} className="dashboard-chip rounded-[4px] px-3 py-3 text-sm text-foreground/85">
                  <span className="font-medium text-foreground">{item.label}:</span> {item.value}
                </div>
              ))}
            </div>
          </article>

          <article className="public-panel rounded-[12px] border border-border bg-card/80 p-6">
            <div className="public-kicker text-muted-foreground">{copy.proof}</div>
            <div className="mt-4 space-y-3">
              {proofPoints.map((point) => (
                <div key={point} className="dashboard-chip rounded-[4px] px-3 py-3 text-sm text-foreground/85">
                  {point}
                </div>
              ))}
            </div>
          </article>
        </div>

        {children}
      </div>
    </section>
  )
}
