"use client"

import { ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function ScrollToBottomButton({
  visible,
  onClick,
  className,
  ariaLabel = "Scroll to latest message",
}: {
  visible: boolean
  onClick: () => void
  className?: string
  ariaLabel?: string
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={cn(
        "h-10 w-10 rounded-full border-2 border-border bg-card shadow-md transition-all duration-150 ease-out",
        visible
          ? "translate-y-0 scale-100 opacity-100"
          : "pointer-events-none translate-y-3 scale-95 opacity-0",
        className,
      )}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      <ChevronDown className="h-5 w-5" />
    </Button>
  )
}
