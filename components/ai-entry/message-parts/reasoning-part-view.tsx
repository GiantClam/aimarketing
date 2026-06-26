"use client"

import { useState } from "react"
import { Brain, ChevronDown } from "lucide-react"

import { TypingIndicator } from "@/components/ui/typing-indicator"
import type { ReasoningPart } from "@/lib/ai-entry/message-parts/types"
import { cn } from "@/lib/utils"

export function ReasoningPartView({ part }: { part: ReasoningPart }) {
  const [open, setOpen] = useState(false)
  if (!part.text.trim()) return null
  return (
    <div className="rounded-[10px] border border-border bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground"
      >
        <Brain className="h-3.5 w-3.5" />
        <span>{part.status === "running" ? "Reasoning…" : "Reasoning"}</span>
        {part.status === "running" ? <TypingIndicator /> : null}
        <ChevronDown className={cn("ml-auto h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="whitespace-pre-wrap border-t border-border px-3 py-2 text-xs leading-6 text-muted-foreground">
          {part.text}
        </div>
      ) : null}
    </div>
  )
}
