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
        "overflow-hidden rounded-[32px] border-2 border-border bg-card",
        className,
      )}
    >
      <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:p-8">
        <div className="space-y-4">
          <div className="inline-flex items-center rounded-full bg-primary px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary-foreground">
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
          <div className="inline-flex items-center gap-2 rounded-full border-2 border-border bg-background px-4 py-2 text-sm text-muted-foreground">
            <span className="h-2.5 w-2.5 rounded-full bg-secondary" />
            <span>{status}</span>
          </div>
          {badges.length ? <div className="flex flex-wrap gap-2">{badges}</div> : null}
        </div>

        {(actions || stats.length) ? (
          <div className="rounded-[28px] border-2 border-border bg-background p-4">
            {actions ? <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div> : null}
            {stats.length ? (
              <div className={cn("grid gap-3", actions ? "mt-4" : "")}>
                {stats.map((stat) => (
                  <div key={stat.label} className="rounded-[22px] border-2 border-border bg-card px-4 py-3">
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
