"use client"

import { memo } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { CodeBlock } from "@/components/chat/CodeBlock"
import { cn } from "@/lib/utils"

type MarkdownProps = {
  children: string
  className?: string
}

function MarkdownComponent({ children, className }: MarkdownProps) {
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none break-words text-inherit",
        "prose-headings:my-3 prose-headings:font-semibold",
        "prose-p:my-2 first:prose-p:mt-0 last:prose-p:mb-0",
        "prose-ul:my-2 prose-ol:my-2 prose-li:my-1",
        "prose-code:rounded prose-code:bg-accent/15 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-inherit",
        "prose-pre:my-0 prose-pre:bg-transparent prose-pre:p-0",
        "prose-blockquote:border-l-2 prose-blockquote:border-primary/40 prose-blockquote:bg-muted/30 prose-blockquote:py-0.5 prose-blockquote:not-italic",
        "prose-table:text-xs prose-th:border prose-th:border-border prose-th:px-2 prose-th:py-1 prose-td:border prose-td:border-border prose-td:px-2 prose-td:py-1",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children, ...props }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                {children}
              </a>
            )
          },
          code({ className: codeClassName, children: codeChildren, ...props }) {
            const match = /language-(\w+)/.exec(codeClassName || "")
            const code = String(codeChildren).replace(/\n$/, "")

            if (!match && !codeClassName) {
              return (
                <code className={codeClassName} {...props}>
                  {codeChildren}
                </code>
              )
            }

            return <CodeBlock language={match?.[1] || "text"}>{code}</CodeBlock>
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}

export const Markdown = memo(MarkdownComponent)
Markdown.displayName = "Markdown"
