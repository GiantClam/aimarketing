"use client"

import type { MouseEvent as ReactMouseEvent, ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import Link from "next/link"
import { ChevronDown, ChevronRight, Loader2, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type SidebarSectionToggleProps = {
  title: string
  icon: LucideIcon | React.ComponentType<any>
  expanded: boolean
  onToggle: () => void
}

export function SidebarSectionToggle({
  title,
  icon: Icon,
  expanded,
  onToggle,
}: SidebarSectionToggleProps) {
  return (
    <Button
      variant="ghost"
      className={cn(
        "box-border h-11 w-full min-w-0 justify-between rounded-[18px] border-2 border-sidebar-border bg-card px-3 text-sidebar-foreground transition hover:bg-primary hover:text-primary-foreground",
        expanded && "bg-primary text-primary-foreground",
      )}
      size="sm"
      onClick={onToggle}
    >
      <div className="flex items-center">
        <Icon className="mr-2 h-4 w-4" />
        {title}
      </div>
      {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
    </Button>
  )
}

export function SidebarSectionBody({ children }: { children: ReactNode }) {
  return <div className="mt-2.5 w-full min-w-0 space-y-2 overflow-hidden">{children}</div>
}

type SidebarCreateLinkProps = {
  href: string
  label: string
  testId?: string
  loading?: boolean
  disabled?: boolean
  onClick?: (event: ReactMouseEvent<HTMLButtonElement>) => void
}

export function SidebarCreateLink({ href, label, testId, loading, disabled, onClick }: SidebarCreateLinkProps) {
  const button = (
    <Button
      variant="ghost"
      className="box-border h-9 w-full min-w-0 justify-start overflow-hidden rounded-[18px] border-0 bg-sidebar-accent px-3 text-xs font-medium text-sidebar-foreground hover:bg-primary hover:text-primary-foreground"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
    >
      {loading ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Plus className="mr-2 h-3 w-3" />}
      {label}
    </Button>
  )

  if (onClick) {
    return button
  }

  return <Link href={href}>{button}</Link>
}

export function SidebarListState({
  loading,
  label,
}: {
  loading?: boolean
  label: string
}) {
  return (
    <div className="box-border flex w-full min-w-0 items-center overflow-hidden rounded-[18px] bg-sidebar-accent px-3 py-2.5 text-xs text-muted-foreground">
      {loading ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
      {label}
    </div>
  )
}

type SidebarSessionLinkProps = {
  href: string
  active: boolean
  onWarm?: () => void
  testId?: string
  children: ReactNode
}

export function SidebarSessionLink({
  href,
  active,
  onWarm,
  testId,
  children,
}: SidebarSessionLinkProps) {
  return (
    <Link href={href} onMouseEnter={onWarm} data-testid={testId} className="block w-full min-w-0 max-w-full overflow-hidden">
      <div
        className={cn(
          "group relative box-border w-full min-w-0 max-w-full overflow-hidden rounded-[18px] px-3 py-2.5 text-xs transition-colors",
          active
            ? "bg-primary text-primary-foreground"
            : "bg-sidebar-accent text-sidebar-foreground hover:bg-primary hover:text-primary-foreground",
        )}
      >
        {children}
      </div>
    </Link>
  )
}

type SidebarSessionRowProps = {
  active: boolean
  leading: ReactNode
  title: string
  subtitle?: string
  actions?: ReactNode
}

export function SidebarSessionRow({
  active,
  leading,
  title,
  subtitle,
  actions,
}: SidebarSessionRowProps) {
  return (
    <div className={cn("relative flex w-full min-w-0 max-w-full items-center gap-2.5 overflow-hidden", actions && "pr-10")}>
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        {leading}
        <div className="min-w-0 flex-1">
          <div className={cn("truncate text-[12px] leading-5", active && "font-semibold")}>{title}</div>
          {subtitle ? <div className="truncate text-[10px] leading-4 opacity-70">{subtitle}</div> : null}
        </div>
      </div>
      {actions ? <div className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">{actions}</div> : null}
    </div>
  )
}
