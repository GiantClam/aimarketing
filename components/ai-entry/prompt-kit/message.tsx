"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

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
    <Avatar className={cn("h-8 w-8 shrink-0 border border-border", className)}>
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
}

function MessageContent({
  children,
  markdown = false,
  role = "assistant",
  className,
}: MessageContentProps) {
  const bubbleClassName =
    role === "assistant"
      ? "border-2 border-border bg-card text-foreground"
      : "border-2 border-primary bg-primary text-primary-foreground"

  if (markdown) {
    return (
      <Markdown
        className={cn(
          "rounded-2xl px-4 py-3 leading-7",
          bubbleClassName,
          role === "assistant"
            ? "prose-a:text-foreground"
            : "prose-a:text-primary-foreground",
          className,
        )}
      >
        {typeof children === "string" ? children : String(children)}
      </Markdown>
    )
  }

  return (
    <div
      className={cn(
        "rounded-2xl px-4 py-3 text-sm leading-7",
        bubbleClassName,
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
