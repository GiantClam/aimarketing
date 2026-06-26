"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { MessagePart } from "@/lib/ai-entry/message-parts/types"
import { cn } from "@/lib/utils"

import { MessagePartViewList } from "../message-parts/message-part-view"
import { Markdown } from "./markdown"

type MessageProps = React.HTMLAttributes<HTMLDivElement>

function Message({ children, className, ...props }: MessageProps) {
  return (
    <div className={cn("flex gap-3", className)} {...props}>
      {children}
    </div>
  )
}

type MessageAvatarProps = {
  src?: string
  alt: string
  fallback?: string
  className?: string
}

function MessageAvatar({ src, alt, fallback, className }: MessageAvatarProps) {
  return (
    <Avatar className={cn("h-8 w-8 shrink-0 rounded-[6px] border border-border", className)}>
      {src ? <AvatarImage src={src} alt={alt} /> : null}
      <AvatarFallback>{fallback || alt.slice(0, 1)}</AvatarFallback>
    </Avatar>
  )
}

type MessageContentProps = {
  children: React.ReactNode
  markdown?: boolean
  role?: "assistant" | "user"
  className?: string
  bare?: boolean
  isZh?: boolean
  parts?: MessagePart[]
}

function MessageContent({
  children,
  markdown = false,
  role = "assistant",
  className,
  bare = false,
  isZh = false,
  parts,
}: MessageContentProps) {
  const bubbleClassName =
    role === "assistant"
      ? "dashboard-panel rounded-[10px] border border-border bg-card text-foreground"
      : "rounded-[10px] border border-primary bg-primary text-primary-foreground"
  const content = typeof children === "string" ? children : String(children)

  if (markdown) {
    const markdownNode = (
      <Markdown
        className={cn(
          bare ? "leading-7" : "px-4 py-3 leading-7",
          !parts?.length && !bare && bubbleClassName,
          role === "assistant"
            ? "prose-a:text-foreground"
            : "prose-a:text-primary-foreground",
          className,
        )}
      >
        {content}
      </Markdown>
    )

    if (!parts?.length) {
      return markdownNode
    }

    return (
      <div className={cn(!bare && bubbleClassName, className)}>
        {markdownNode}
        <div className={cn(bare ? "pt-3" : "px-4 pb-4")}>
          <MessagePartViewList parts={parts} isZh={isZh} />
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        bare ? "text-sm leading-7" : "px-4 py-3 text-sm leading-7",
        !bare && bubbleClassName,
        className,
      )}
    >
      {children}
    </div>
  )
}

type MessageActionsProps = React.HTMLAttributes<HTMLDivElement>

function MessageActions({ children, className, ...props }: MessageActionsProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 text-xs text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

type MessageActionProps = React.ComponentProps<typeof Tooltip> & {
  children: React.ReactNode
  tooltip: React.ReactNode
  side?: "top" | "bottom" | "left" | "right"
  className?: string
}

function MessageAction({
  children,
  tooltip,
  side = "top",
  className,
  ...props
}: MessageActionProps) {
  return (
    <Tooltip {...props}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className={className}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

export { Message, MessageAction, MessageActions, MessageAvatar, MessageContent }
