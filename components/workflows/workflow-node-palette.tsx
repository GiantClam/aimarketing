"use client"

import { cn } from "@/lib/utils"
import { getDefaultWorkflowNodeTitle, type WorkflowLocale, type WorkflowNodeType } from "@/lib/workflows/schema"
import { Archive, AudioLines, FileUp, Film, ImageIcon, Mic, Music, PanelsTopLeft, PenSquare, Sparkles, Type } from "lucide-react"

const NODE_ORDER: WorkflowNodeType[] = [
  "upload",
  "text_input",
  "writer",
  "llm_generate",
  "image_generate",
  "video_generate",
  "music_generate",
  "voice_synthesis",
  "ppt_generate",
  "product_store",
]

const NODE_VISUALS: Record<
  WorkflowNodeType,
  {
    icon: typeof FileUp
    accentClassName: string
  }
> = {
  upload: {
    icon: FileUp,
    accentClassName: "border-amber-300/80 bg-amber-100 text-amber-800",
  },
  text_input: {
    icon: Type,
    accentClassName: "border-sky-300/80 bg-sky-100 text-sky-800",
  },
  writer: {
    icon: PenSquare,
    accentClassName: "border-indigo-300/80 bg-indigo-100 text-indigo-800",
  },
  llm_generate: {
    icon: Sparkles,
    accentClassName: "border-fuchsia-300/80 bg-fuchsia-100 text-fuchsia-800",
  },
  image_generate: {
    icon: ImageIcon,
    accentClassName: "border-emerald-300/80 bg-emerald-100 text-emerald-800",
  },
  video_generate: {
    icon: Film,
    accentClassName: "border-rose-300/80 bg-rose-100 text-rose-800",
  },
  music_generate: {
    icon: Music,
    accentClassName: "border-cyan-300/80 bg-cyan-100 text-cyan-800",
  },
  voice_synthesis: {
    icon: Mic,
    accentClassName: "border-teal-300/80 bg-teal-100 text-teal-800",
  },
  audio_generate: {
    icon: AudioLines,
    accentClassName: "border-cyan-300/80 bg-cyan-100 text-cyan-800",
  },
  ppt_generate: {
    icon: PanelsTopLeft,
    accentClassName: "border-violet-300/80 bg-violet-100 text-violet-800",
  },
  product_store: {
    icon: Archive,
    accentClassName: "border-slate-300/80 bg-slate-100 text-slate-800",
  },
}

type WorkflowNodePaletteProps = {
  className?: string
  locale: WorkflowLocale
  onAddNode: (type: WorkflowNodeType) => void
}

export function WorkflowNodePalette({ className, locale, onAddNode }: WorkflowNodePaletteProps) {
  const copy =
    locale === "zh"
      ? {
          library: "节点库",
          fixedNodes: "固定节点",
          dragToCanvas: "拖入画布",
          clickToAdd: "点击添加",
        }
      : {
          library: "Node library",
          fixedNodes: "Fixed nodes",
          dragToCanvas: "Drag to canvas",
          clickToAdd: "Click to add",
        }

  const handleDragStart = (event: React.DragEvent<HTMLElement>, type: WorkflowNodeType) => {
    event.dataTransfer.effectAllowed = "copy"
    event.dataTransfer.setData("application/x-workflow-node-type", type)
  }

  return (
    <section className={cn("dashboard-panel rounded-[14px] border border-border bg-card/88 p-2", className)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="dashboard-kicker text-muted-foreground">{copy.library}</div>
          <h2 className="mt-1 font-display text-xl font-extrabold uppercase tracking-[0.02em] text-foreground">
            {copy.fixedNodes}
          </h2>
        </div>
        <div className="rounded-[4px] border border-primary/30 bg-background/70 px-2 py-1 font-display text-[11px] uppercase tracking-[0.08em] text-foreground">
          V1
        </div>
      </div>

      <div className="mt-2 grid gap-1.5">
        {NODE_ORDER.map((type) => {
          const displayTitle = getDefaultWorkflowNodeTitle(type, locale)
          const visual = NODE_VISUALS[type]
          const NodeIcon = visual.icon

          return (
            <button
              key={type}
              type="button"
              title={`${displayTitle} · ${copy.clickToAdd} · ${copy.dragToCanvas}`}
              draggable
              onClick={() => onAddNode(type)}
              onDragStart={(event) => handleDragStart(event, type)}
              className={cn(
                "group flex w-full items-center gap-2 rounded-[10px] border border-border/80 bg-background/78 px-2.5 py-2 text-left transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-background active:cursor-grabbing",
              )}
              aria-label={`${displayTitle} · ${copy.clickToAdd} · ${copy.dragToCanvas}`}
            >
              <div className="flex min-w-0 flex-1 cursor-grab items-center gap-2 overflow-hidden">
                <div className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-[10px] border", visual.accentClassName)}>
                  <NodeIcon className="size-4" />
                </div>
                <span className="truncate font-display text-[11px] font-extrabold uppercase tracking-[0.08em] text-foreground">
                  {displayTitle}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </section>
  )
}
