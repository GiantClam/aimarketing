"use client"

import type { ReactNode } from "react"

import { WorkbenchMessageFrame, WorkbenchTaskEvents } from "@coworkany/workbench-ui"

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
  return <WorkbenchMessageFrame role={role} label={label} icon={icon} action={action} className={cn("selection:bg-[#E8E8E8]", className)} bodyClassName={bodyClassName}>{children}</WorkbenchMessageFrame>
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
  return <WorkbenchTaskEvents events={events.map((event) => ({ type: event.type, label: event.label, detail: event.detail, status: event.status }))} limit={limit} className={className} />
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
        "dashboard-panel rounded-[12px] p-6",
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
              "flex h-10 w-10 items-center justify-center rounded-[6px]",
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
    <div className={cn("dashboard-panel space-y-3 rounded-[10px] bg-background p-4", className)}>
      <div className="space-y-1">
        <div className="dashboard-title text-sm text-foreground">{title}</div>
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
    <div className={cn("mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3", className)}>
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
