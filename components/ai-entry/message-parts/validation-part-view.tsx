"use client"

import { useState } from "react"
import { CheckCircle2, XCircle } from "lucide-react"

import type { ValidationPart } from "@/lib/ai-entry/message-parts/types"
import { cn } from "@/lib/utils"

export function ValidationPartView({ part, isZh }: { part: ValidationPart; isZh: boolean }) {
  const [open, setOpen] = useState(part.status !== "passed")
  const ok = part.status === "passed"
  const Icon = ok ? CheckCircle2 : XCircle
  const failedChecks = part.checks.filter((c) => !c.ok)

  return (
    <div className="process-item">
      <button type="button" className="process-row" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className="process-label">
          <Icon className={cn("h-3.5 w-3.5", ok ? "text-emerald-600" : "text-destructive")} />
          <span>{isZh ? "结果校验" : "Validation"}</span>
        </span>
        <span className={cn("process-value", ok && "process-success")}>
          {ok ? (isZh ? "通过" : "Passed") : isZh ? "需要处理校验问题" : "Needs attention"}
        </span>
        <span className="process-trailing">
          {!ok ? <XCircle className="h-3.5 w-3.5 text-destructive" /> : null}
        </span>
      </button>
      {!ok && failedChecks.length && open ? (
        <ul className="process-panel space-y-1 pl-5">
          {failedChecks.map((c) => (
            <li key={c.code} className="text-xs text-muted-foreground">
              {c.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
