"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronDown, ChevronRight } from "lucide-react"

import { dispatchBusinessMarketplaceSelectionUpdated } from "@/lib/platform/business-marketplace-events"
import type { ImportedAgencyAgentPlatformCard } from "@/lib/platform/imported-agency-agents"
import type { LocalizedWorkspaceBusinessEntry } from "@/lib/platform/workspace-business"

export function WorkspaceAgencyAgentGallery({
  locale,
  entries,
  agents,
  initialSelectedAgentIds,
  showHero = true,
}: {
  locale: "zh" | "en"
  entries: LocalizedWorkspaceBusinessEntry[]
  agents: ImportedAgencyAgentPlatformCard[]
  initialSelectedAgentIds: string[]
  showHero?: boolean
}) {
  const router = useRouter()
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>(initialSelectedAgentIds)
  const [pendingAgentId, setPendingAgentId] = useState<string | null>(null)

  const copy =
    locale === "zh"
      ? {
          eyebrow: "Agency Agents Import",
          title: "已验证可运行的外部 Agent",
          description:
            "从 agency-agents 中提取出适合当前 aimarketing 文本型 AI runtime 的 Agent，完整分类展示在智能体中台。你可以把需要的 Agent 添加到自己的业务入口，再进入统一业务工作台使用。",
          countLabel: "已验证",
          selectedCountLabel: "已添加到业务入口",
          categoryLabel: "分类",
          addedLabel: "已添加",
          addLane: "添加到业务入口",
          removeLane: "从业务入口移除",
          openLane: "在业务入口打开",
          collapseSection: "折叠分类",
          expandSection: "展开分类",
          empty: "当前分类下还没有可运行的外部 Agent。",
          pending: "处理中…",
        }
      : {
          eyebrow: "Agency Agents Import",
          title: "Verified external agents",
          description:
            "These agents were extracted from agency-agents, validated against the current aimarketing text runtime, and listed in the marketplace by category. Add the ones you want, then launch them from your business workspace.",
          countLabel: "Verified",
          selectedCountLabel: "Added to business",
          categoryLabel: "Category",
          addedLabel: "Added",
          addLane: "Add to business entry",
          removeLane: "Remove from business entry",
          openLane: "Open in business entry",
          collapseSection: "Collapse category",
          expandSection: "Expand category",
          empty: "No runnable external agents are available in this lane yet.",
          pending: "Working…",
        }

  const sections = useMemo(
    () =>
      entries
        .map((entry) => ({
          entry,
          agents: agents.filter((agent) => agent.businessSlug === entry.slug),
        }))
        .filter((section) => section.agents.length > 0),
    [agents, entries],
  )

  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(
    () => Object.fromEntries(sections.map((section) => [section.entry.slug, false])),
  )

  useEffect(() => {
    setCollapsedSections((current) =>
      Object.fromEntries(
        sections.map((section) => [section.entry.slug, current[section.entry.slug] ?? false]),
      ),
    )
  }, [sections])

  const selectedAgentIdSet = useMemo(() => new Set(selectedAgentIds), [selectedAgentIds])

  const toggleAgentSelection = async (agentId: string) => {
    const nextSelectedAgentIds = selectedAgentIdSet.has(agentId)
      ? selectedAgentIds.filter((id) => id !== agentId)
      : [...selectedAgentIds, agentId]

    setPendingAgentId(agentId)
    try {
      const response = await fetch("/api/platform/business/marketplace-selection", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          selectedAgentIds: nextSelectedAgentIds,
        }),
      })
      const payload = (await response.json().catch(() => null)) as
        | { data?: { selectedAgentIds?: string[] } }
        | null
      if (!response.ok) {
        throw new Error(`http_${response.status}`)
      }
      setSelectedAgentIds(Array.isArray(payload?.data?.selectedAgentIds) ? payload.data.selectedAgentIds : nextSelectedAgentIds)
      dispatchBusinessMarketplaceSelectionUpdated()
      router.refresh()
    } catch {
      // Keep the previous UI state when persistence fails.
    } finally {
      setPendingAgentId(null)
    }
  }

  return (
    <section className="public-grid-bg workspace-page-shell-bottom mx-auto max-w-7xl">
      <div className="workspace-stack">
        {showHero ? (
          <div className="public-panel workspace-hero-panel rounded-[12px] border border-border bg-card/80">
            <div className="public-kicker text-muted-foreground">{copy.eyebrow}</div>
            <h2 className="mt-3 font-display text-4xl font-extrabold uppercase tracking-[0.02em] text-foreground lg:text-5xl">
              {copy.title}
            </h2>
            <p className="mt-4 max-w-5xl text-sm leading-7 text-muted-foreground lg:text-base">{copy.description}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <div className="dashboard-chip inline-flex rounded-[4px] px-3 py-2 text-sm text-foreground">
                {copy.countLabel}: {agents.length}
              </div>
              <div className="dashboard-chip inline-flex rounded-[4px] px-3 py-2 text-sm text-foreground">
                {copy.selectedCountLabel}: {selectedAgentIds.length}
              </div>
            </div>
          </div>
        ) : null}

        {sections.length === 0 ? (
          <div className="rounded-[12px] border border-border bg-card/75 px-4 py-5 text-sm text-muted-foreground">
            {copy.empty}
          </div>
        ) : (
          <div className="space-y-5">
            {sections.map(({ entry, agents: sectionAgents }) => {
              const collapsed = collapsedSections[entry.slug] ?? false
              const hasSelectedAgents = sectionAgents.some((agent) => selectedAgentIdSet.has(agent.agentId))
              return (
                <section
                  key={entry.slug}
                  className={hasSelectedAgents
                    ? "dashboard-panel workspace-card-panel rounded-[12px] border border-primary/40 bg-primary/5 p-4"
                    : "dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85 p-4"}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsedSections((current) => ({
                        ...current,
                        [entry.slug]: !collapsed,
                      }))
                    }
                    className={hasSelectedAgents
                      ? "flex w-full items-center justify-between gap-4 rounded-[10px] border border-primary/40 bg-primary/10 px-4 py-3 text-left transition hover:border-primary/60 hover:bg-primary/15"
                      : "flex w-full items-center justify-between gap-4 rounded-[10px] border border-border/60 bg-background/70 px-4 py-3 text-left transition hover:border-primary/40 hover:bg-primary/5"}
                    aria-expanded={!collapsed}
                    aria-label={collapsed ? copy.expandSection : copy.collapseSection}
                  >
                    <div className="min-w-0">
                      <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">{copy.categoryLabel}</div>
                      <div className="mt-1 flex items-center gap-3">
                        <h3 className="font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                          {entry.title}
                        </h3>
                        <span className="dashboard-chip inline-flex rounded-[999px] px-2.5 py-1 text-xs text-foreground">
                          {sectionAgents.length}
                        </span>
                      </div>
                    </div>
                    <div className="shrink-0 text-muted-foreground">
                      {collapsed ? <ChevronRight className="size-5" /> : <ChevronDown className="size-5" />}
                    </div>
                  </button>

                  {collapsed ? null : (
                    <div className="mt-4 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                      {sectionAgents.map((agent) => {
                        const isSelected = selectedAgentIdSet.has(agent.agentId)
                        const isPending = pendingAgentId === agent.agentId
                        return (
                          <article
                            key={agent.agentId}
                            className={isSelected
                              ? "overflow-hidden rounded-[12px] border border-primary bg-primary/5 shadow-[0_0_0_1px_color-mix(in_srgb,var(--primary)_24%,transparent)]"
                              : "overflow-hidden rounded-[12px] border border-border bg-card/90"}
                          >
                            <div
                              className="rounded-[10px] border border-border/60 p-4"
                              style={{
                                background: `linear-gradient(135deg, color-mix(in srgb, ${agent.color || "#d4d4d8"} 22%, white) 0%, color-mix(in srgb, ${agent.color || "#d4d4d8"} 8%, transparent) 100%)`,
                              }}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-3">
                                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] border border-border/70 bg-background/85 text-2xl shadow-sm">
                                    {agent.emoji || "AI"}
                                  </div>
                                  <div className="min-w-0 space-y-1">
                                    <div className="dashboard-chip inline-flex rounded-[999px] px-2.5 py-1 text-xs text-muted-foreground">
                                      {agent.sourceCategoryLabel}
                                    </div>
                                    <h4 className="line-clamp-2 font-display text-xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                                      {agent.name}
                                    </h4>
                                  </div>
                                </div>
                                {isSelected ? (
                                  <div className="dashboard-chip shrink-0 rounded-[999px] px-2.5 py-1 text-xs text-foreground">
                                    {copy.addedLabel}
                                  </div>
                                ) : null}
                              </div>
                            </div>

                            <p className="mt-4 px-4 text-sm leading-7 text-muted-foreground">{agent.summary}</p>

                            <div className="mt-6 flex flex-wrap gap-3 px-4 pb-4">
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => {
                                  void toggleAgentSelection(agent.agentId)
                                }}
                                className="public-button-primary inline-flex h-10 items-center rounded-[6px] px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isPending ? copy.pending : isSelected ? copy.removeLane : copy.addLane}
                              </button>
                              {isSelected ? (
                                <Link
                                  href={agent.nativeHref}
                                  className="public-button-secondary inline-flex h-10 items-center rounded-[6px] px-4 text-sm font-medium"
                                >
                                  {copy.openLane}
                                </Link>
                              ) : null}
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
