"use client"

import { cn } from "@/lib/utils"

export function TextMorph({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  return (
    <span
      key={text}
      className={cn(
        "inline-flex animate-in fade-in-0 zoom-in-95 duration-150",
        className,
      )}
    >
      {text}
    </span>
  )
}

