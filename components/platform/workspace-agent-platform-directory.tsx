"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowUpRight, Bot, PencilLine, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { dispatchBusinessMarketplaceSelectionUpdated } from "@/lib/platform/business-marketplace-events"
import { buildAgentPlatformDirectoryGroups } from "@/lib/platform/agent-platform-directory"
import type { CustomAgentView } from "@/lib/platform/custom-agents"
import type { ImportedAgencyAgentPlatformCard } from "@/lib/platform/imported-agency-agents"
import type { AiEntryAgentCatalogGroup, AiEntryAgentCatalogItem } from "@/lib/ai-entry/agent-catalog"

export function WorkspaceAgentPlatformDirectory({
  locale,
  builtinAgents,
  builtinGroups,
  customAgents,
  importedAgents,
  initialSelectedBusinessMenuAgentIds,
}: {
  locale: "zh" | "en"
  builtinAgents: AiEntryAgentCatalogItem[]
  builtinGroups: AiEntryAgentCatalogGroup[]
  customAgents: CustomAgentView[]
  importedAgents: ImportedAgencyAgentPlatformCard[]
  initialSelectedBusinessMenuAgentIds: string[]
}) {
  const router = useRouter()
  const groups = buildAgentPlatformDirectoryGroups({
    locale,
    builtinAgents,
    builtinGroups,
    customAgents,
    importedAgents,
  })
  const [selectedBusinessMenuAgentIds, setSelectedBusinessMenuAgentIds] = useState<string[]>(
    initialSelectedBusinessMenuAgentIds,
  )
  const [pendingAgentId, setPendingAgentId] = useState<string | null>(null)
  const selectedBusinessMenuAgentIdSet = useMemo(
    () => new Set(selectedBusinessMenuAgentIds),
    [selectedBusinessMenuAgentIds],
  )

  const copy =
    locale === "zh"
      ? {
          eyebrow: "Agent Platform",
          title: "智能体中台",
          description: "保留原有 Agent 分类卡片视图，并把当前用户创建的自定义 Agent 收敛到首个分组里统一管理与进入。",
          groupHint: "继续编辑自定义 Agent，或把可用 Agent 添加到业务菜单。",
          openCreate: "创建 Agent",
          editAgent: "编辑 Agent",
          addToBusinessMenu: "添加到业务菜单",
          inBusinessMenu: "已在业务菜单",
          removeFromBusinessMenu: "从业务菜单中删除",
          configureBusinessMenu: "配置业务菜单",
          noSummary: "暂无简介",
          pending: "处理中…",
        }
      : {
          eyebrow: "Agent Platform",
          title: "Agent Platform",
          description: "Keep the original categorized agent-card layout and place the current user's custom agents into the first group.",
          groupHint: "Continue editing custom agents, or add eligible agents into the business menu.",
          openCreate: "Create agent",
          editAgent: "Edit agent",
          addToBusinessMenu: "Add to business menu",
          inBusinessMenu: "In business menu",
          removeFromBusinessMenu: "Remove from business menu",
          configureBusinessMenu: "Configure business menu",
          noSummary: "No summary yet.",
          pending: "Working…",
        }

  const toggleBusinessMenuAgent = async (agentId: string) => {
    const nextSelectedAgentIds = selectedBusinessMenuAgentIdSet.has(agentId)
      ? selectedBusinessMenuAgentIds.filter((id) => id !== agentId)
      : [...selectedBusinessMenuAgentIds, agentId]

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
      setSelectedBusinessMenuAgentIds(
        Array.isArray(payload?.data?.selectedAgentIds) ? payload.data.selectedAgentIds : nextSelectedAgentIds,
      )
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
        <div className="public-panel workspace-hero-panel rounded-[12px] border border-border bg-card/80">
          <div className="public-kicker text-muted-foreground">{copy.eyebrow}</div>
          <h2 className="mt-3 font-display text-4xl font-extrabold uppercase tracking-[0.02em] text-foreground lg:text-5xl">
            {copy.title}
          </h2>
          <p className="mt-4 max-w-4xl text-sm leading-7 text-muted-foreground lg:text-base">{copy.description}</p>
        </div>

        <div className="grid gap-5">
          {groups.map((group) => (
            <article
              key={group.id}
              className={
                group.id === "custom"
                  ? "dashboard-panel workspace-card-panel rounded-[12px] border border-border bg-card/85 p-5 lg:p-6"
                  : "agent-market-section rounded-[12px] border border-border bg-card/85 p-5 lg:p-6"
              }
            >
              <div
                className={
                  group.id === "custom"
                    ? "flex flex-col gap-2 border-b border-border/70 pb-4 sm:flex-row sm:items-end sm:justify-between"
                    : "market-section-header border-b border-border/70 pb-4"
                }
              >
                <div className="flex min-w-0 items-center gap-2">
                  <div>
                    <div className={group.id === "custom" ? "dashboard-kicker text-muted-foreground" : ""}>
                      {group.label}
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">{copy.groupHint}</div>
                  </div>
                  {group.id !== "custom" ? <span className="agent-count-pill">{group.cards.length}</span> : null}
                </div>
                {group.id === "custom" ? (
                  <div className="text-sm font-semibold text-muted-foreground">{group.cards.length}</div>
                ) : null}
              </div>

              <div className={group.id === "custom" ? "mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3" : "agent-grid mt-5"}>
                {group.cards.map((card) => {
                  if (card.kind === "create") {
                    return (
                      <Link
                        key={card.id}
                        href={card.href}
                        className="group flex min-h-[220px] flex-col rounded-[12px] border border-dashed border-primary/55 bg-primary/5 p-5 transition hover:-translate-y-0.5 hover:border-primary hover:bg-primary/10"
                      >
                        <div className="inline-flex h-12 w-12 items-center justify-center rounded-[10px] border border-primary/40 bg-primary text-primary-foreground">
                          <Plus className="h-5 w-5" />
                        </div>
                        <div className="mt-5 font-display text-2xl font-black uppercase leading-none text-foreground">
                          {card.title}
                        </div>
                        <div className="mt-3 text-sm leading-6 text-muted-foreground">{card.description}</div>
                        <div className="mt-auto flex items-center justify-between pt-6">
                          <span className="text-[11px] font-black uppercase tracking-[0.12em] text-muted-foreground">{card.meta}</span>
                          <span className="inline-flex items-center gap-1 text-sm font-semibold text-foreground">
                            {copy.openCreate}
                            <ArrowUpRight className="h-4 w-4 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                          </span>
                        </div>
                      </Link>
                    )
                  }

                  if (card.kind === "builtin") {
                    const businessMenuAgentId = card.businessMenuAgentId
                    const isSelected = businessMenuAgentId ? selectedBusinessMenuAgentIdSet.has(businessMenuAgentId) : false
                    const isPending = businessMenuAgentId ? pendingAgentId === businessMenuAgentId : false
                    const showMetaChip = Boolean(card.meta) && !group.id.startsWith("imported:")

                    return (
                      <article key={card.id} className="agent-card">
                        <div className="flex items-start gap-4">
                          <div className="agent-icon-block">
                            <Bot className="size-6" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="agent-category">{group.label}</div>
                            <h3 className="agent-title">{card.title}</h3>
                            <p className="agent-description">{card.description || copy.noSummary}</p>
                          </div>
                        </div>

                        {showMetaChip ? (
                          <div className="mt-5 flex flex-wrap gap-2">
                            <span className="agent-chip">{card.meta}</span>
                          </div>
                        ) : null}

                        {businessMenuAgentId ? (
                          <div className="agent-card-actions">
                            <button
                              type="button"
                              disabled={isPending || isSelected}
                              onClick={
                                isSelected
                                  ? undefined
                                  : () => {
                                      void toggleBusinessMenuAgent(businessMenuAgentId)
                                    }
                              }
                              className={`agent-card-primary-action ${isSelected ? "agent-installed" : ""}`}
                            >
                              {isPending ? copy.pending : isSelected ? copy.inBusinessMenu : copy.addToBusinessMenu}
                            </button>
                            {isSelected ? (
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => {
                                  void toggleBusinessMenuAgent(businessMenuAgentId)
                                }}
                                className="agent-card-secondary-action"
                              >
                                {isPending ? copy.pending : copy.removeFromBusinessMenu}
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </article>
                    )
                  }

                  return (
                    <article
                      key={card.id}
                      className="group flex min-h-[220px] flex-col rounded-[12px] border border-border bg-background/72 p-5 transition hover:-translate-y-0.5 hover:border-primary/50 hover:bg-background"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="inline-flex h-12 w-12 items-center justify-center rounded-[10px] border border-primary/25 bg-primary/8 text-foreground">
                          {card.kind === "custom" ? <PencilLine className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
                        </div>
                        {card.kind === "custom" ? (
                          <span className="rounded-full border border-border px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-muted-foreground">
                            {card.status}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-5 font-display text-2xl font-black uppercase leading-none text-foreground">
                        {card.title}
                      </div>
                      <div className="mt-3 line-clamp-4 text-sm leading-6 text-muted-foreground">
                        {card.description || copy.noSummary}
                      </div>
                      {card.kind === "custom" && card.businessMenuHint ? (
                        <div className="mt-3 text-xs leading-5 text-muted-foreground">{card.businessMenuHint}</div>
                      ) : null}

                      <div className="mt-auto flex flex-wrap gap-2 pt-6">
                        <span className="rounded-full border border-border px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-muted-foreground">
                          {card.meta}
                        </span>
                        {"visibility" in card ? (
                          <span className="rounded-full border border-border px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-muted-foreground">
                            {card.visibility}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-5 flex flex-wrap gap-2">
                        {card.kind === "custom" ? (
                          <Button variant="outline" className="h-10 rounded-[9px] px-4 text-sm font-semibold" asChild>
                            <Link href={card.editHref}>{copy.editAgent}</Link>
                          </Button>
                        ) : null}

                        {card.kind === "custom" ? (
                          card.businessMenuEligible ? (
                            selectedBusinessMenuAgentIdSet.has(card.businessMenuAgentId) ? (
                              <>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  className="h-10 rounded-[9px] px-4 text-sm font-semibold"
                                  disabled
                                >
                                  {pendingAgentId === card.businessMenuAgentId ? copy.pending : copy.inBusinessMenu}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-10 rounded-[9px] px-4 text-sm font-semibold"
                                  disabled={pendingAgentId === card.businessMenuAgentId}
                                  onClick={() => {
                                    void toggleBusinessMenuAgent(card.businessMenuAgentId)
                                  }}
                                >
                                  {pendingAgentId === card.businessMenuAgentId ? copy.pending : copy.removeFromBusinessMenu}
                                </Button>
                              </>
                            ) : (
                              <Button
                                type="button"
                                variant="default"
                                className="h-10 rounded-[9px] px-4 text-sm font-semibold"
                                disabled={pendingAgentId === card.businessMenuAgentId}
                                onClick={() => {
                                  void toggleBusinessMenuAgent(card.businessMenuAgentId)
                                }}
                              >
                                {pendingAgentId === card.businessMenuAgentId ? copy.pending : copy.addToBusinessMenu}
                              </Button>
                            )
                          ) : (
                            <Button variant="outline" className="h-10 rounded-[9px] px-4 text-sm font-semibold" asChild>
                              <Link href={card.editHref}>{copy.configureBusinessMenu}</Link>
                            </Button>
                          )
                        ) : null}
                      </div>
                    </article>
                  )
                })}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
