"use client"

import { forwardRef } from "react"

import { cn } from "@/lib/utils"

type ChatContainerRootProps = React.HTMLAttributes<HTMLDivElement>

const ChatContainerRoot = forwardRef<HTMLDivElement, ChatContainerRootProps>(
  ({ children, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("flex min-h-0 flex-1 overflow-y-auto", className)}
        role="log"
        {...props}
      >
        {children}
      </div>
    )
  },
)

ChatContainerRoot.displayName = "ChatContainerRoot"

function ChatContainerContent({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex w-full flex-col", className)} {...props}>
      {children}
    </div>
  )
}

const ChatContainerScrollAnchor = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn("h-px w-full shrink-0 scroll-mt-4", className)}
      aria-hidden="true"
      {...props}
    />
  )
})

ChatContainerScrollAnchor.displayName = "ChatContainerScrollAnchor"

export { ChatContainerContent, ChatContainerRoot, ChatContainerScrollAnchor }
