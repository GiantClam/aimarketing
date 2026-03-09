"use client"

import { useCallback, useState } from "react"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism"
import { Check, Copy } from "lucide-react"

import { Button } from "@/components/ui/button"

interface CodeBlockProps {
  language?: string
  children: string
}

export function CodeBlock({ language = "text", children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(children)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [children])

  return (
    <div className="group relative my-3 overflow-hidden rounded-lg">
      <div className="absolute right-2 top-2 z-10 opacity-0 transition-opacity group-hover:opacity-100">
        <Button variant="secondary" size="sm" className="h-8 gap-1.5 bg-background/80 px-2 shadow-sm backdrop-blur-sm" onClick={handleCopy}>
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" />
              <span className="text-xs">已复制</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span className="text-xs">复制代码</span>
            </>
          )}
        </Button>
      </div>
      <SyntaxHighlighter
        language={language}
        style={oneDark}
        customStyle={{
          margin: 0,
          borderRadius: "0.5rem",
          padding: "1rem",
          fontSize: "0.85rem",
          lineHeight: "1.6",
        }}
        showLineNumbers={false}
        wrapLines
      >
        {children}
      </SyntaxHighlighter>
    </div>
  )
}
