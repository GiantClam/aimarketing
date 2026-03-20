"use client"

import { cn } from "@/lib/utils"

export function WorkspaceConversationHeader({
  title,
  description,
  className,
  variant = "card",
}: {
  title: string
  description: string
  className?: string
  variant?: "card" | "inline"
}) {
  return (
    <section
      className={cn(
        variant === "inline"
          ? "border-b border-border/70 bg-background px-6 py-5 lg:px-7 lg:py-6"
          : "rounded-[24px] border-2 border-border bg-card px-4 py-3 lg:px-5 lg:py-3.5",
        className,
      )}
    >
      <h1
        className={cn(
          "font-semibold tracking-tight text-foreground",
          variant === "inline" ? "text-[1.05rem] font-semibold leading-none tracking-[-0.02em] lg:text-[1.18rem]" : "text-[1.2rem] lg:text-[1.35rem]",
        )}
      >
        {title}
      </h1>
      <p
        className={cn(
          "max-w-4xl text-muted-foreground",
          variant === "inline" ? "mt-1.5 text-[12px] leading-5 text-muted-foreground/90 lg:text-[13px]" : "mt-1 text-[12px] leading-5 lg:text-[13px] lg:leading-6",
        )}
      >
        {description}
      </p>
    </section>
  )
}
