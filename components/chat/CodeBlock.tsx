"use client"

import { useCallback, useMemo, useState } from "react"
import { Check, Copy } from "lucide-react"
import { useTheme } from "next-themes"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism"

import { Button } from "@/components/ui/button"
import { useI18n } from "@/components/locale-provider"
import { TextMorph } from "@/components/ui/text-morph"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface CodeBlockProps {
  language?: string
  children: string
}

export function CodeBlock({ language = "text", children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const { resolvedTheme } = useTheme()
  const { locale } = useI18n()
  const syntaxTheme = useMemo(() => (resolvedTheme === "dark" ? oneDark : oneLight), [resolvedTheme])
  const isZh = locale === "zh"

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(children)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }, [children])

  return (
    <TooltipProvider>
      <div className="group relative my-3 overflow-hidden rounded-xl border-2 border-border bg-card/70">
        <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {language}
          </span>
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
        <SyntaxHighlighter
          language={language}
          style={syntaxTheme}
          customStyle={{
            margin: 0,
            borderRadius: 0,
            padding: "0.95rem 1rem",
            fontSize: "0.82rem",
            lineHeight: "1.55",
            background: "transparent",
          }}
          showLineNumbers={false}
          wrapLines
          wrapLongLines
        >
          {children}
        </SyntaxHighlighter>
      </div>
    </TooltipProvider>
  )
}
