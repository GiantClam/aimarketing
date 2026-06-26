"use client"

import { Fragment, useCallback, useState } from "react"
import { Check, Copy } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/components/locale-provider"
import { TextMorph } from "@/components/ui/text-morph"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface CodeBlockProps {
  language?: string
  children: string
  fileName?: string
  caption?: string
  showLineNumbers?: boolean
}

export function CodeBlock({
  language = "text",
  children,
  fileName,
  caption,
  showLineNumbers = true,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const { locale } = useI18n()
  const isZh = locale === "zh"
  const normalizedCode = children.replace(/\n$/, "")
  const lines = normalizedCode.split("\n")
  const lineCount = Math.max(1, lines.length)
  const headerLabel = fileName || language

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(normalizedCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }, [normalizedCode])

  return (
    <TooltipProvider>
      <div className="group relative my-3 overflow-hidden rounded-[14px] border border-border bg-card/80 shadow-sm">
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {headerLabel}
            </span>
            <span className="rounded-full border border-border bg-background/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {lineCount} lines
            </span>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                onClick={handleCopy}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                <TextMorph text={copied ? (isZh ? "已复制" : "Copied") : isZh ? "复制" : "Copy"} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{copied ? (isZh ? "已复制到剪贴板" : "Copied to clipboard") : isZh ? "复制代码" : "Copy code"}</TooltipContent>
          </Tooltip>
        </div>
        <pre className="overflow-x-auto bg-slate-950/95 px-0 py-4 text-[0.82rem] leading-[1.55] text-slate-100">
          <code className="block min-w-full">
            {lines.map((line, index) => (
              <Fragment key={`${index}:${line}`}>
                <span className="grid grid-cols-[auto_1fr] gap-4 px-4">
                  {showLineNumbers ? (
                    <span className="select-none text-right text-[11px] text-slate-400/80">
                      {index + 1}
                    </span>
                  ) : null}
                  <span className="whitespace-pre-wrap break-words">{line || " "}</span>
                </span>
                {index < lines.length - 1 ? "\n" : null}
              </Fragment>
            ))}
          </code>
        </pre>
        {caption ? <div className="border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">{caption}</div> : null}
      </div>
    </TooltipProvider>
  )
}
