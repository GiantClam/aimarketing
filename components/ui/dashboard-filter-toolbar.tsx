import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export function DashboardFilterToolbar({
  className,
  search,
  filters,
  actions,
  searchClassName,
  filtersClassName,
  actionsClassName,
}: {
  className?: string
  search: ReactNode
  filters: ReactNode
  actions?: ReactNode
  searchClassName?: string
  filtersClassName?: string
  actionsClassName?: string
}) {
  return (
    <div className={cn("flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between", className)}>
      <div className="flex flex-1 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className={cn("min-w-0 flex-1 xl:max-w-[440px]", searchClassName)}>{search}</div>
        <div className={cn("flex flex-col gap-3 sm:flex-row sm:flex-wrap xl:justify-end", filtersClassName)}>{filters}</div>
      </div>
      {actions ? <div className={cn("flex items-center gap-2", actionsClassName)}>{actions}</div> : null}
    </div>
  )
}
