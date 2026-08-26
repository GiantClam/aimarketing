import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, Bot, Cpu, Database, FileText, House, ImageIcon, LayoutGrid, LibraryBig, ListChecks, Network, PenSquare, Presentation, Send, Settings2, Sparkles, Users2, Video, Workflow } from "lucide-react";
import type { SVGProps } from "react";

const ROUTE_ICONS: Record<string, LucideIcon> = {
  home: House,
  chat: Bot,
  advisor: Users2,
  ppt: Presentation,
  writer: PenSquare,
  image: ImageIcon,
  capability: LayoutGrid,
  workflow: Workflow,
  task: ListChecks,
  asset: LibraryBig,
  knowledge: Database,
  video: Video,
  settings: Settings2,
  send: Send,
  arrowUpRight: ArrowUpRight,
  sparkles: Sparkles,
  docs: FileText,
  network: Network,
  runtime: Cpu,
};

export function WorkbenchRouteIcon({ name, size = 16, strokeWidth = 1.8, ...props }: { name?: string; size?: number } & SVGProps<SVGSVGElement>) {
  const Icon = ROUTE_ICONS[name ?? ""];
  if (!Icon) return <span aria-hidden="true">{name?.slice(0, 1) ?? "·"}</span>;
  return <Icon size={size} strokeWidth={strokeWidth} aria-hidden="true" {...props} />;
}
