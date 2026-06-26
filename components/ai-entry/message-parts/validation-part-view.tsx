"use client"

import { CheckCircle2, XCircle } from "lucide-react"

import type { ValidationPart } from "@/lib/ai-entry/message-parts/types"
import { cn } from "@/lib/utils"

export function ValidationPartView({ part, isZh }: { part: ValidationPart; isZh: boolean }) {
  const ok = part.status === "passed"
  const Icon = ok ? CheckCircle2 : XCircle
  return (
    <div className="rounded-[10px] border border-border bg-muted/20 px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <Icon className={cn("h-3.5 w-3.5", ok ? "text-emerald-500" : "text-destructive")} />
        <span className="font-medium text-foreground">{isZh ? "结果校验" : "Validation"}</span>
        <span className="text-muted-foreground">
          {ok ? (isZh ? "通过" : "Passed") : isZh ? "失败" : "Failed"}
        </span>
      </div>
      {!ok && part.checks.length ? (
        <ul className="mt-1.5 space-y-1 pl-5">
          {part.checks
            .filter((c) => !c.ok)
            .map((c) => (
              <li key={c.code} className="text-muted-foreground">
                {c.message}
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  )
}
