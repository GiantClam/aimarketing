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
    <div className="rounded-[10px] border border-border bg-muted/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs"
      >
        <Search className="h-3.5 w-3.5 text-primary" />
        <span className="font-medium text-foreground">{isZh ? "来源" : "Sources"}</span>
        <span className="text-muted-foreground">{parts.length}</span>
        <ChevronDown className={cn("ml-auto h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <ul className="space-y-1.5 border-t border-border px-3 py-2 text-xs">
          {parts.map((s, i) => {
            const host = urlHost(s.url)
            return (
              <li key={s.id} className="flex items-start gap-2">
                <span className="mt-0.5 text-muted-foreground">[{i + 1}]</span>
                <span className="min-w-0 flex-1">
                  <a href={s.url ?? undefined} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground hover:underline">
                    {s.title || s.url}
                  </a>
                  {host ? <span className="ml-1 text-muted-foreground">{host}</span> : null}
                  {s.snippet ? <span className="block text-muted-foreground/80">{s.snippet}</span> : null}
                </span>
                <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          {preview.map((s, i) => (
            <span key={s.id} className="mr-2">
              [{i + 1}] {s.title || s.url}
            </span>
          ))}
          {parts.length > preview.length ? <span>…</span> : null}
        </div>
      )}
    </div>
  )
}
