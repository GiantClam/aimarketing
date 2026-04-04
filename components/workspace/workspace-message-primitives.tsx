"use client"

import type { ReactNode } from "react"

import { TypingIndicator } from "@/components/ui/typing-indicator"
import type { PendingTaskEvent } from "@/lib/assistant-task-events"
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
    <div className={cn("w-full border-b border-border px-4 py-3.5 selection:bg-[#E8E8E8]", toneClass, className)}>
      <div className="mx-auto flex w-full max-w-5xl gap-3">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px]", avatarClass)}>
          {icon ?? <span className="text-xs font-bold">{isUser ? "U" : "AI"}</span>}
        </div>
        <div className="min-w-0 flex-1">
          {(label || action) ? (
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                {label ? <span className="truncate text-[13px] font-medium text-foreground">{label}</span> : null}
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
  showTypingIndicator = true,
}: {
  label: ReactNode
  className?: string
  showTypingIndicator?: boolean
}) {
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {showTypingIndicator ? <TypingIndicator /> : null}
        {label}
      </div>
      <div className="space-y-2">
        <div className="h-2.5 w-11/12 rounded-full bg-muted/70" />
        <div className="h-2.5 w-9/12 rounded-full bg-muted/60" />
        <div className="h-2.5 w-7/12 rounded-full bg-muted/50" />
      </div>
    </div>
  )
}

export function WorkspaceTaskEvents({
  events,
  limit = 4,
  className,
}: {
  events: PendingTaskEvent[]
  limit?: number
  className?: string
}) {
  const recentEvents = events.slice(-Math.max(1, limit))
  if (recentEvents.length === 0) return null

  return (
    <div className={cn("space-y-1.5 pl-6 text-xs", className)} data-testid="workspace-task-events">
      {recentEvents.map((event, eventIndex) => (
        <div
          key={`${event.type}-${event.at}-${eventIndex}`}
          className="flex items-start gap-2"
          data-testid={`workspace-task-event-${event.type}`}
        >
          <span
            className={cn(
              "mt-1.5 h-1.5 w-1.5 rounded-full",
              event.status === "failed"
                ? "bg-destructive"
                : event.status === "completed"
                  ? "bg-emerald-500"
                  : event.status === "running"
                    ? "bg-primary"
                    : "bg-muted-foreground",
            )}
          />
          <span>
            {event.label}
            {event.detail ? <span className="ml-1 text-muted-foreground/80">{event.detail}</span> : null}
          </span>
        </div>
      ))}
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

export function WorkspaceConversationSkeleton({
  rows = 3,
  loadingLabel = "Loading conversation...",
  className,
}: {
  rows?: number
  loadingLabel?: ReactNode
  className?: string
}) {
  const skeletonRows = Array.from({ length: Math.max(1, rows) })

  return (
    <div className={cn("mx-auto flex w-full max-w-5xl flex-col", className)} data-testid="workspace-conversation-skeleton">
      {skeletonRows.map((_, index) => (
        <WorkspaceMessageFrame
          key={`workspace-skeleton-row-${index}`}
          role={index % 2 === 0 ? "assistant" : "user"}
          label={index % 2 === 0 ? "Assistant" : "You"}
        >
          <WorkspaceLoadingMessage
            label={<span className="animate-pulse text-sm text-muted-foreground">{loadingLabel}</span>}
          />
        </WorkspaceMessageFrame>
      ))}
    </div>
  )
}
