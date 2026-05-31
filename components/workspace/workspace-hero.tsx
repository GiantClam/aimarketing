"use client"

import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

type WorkspaceHeroStat = {
  label: string
  value: string
}

type WorkspaceHeroProps = {
  eyebrow: string
  title: string
  description: string
  status: string
  badges?: ReactNode[]
  stats?: WorkspaceHeroStat[]
  actions?: ReactNode
  className?: string
}

export function WorkspaceHero({
  eyebrow,
  title,
  description,
  status,
  badges = [],
  stats = [],
  actions,
  className,
}: WorkspaceHeroProps) {
  return (
    <section
      className={cn(
        "dashboard-panel overflow-hidden rounded-[10px] border border-border bg-card",
        className,
      )}
    >
      <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:p-8">
        <div className="space-y-4">
          <div className="dashboard-kicker inline-flex items-center rounded-[4px] border border-primary/30 bg-primary px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary-foreground">
            {eyebrow}
          </div>
          <div className="max-w-3xl space-y-3">
            <h1 className="text-[2rem] font-semibold tracking-tight text-foreground lg:text-[2.35rem]">
              {title}
            </h1>
            <p className="max-w-2xl text-sm leading-7 text-muted-foreground lg:text-[15px]">
              {description}
            </p>
          </div>
          <div className="dashboard-panel inline-flex items-center gap-2 rounded-[4px] border border-border bg-background px-4 py-2 text-sm text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-[2px] bg-secondary" />
            <span>{status}</span>
          </div>
          {badges.length ? <div className="flex flex-wrap gap-2">{badges}</div> : null}
        </div>

        {(actions || stats.length) ? (
          <div className="dashboard-panel rounded-[8px] border border-border bg-background p-4">
            {actions ? <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div> : null}
            {stats.length ? (
              <div className={cn("grid gap-3", actions ? "mt-4" : "")}>
                {stats.map((stat) => (
                  <div key={stat.label} className="dashboard-panel rounded-[6px] border border-border bg-card px-4 py-3 shadow-none">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {stat.label}
                    </p>
                    <p className="mt-2 text-lg font-semibold text-foreground">{stat.value}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
