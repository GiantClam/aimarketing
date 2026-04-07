"use client"

import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type PromptInputContextValue = {
  value: string
  setValue: (next: string) => void
  onSubmit?: () => void
  isLoading: boolean
  disabled: boolean
  maxHeight: number | string
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
}

const PromptInputContext = createContext<PromptInputContextValue | null>(null)

function usePromptInputContext() {
  const context = useContext(PromptInputContext)
  if (!context) {
    throw new Error("Prompt input components must be used within PromptInput")
  }
  return context
}

type PromptInputProps = {
  children: React.ReactNode
  value?: string
  onValueChange?: (value: string) => void
  onSubmit?: () => void
  isLoading?: boolean
  disabled?: boolean
  maxHeight?: number | string
  className?: string
}

function PromptInput({
  children,
  value,
  onValueChange,
  onSubmit,
  isLoading = false,
  disabled = false,
  maxHeight = 240,
  className,
}: PromptInputProps) {
  const [internalValue, setInternalValue] = useState(value ?? "")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (value == null) return
    setInternalValue(value)
  }, [value])

  const setValue = useCallback(
    (nextValue: string) => {
      if (onValueChange) {
        onValueChange(nextValue)
        return
      }
      setInternalValue(nextValue)
    },
    [onValueChange],
  )

  const contextValue = useMemo(
    () => ({
      value: value ?? internalValue,
      setValue,
      onSubmit,
      isLoading,
      disabled,
      maxHeight,
      textareaRef,
    }),
    [value, internalValue, setValue, onSubmit, isLoading, disabled, maxHeight],
  )

  return (
    <PromptInputContext.Provider value={contextValue}>
      <div
        className={cn(
          "cursor-text rounded-3xl border border-input bg-background p-2 shadow-xs",
          className,
        )}
        onClick={() => textareaRef.current?.focus()}
      >
        {children}
      </div>
    </PromptInputContext.Provider>
  )
}

type PromptInputTextareaProps =
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    disableAutosize?: boolean
  }

function PromptInputTextarea({
  className,
  disableAutosize = false,
  onKeyDown,
  ...props
}: PromptInputTextareaProps) {
  const {
    value,
    setValue,
    onSubmit,
    isLoading,
    disabled,
    maxHeight,
    textareaRef,
  } = usePromptInputContext()

  useEffect(() => {
    if (disableAutosize || !textareaRef.current) return
    textareaRef.current.style.height = "auto"
    textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
  }, [value, disableAutosize, textareaRef])

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      if (!isLoading && !disabled) {
        onSubmit?.()
      }
    }
    onKeyDown?.(event)
  }

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={handleKeyDown}
      className={cn(
        "min-h-[44px] w-full resize-none border-none bg-transparent px-2 py-2 text-sm leading-6 text-foreground outline-none focus-visible:ring-0",
        "placeholder:text-muted-foreground",
        className,
      )}
      style={{
        maxHeight: typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight,
      }}
      rows={1}
      disabled={disabled || isLoading}
      {...props}
    />
  )
}

function PromptInputActions({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center justify-between gap-2 p-1", className)}
      {...props}
    >
      {children}
    </div>
  )
}

type PromptInputActionProps = React.ComponentProps<typeof Tooltip> & {
  children: React.ReactNode
  tooltip: React.ReactNode
  side?: "top" | "bottom" | "left" | "right"
  className?: string
}

function PromptInputAction({
  children,
  tooltip,
  side = "top",
  className,
  ...props
}: PromptInputActionProps) {
  const { disabled } = usePromptInputContext()

  return (
    <Tooltip {...props}>
      <TooltipTrigger
        asChild
        disabled={disabled}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side={side} className={className}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

export { PromptInput, PromptInputAction, PromptInputActions, PromptInputTextarea }
