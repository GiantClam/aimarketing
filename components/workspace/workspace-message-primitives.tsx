"use client"

import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

type WorkspaceMessageRole = "assistant" | "user" | "system"

type WorkspaceMessageFrameProps = {
  role: WorkspaceMessageRole
  label?: string
  icon?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}

export function WorkspaceMessageFrame({
  role,
  label,
  icon,
  action,
  children,
  className,
  bodyClassName,
}: WorkspaceMessageFrameProps) {
  const isUser = role === "user"
  const toneClass =
    role === "assistant"
      ? "bg-card text-foreground"
      : role === "user"
        ? "bg-background text-foreground"
        : "bg-muted/45 text-foreground"
  const avatarClass =
    role === "assistant"
      ? "bg-accent text-primary"
      : role === "user"
        ? "bg-muted text-foreground"
        : "bg-secondary text-secondary-foreground"

  return (
    <div className={cn("w-full border-b border-border px-5 py-5", toneClass, className)}>
      <div className="mx-auto flex w-full max-w-4xl gap-4">
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px]", avatarClass)}>
          {icon ?? <span className="text-xs font-bold">{isUser ? "U" : "AI"}</span>}
        </div>
        <div className="min-w-0 flex-1">
          {(label || action) ? (
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                {label ? <span className="truncate text-sm font-medium text-foreground">{label}</span> : null}
              </div>
              {action}
            </div>
          ) : null}
          <div className={bodyClassName}>{children}</div>
        </div>
      </div>
    </div>
  )
}

export function WorkspaceLoadingMessage({
  label,
  className,
}: {
  label: ReactNode
  className?: string
}) {
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">{label}</div>
      <div className="space-y-2">
        <div className="h-3 w-11/12 rounded-full bg-muted/70" />
        <div className="h-3 w-9/12 rounded-full bg-muted/60" />
        <div className="h-3 w-7/12 rounded-full bg-muted/50" />
      </div>
    </div>
  )
}

type WorkspaceResultCardProps = {
  tone?: "success" | "neutral"
  icon?: ReactNode
  title: string
  badge?: ReactNode
  description?: ReactNode
  children?: ReactNode
  actions?: ReactNode
  className?: string
}

export function WorkspaceResultCard({
  tone = "neutral",
  icon,
  title,
  badge,
  description,
  children,
  actions,
  className,
}: WorkspaceResultCardProps) {
  return (
    <div
      className={cn(
        "rounded-[24px] border-2 p-6",
        tone === "success"
          ? "border-secondary bg-card"
          : "border-border bg-background",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        {icon ? (
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full",
              tone === "success" ? "bg-secondary text-secondary-foreground" : "bg-primary text-primary-foreground",
            )}
          >
            {icon}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold text-foreground">{title}</h3>
            {badge}
          </div>
          {description ? <div className="mt-2 text-sm leading-7 text-muted-foreground">{description}</div> : null}
        </div>
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
      {actions ? <div className="mt-4 flex flex-wrap gap-3">{actions}</div> : null}
    </div>
  )
}

export function WorkspaceSectionCard({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("space-y-3 rounded-[20px] border-2 border-border bg-background p-4", className)}>
      <div className="space-y-1">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        {description ? <div className="text-xs leading-6 text-muted-foreground">{description}</div> : null}
      </div>
      {children}
    </div>
  )
}

export function WorkspaceActionRow({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn("mt-3 flex flex-wrap items-center gap-2 border-t-2 border-border pt-3", className)}>
      {children}
    </div>
  )
}
