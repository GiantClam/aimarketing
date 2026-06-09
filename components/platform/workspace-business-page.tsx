import { WorkspaceBusinessAgentWorkbench } from "@/components/platform/workspace-business-agent-workbench"
import type { LocalizedBusinessAgentConfig } from "@/lib/platform/business-agents"
import type { LocalizedWorkspaceBusinessEntry, WorkspaceBusinessSlug } from "@/lib/platform/workspace-business"

export function WorkspaceBusinessPage({
  locale,
  currentSlug,
  entries,
  agents,
}: {
  locale: "zh" | "en"
  currentSlug: WorkspaceBusinessSlug
  entries: LocalizedWorkspaceBusinessEntry[]
  agents: LocalizedBusinessAgentConfig[]
}) {
  return (
    <div className="h-full overflow-auto overflow-x-hidden bg-transparent">
      <section className="public-grid-bg mx-auto max-w-7xl px-1 py-1 sm:px-1.5 sm:py-2">
        {agents.length > 0 ? (
          <WorkspaceBusinessAgentWorkbench locale={locale} currentSlug={currentSlug} entries={entries} agents={agents} />
        ) : null}
      </section>
    </div>
  )
}
