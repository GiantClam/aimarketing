"use client"

import { cn } from "@/lib/utils"

function Dot({
  delayMs,
}: {
  delayMs: number
}) {
  return (
    <span
      className={cn(
        "h-1.5 w-1.5 rounded-full bg-primary/70 [animation:typing-dot_900ms_ease-in-out_infinite]",
      )}
      style={{ animationDelay: `${delayMs}ms` }}
      aria-hidden="true"
    />
  )
}

export function TypingIndicator({
  className,
}: {
  className?: string
}) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)} role="status" aria-label="Typing">
      <Dot delayMs={0} />
      <Dot delayMs={120} />
      <Dot delayMs={240} />
    </span>
  )
}

