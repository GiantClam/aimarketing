import type { ReactNode } from "react"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { CompactCardBadge } from "@/lib/workspace/compact-business-card"

type CompactBusinessCardProps = {
  title: string
  summary: string
  status: CompactCardBadge | null
  actionLabel: string
  href?: string
  onClick?: () => void
  media?: ReactNode
  className?: string
}

const badgeToneClassNames: Record<NonNullable<CompactBusinessCardProps["status"]>["tone"], string> = {
  neutral: "border-border bg-background/70 text-foreground",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
}

export function CompactBusinessCard({
  title,
  summary,
  status,
  actionLabel,
  href,
  onClick,
  media,
  className,
}: CompactBusinessCardProps) {
  const action = href ? (
    <Button asChild size="sm" className="px-3 text-xs">
      <Link href={href}>{actionLabel}</Link>
    </Button>
  ) : (
    <Button type="button" size="sm" className="px-3 text-xs" onClick={onClick}>
      {actionLabel}
    </Button>
  )

  return (
    <article
      className={cn(
        "dashboard-panel workspace-card-panel flex h-full flex-col rounded-[14px] border border-border bg-card/90 p-4",
        className,
      )}
    >
      {media ? <div className="mb-3 overflow-hidden rounded-[10px]">{media}</div> : null}
      <div className="flex items-start justify-between gap-3">
        <h3 className="line-clamp-2 font-display text-xl font-extrabold uppercase tracking-[0.01em] text-foreground">
          {title}
        </h3>
        {status ? (
          <Badge
            variant="outline"
            className={cn(
              "rounded-[4px] px-2 py-1 font-display text-[11px] font-bold uppercase tracking-[0.08em]",
              badgeToneClassNames[status.tone],
            )}
          >
            {status.label}
          </Badge>
        ) : null}
      </div>
      <p className="mt-2 line-clamp-1 text-sm text-muted-foreground">{summary}</p>
      <div className="mt-auto pt-4">{action}</div>
    </article>
  )
}
