import {
  Archive,
  ArrowDownToLine,
  AudioLines,
  Bot,
  CheckCircle2,
  FileText,
  FileUp,
  Film,
  HelpCircle,
  ImageIcon,
  Link2,
  List,
  LucideIcon,
  Mic,
  Music,
  PanelsTopLeft,
  PenSquare,
  Repeat2,
  Sparkles,
  Type,
  UserRound,
} from "lucide-react"

import type {
  WorkflowNodeDefinitionV2,
  WorkflowNodeRegistry,
  WorkflowNodeType,
} from "@/lib/workflows/node-definitions/types"
import type { WorkflowDefinitionNode, WorkflowLocale } from "@/lib/workflows/schema"

export type WorkflowNodeVisual = {
  icon: LucideIcon
  accentClassName: string
  glowClassName: string
}

const NODE_VISUALS: Record<WorkflowNodeType, WorkflowNodeVisual> = {
  upload: { icon: FileUp, accentClassName: "border-amber-300/80 bg-amber-100 text-amber-800", glowClassName: "from-amber-200/80 via-amber-100/20 to-transparent" },
  text_input: { icon: Type, accentClassName: "border-sky-300/80 bg-sky-100 text-sky-800", glowClassName: "from-sky-200/80 via-sky-100/20 to-transparent" },
  file_create: { icon: FileText, accentClassName: "border-lime-300/80 bg-lime-100 text-lime-800", glowClassName: "from-lime-200/80 via-lime-100/20 to-transparent" },
  writer: { icon: PenSquare, accentClassName: "border-indigo-300/80 bg-indigo-100 text-indigo-800", glowClassName: "from-indigo-200/80 via-indigo-100/20 to-transparent" },
  llm_generate: { icon: Sparkles, accentClassName: "border-fuchsia-300/80 bg-fuchsia-100 text-fuchsia-800", glowClassName: "from-fuchsia-200/80 via-fuchsia-100/20 to-transparent" },
  agent_execute: { icon: Bot, accentClassName: "border-amber-400/80 bg-amber-100 text-amber-900", glowClassName: "from-amber-200/80 via-amber-100/20 to-transparent" },
  image_generate: { icon: ImageIcon, accentClassName: "border-emerald-300/80 bg-emerald-100 text-emerald-800", glowClassName: "from-emerald-200/80 via-emerald-100/20 to-transparent" },
  video_generate: { icon: Film, accentClassName: "border-rose-300/80 bg-rose-100 text-rose-800", glowClassName: "from-rose-200/80 via-rose-100/20 to-transparent" },
  digital_human: { icon: UserRound, accentClassName: "border-orange-300/80 bg-orange-100 text-orange-800", glowClassName: "from-orange-200/80 via-orange-100/20 to-transparent" },
  music_generate: { icon: Music, accentClassName: "border-cyan-300/80 bg-cyan-100 text-cyan-800", glowClassName: "from-cyan-200/80 via-cyan-100/20 to-transparent" },
  voice_synthesis: { icon: Mic, accentClassName: "border-teal-300/80 bg-teal-100 text-teal-800", glowClassName: "from-teal-200/80 via-teal-100/20 to-transparent" },
  audio_generate: { icon: AudioLines, accentClassName: "border-cyan-300/80 bg-cyan-100 text-cyan-800", glowClassName: "from-cyan-200/80 via-cyan-100/20 to-transparent" },
  ppt_generate: { icon: PanelsTopLeft, accentClassName: "border-violet-300/80 bg-violet-100 text-violet-800", glowClassName: "from-violet-200/80 via-violet-100/20 to-transparent" },
  knowledge_retrieve: { icon: Link2, accentClassName: "border-sky-300/80 bg-sky-100 text-sky-800", glowClassName: "from-sky-200/80 via-sky-100/20 to-transparent" },
  knowledge_write: { icon: ArrowDownToLine, accentClassName: "border-emerald-300/80 bg-emerald-100 text-emerald-800", glowClassName: "from-emerald-200/80 via-emerald-100/20 to-transparent" },
  product_store: { icon: Archive, accentClassName: "border-slate-300/80 bg-slate-100 text-slate-800", glowClassName: "from-slate-200/80 via-slate-100/20 to-transparent" },
  foreach: { icon: Repeat2, accentClassName: "border-amber-300/80 bg-amber-100 text-amber-800", glowClassName: "from-amber-200/80 via-amber-100/20 to-transparent" },
  collect: { icon: List, accentClassName: "border-sky-300/80 bg-sky-100 text-sky-800", glowClassName: "from-sky-200/80 via-sky-100/20 to-transparent" },
  output: { icon: CheckCircle2, accentClassName: "border-lime-300/80 bg-lime-100 text-lime-800", glowClassName: "from-lime-200/80 via-lime-100/20 to-transparent" },
}

const UNKNOWN_NODE_VISUAL: WorkflowNodeVisual = {
  icon: HelpCircle,
  accentClassName: "border-slate-300/80 bg-slate-100 text-slate-700",
  glowClassName: "from-slate-200/80 via-slate-100/20 to-transparent",
}

export type WorkflowNodePaletteItem = {
  type: string
  title: string
  category: WorkflowNodeDefinitionV2["category"] | "unknown"
  definition: WorkflowNodeDefinitionV2 | null
  visual: WorkflowNodeVisual
  readOnly: boolean
}

export type WorkflowNodeViewModel = WorkflowNodePaletteItem & {
  nodeKey: string
  inputPorts: WorkflowNodeDefinitionV2["inputs"]
  outputPorts: WorkflowNodeDefinitionV2["outputs"]
  inputKinds: string[]
  outputKinds: string[]
  config: Record<string, unknown>
}

export function getWorkflowNodeVisual(type: string): WorkflowNodeVisual {
  return NODE_VISUALS[type as WorkflowNodeType] ?? UNKNOWN_NODE_VISUAL
}

export function buildWorkflowNodePalette(
  registry: Pick<WorkflowNodeRegistry, "list">,
  locale: WorkflowLocale,
): WorkflowNodePaletteItem[] {
  return registry.list().map((definition) => ({
    type: definition.type,
    title: definition.title[locale],
    category: definition.category,
    definition,
    visual: getWorkflowNodeVisual(definition.type),
    readOnly: false,
  }))
}

export function buildWorkflowNodeViewModel(
  node: WorkflowDefinitionNode,
  registry: Pick<WorkflowNodeRegistry, "get">,
  locale: WorkflowLocale,
): WorkflowNodeViewModel {
  const definition = registry.get(node.type)
  return {
    type: node.type,
    nodeKey: node.nodeKey,
    title: definition?.title[locale] || node.title || node.type.replace(/_/g, " "),
    category: definition?.category ?? "unknown",
    definition,
    visual: getWorkflowNodeVisual(node.type),
    readOnly: !definition,
    inputPorts: definition?.inputs ?? [],
    outputPorts: definition?.outputs ?? [],
    inputKinds: [...new Set((definition?.inputs ?? []).map((port) => port.valueKind))],
    outputKinds: [...new Set((definition?.outputs ?? []).map((port) => port.valueKind))],
    config: node.config,
  }
}
