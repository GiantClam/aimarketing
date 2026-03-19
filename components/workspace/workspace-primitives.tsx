"use client"

import type { ComponentPropsWithoutRef, ReactNode } from "react"
import { ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

type WorkspacePromptGridProps = {
  eyebrow?: string
  prompts: readonly string[]
  onSelect: (prompt: string) => void
  className?: string
  gridClassName?: string
  itemClassName?: string
}

export function WorkspacePromptGrid({
  eyebrow,
  prompts,
  onSelect,
  className,
  gridClassName,
  itemClassName,
}: WorkspacePromptGridProps) {
  return (
    <div className={cn("space-y-3 rounded-[28px] border-2 border-border bg-card p-4", className)}>
      {eyebrow ? (
        <div className="flex items-center gap-2 text-foreground">
          <ChevronRight className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-[0.18em]">{eyebrow}</span>
        </div>
      ) : null}
      <div className={cn("grid gap-2.5", gridClassName)}>
        {prompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onSelect(prompt)}
            className={cn(
              "group rounded-[22px] border-2 border-border bg-background px-4 py-4 text-left transition-colors hover:border-primary hover:bg-primary",
              itemClassName,
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-[12px] leading-6 text-foreground transition group-hover:text-primary-foreground">{prompt}</p>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-primary-foreground" />
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

type WorkspacePromptChipsProps = {
  prompts: readonly string[]
  onSelect: (prompt: string) => void
  className?: string
  chipClassName?: string
}

export function WorkspacePromptChips({
  prompts,
  onSelect,
  className,
  chipClassName,
}: WorkspacePromptChipsProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {prompts.map((prompt) => (
        <button
          key={prompt}
          type="button"
          onClick={() => onSelect(prompt)}
          className={cn(
            "rounded-full border-2 border-border bg-card px-3 py-1.5 text-left text-[11px] text-foreground transition hover:border-primary hover:bg-primary hover:text-primary-foreground",
            chipClassName,
          )}
        >
          {prompt}
        </button>
      ))}
    </div>
  )
}

type WorkspaceComposerPanelProps = {
  toolbar?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
  toolbarClassName?: string
  cardClassName?: string
  bodyClassName?: string
  footerClassName?: string
} & ComponentPropsWithoutRef<"section">

export function WorkspaceComposerPanel({
  toolbar,
  children,
  footer,
  className,
  toolbarClassName,
  cardClassName,
  bodyClassName,
  footerClassName,
  ...props
}: WorkspaceComposerPanelProps) {
  return (
    <section
      {...props}
      className={cn(
        "rounded-[28px] border-2 border-border bg-card p-3",
        className,
      )}
    >
      {toolbar ? <div className={cn("flex flex-wrap items-center gap-2", toolbarClassName)}>{toolbar}</div> : null}
      <div className={cn("rounded-[22px] border-2 border-border bg-background", toolbar ? "mt-3" : "", cardClassName)}>
        <div className={bodyClassName}>{children}</div>
        {footer ? (
          <div
            className={cn(
              "flex items-center justify-between gap-3 border-t-2 border-border px-3.5 py-3",
              footerClassName,
            )}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </section>
  )
}

type WorkspaceEmptyStateProps = {
  icon?: ReactNode
  title: string
  description: string
  checklist?: readonly string[]
  quickStartLabel?: string
  quickPrompts?: readonly string[]
  onSelectPrompt?: (prompt: string) => void
  className?: string
}

export function WorkspaceEmptyState({
  icon,
  title,
  description,
  checklist = [],
  quickStartLabel,
  quickPrompts = [],
  onSelectPrompt,
  className,
}: WorkspaceEmptyStateProps) {
  return (
    <div className={cn("w-full rounded-[32px] border-2 border-border bg-card p-6 lg:p-8", className)}>
      <div className="flex flex-wrap items-start gap-4">
        {icon ? <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-accent text-accent-foreground shadow-sm">{icon}</div> : null}
        <div className="max-w-2xl">
          <h3 className="text-2xl font-semibold text-foreground">{title}</h3>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">{description}</p>
        </div>
      </div>
      {checklist.length ? (
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {checklist.map((item) => (
            <div key={item} className="rounded-[22px] border-2 border-border bg-background px-4 py-4 text-sm leading-6 text-foreground">
              {item}
            </div>
          ))}
        </div>
      ) : null}
      {quickPrompts.length && onSelectPrompt ? (
        <div className={cn(checklist.length ? "mt-6 border-t border-border/70 pt-6" : "mt-6")}>
          {quickStartLabel ? <p className="text-sm font-semibold text-foreground">{quickStartLabel}</p> : null}
          <WorkspacePromptGrid
            prompts={quickPrompts}
            onSelect={onSelectPrompt}
            className="mt-3 border-none bg-transparent p-0 shadow-none"
            gridClassName="lg:grid-cols-3"
            itemClassName="bg-background px-4 py-4"
          />
        </div>
      ) : null}
    </div>
  )
}
