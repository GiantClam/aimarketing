"use client"

import { useState } from "react"
import { ChevronDown, ExternalLink, Search } from "lucide-react"

import type { SourcePart } from "@/lib/ai-entry/message-parts/types"
import { cn } from "@/lib/utils"

function urlHost(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

export function SourcesPartView({ parts, isZh }: { parts: SourcePart[]; isZh: boolean }) {
  const [open, setOpen] = useState(false)
  if (!parts.length) return null
  const preview = parts.slice(0, 2)

  return (
    <div className="references-block overflow-hidden rounded-[10px] border border-[#e8e6dd] bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="references-row transition-colors hover:bg-muted/20"
      >
        <Search className="h-3.5 w-3.5 text-primary" />
        <span className="font-medium text-foreground">{isZh ? "参考资料" : "References"}</span>
        <span className="text-muted-foreground">{`(${parts.length})`}</span>
        <ChevronDown className={cn("ml-auto h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <ul className="space-y-2 border-t border-[#eeece4] px-3 py-3 text-xs">
          {parts.map((s, i) => {
            const host = urlHost(s.url)
            return (
              <li key={s.id} className="rounded-[10px] border border-border bg-muted/20 px-3 py-2">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 rounded-full border border-border bg-background/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    [{i + 1}]
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {s.url ? (
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground hover:underline">
                          {s.title || s.url}
                        </a>
                      ) : (
                        <span className="font-medium text-foreground">{s.title || (isZh ? "文档来源" : "Document source")}</span>
                      )}
                      {s.sourceType === "document" ? (
                        <span className="rounded-full border border-border bg-background/70 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                          document
                        </span>
                      ) : null}
                    </div>
                    {host ? <div className="mt-0.5 text-[11px] text-muted-foreground">{host}</div> : null}
                    {s.snippet ? <p className="mt-1 text-muted-foreground/80">{s.snippet}</p> : null}
                  </div>
                  {s.url ? <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="border-t border-[#eeece4] px-3 py-2 text-xs text-muted-foreground">
          {preview.map((s, i) => (
            <span key={s.id} className="mr-3 inline-flex items-center gap-1">
              <span className="rounded-full border border-border bg-background/70 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                [{i + 1}]
              </span>
              <span className="truncate">{s.title || s.url}</span>
            </span>
          ))}
          {parts.length > preview.length ? <span>…</span> : null}
        </div>
      )}
    </div>
  )
}
