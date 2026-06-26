"use client"

import { useState } from "react"
import { Brain, ChevronDown, Sparkles } from "lucide-react"

import { TypingIndicator } from "@/components/ui/typing-indicator"
import type { ReasoningPart } from "@/lib/ai-entry/message-parts/types"
import { cn } from "@/lib/utils"

export function ReasoningPartView({ part }: { part: ReasoningPart }) {
  const [open, setOpen] = useState(false)
  const text = part.text.trim()
  if (!text) return null
  const preview = text.replace(/\s+/g, " ").slice(0, 120)

  return (
    <div className="process-item">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="process-row transition-colors hover:bg-muted/20"
      >
        <span className="process-label">
          <Brain className="h-3.5 w-3.5 text-primary" />
          <span>Reasoning</span>
        </span>
        <span className="process-value">{preview}</span>
        <span className="process-trailing">
          {part.status === "running" ? <TypingIndicator /> : <Sparkles className="h-3.5 w-3.5 text-primary/70" />}
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open ? <div className="process-panel whitespace-pre-wrap text-xs leading-6 text-muted-foreground">{text}</div> : null}
    </div>
  )
}
