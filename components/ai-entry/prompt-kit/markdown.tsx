"use client"

import { memo } from "react"
import type { ReactNode } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { ChevronRight, FileText, Quote } from "lucide-react"

import { CodeBlock } from "@/components/chat/CodeBlock"
import { cn } from "@/lib/utils"

type MarkdownProps = {
  children: string
  className?: string
}

const FILE_EXTENSIONS = new Set([
  "pdf",
  "ppt",
  "pptx",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "csv",
  "txt",
  "md",
  "markdown",
  "json",
  "zip",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "svg",
  "html",
  "htm",
])

function stringifyChildren(children: ReactNode): string {
  if (typeof children === "string") return children
  if (Array.isArray(children)) return children.map((child) => stringifyChildren(child)).join("")
  if (typeof children === "number" || typeof children === "boolean") return String(children)
  if (children && typeof children === "object" && "props" in children) {
    const props = children.props as { children?: ReactNode }
    return stringifyChildren(props.children)
  }
  return ""
}

function getFileNameFromPath(pathname: string): string {
  const decoded = decodeURIComponent(pathname)
  return decoded.split(/[\\/]/).filter(Boolean).at(-1) || ""
}

function getFileExtension(value: string): string {
  const name = value.split("?")[0].split("#")[0]
  const lastDot = name.lastIndexOf(".")
  if (lastDot < 0) return ""
  return name.slice(lastDot + 1).toLowerCase()
}

function buildFileLinkMeta(href: string | undefined, label: string) {
  if (!href) return null
  const trimmed = href.trim()
  if (!trimmed) return null
  let parsedUrl: URL
  try {
    parsedUrl = new URL(trimmed, "https://placeholder.local")
  } catch {
    return null
  }
  const isHttp = parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:"
  const pathname = parsedUrl.pathname || ""
  const queryName =
    parsedUrl.searchParams.get("filename") ||
    parsedUrl.searchParams.get("file") ||
    parsedUrl.searchParams.get("name") ||
    parsedUrl.searchParams.get("download") ||
    ""
  const labelName = label.trim()
  const fileName = labelName && labelName !== href ? labelName : getFileNameFromPath(queryName || pathname)
  const extension = getFileExtension(fileName || pathname || queryName)
  const looksLikeFile =
    FILE_EXTENSIONS.has(extension) ||
    /(^|\/)(files?|attachments?|downloads?|artifacts?)(\/|$)/i.test(pathname) ||
    Boolean(queryName)

  if (!looksLikeFile) return null

  return {
    fileName: fileName || getFileNameFromPath(pathname) || parsedUrl.hostname || "FILE",
    extension: extension ? extension.toUpperCase() : "FILE",
    host: isHttp ? parsedUrl.hostname : null,
  }
}

function FileLinkCard({
  href,
  title,
  description,
}: {
  href: string
  title: string
  description?: string
}) {
  return (
    <a
      href={href}
      target={href.startsWith("/") ? undefined : "_blank"}
      rel={href.startsWith("/") ? undefined : "noopener noreferrer"}
      className="not-prose my-2 flex items-start gap-3 rounded-[12px] border border-border/80 bg-background/70 px-3 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-primary/5"
    >
      <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-border bg-muted/60 text-primary">
        <FileText className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          <span className="truncate">{title}</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </span>
        <span className="mt-0.5 block text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          {description || href}
        </span>
      </span>
    </a>
  )
}

function InlineImageCard({
  src,
  alt,
  title,
}: {
  src?: string
  alt?: string
  title?: string
}) {
  if (!src) return null
  return (
    <figure className="not-prose my-3 overflow-hidden rounded-[14px] border border-border bg-background/60 shadow-sm">
      <img src={src} alt={alt || title || "image"} className="max-h-[520px] w-full object-contain" />
      {(title || alt) ? (
        <figcaption className="border-t border-border/70 px-3 py-2 text-xs text-muted-foreground">
          {title || alt}
        </figcaption>
      ) : null}
    </figure>
  )
}

function CalloutBlockquote({ children }: { children: ReactNode }) {
  return (
    <blockquote className="not-prose my-3 rounded-[12px] border border-border bg-muted/35 px-4 py-3">
      <div className="flex items-start gap-2 text-sm text-muted-foreground">
        <Quote className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </blockquote>
  )
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
        "prose-blockquote:my-0 prose-blockquote:border-0 prose-blockquote:bg-transparent prose-blockquote:p-0 prose-blockquote:not-italic",
        "prose-table:text-xs prose-table:overflow-hidden prose-th:border prose-th:border-border prose-th:px-2 prose-th:py-1 prose-td:border prose-td:border-border prose-td:px-2 prose-td:py-1",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children, ...props }) {
            const label = stringifyChildren(children) || href || "link"
            const fileLink = buildFileLinkMeta(href, label)
            if (fileLink && href) {
              return <FileLinkCard href={href} title={fileLink.fileName} description={fileLink.host ? `${fileLink.extension} · ${fileLink.host}` : fileLink.extension} />
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                {children}
              </a>
            )
          },
          img({ src, alt, title }) {
            return typeof src === "string" ? <InlineImageCard src={src} alt={alt} title={title} /> : null
          },
          blockquote({ children }) {
            return <CalloutBlockquote>{children}</CalloutBlockquote>
          },
          table({ children }) {
            return (
              <div className="not-prose my-3 overflow-x-auto rounded-[12px] border border-border bg-background/70">
                <table className="w-full border-collapse text-xs">{children}</table>
              </div>
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
