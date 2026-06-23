"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  BarChart3,
  Bookmark,
  Bot,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  Eye,
  Headphones,
  LayoutGrid,
  Megaphone,
  PencilLine,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react"

import { dispatchBusinessMarketplaceSelectionUpdated } from "@/lib/platform/business-marketplace-events"
import type { ImportedAgencyAgentPlatformCard } from "@/lib/platform/imported-agency-agents"
import type { LocalizedWorkspaceBusinessEntry } from "@/lib/platform/workspace-business"

function getAgentMarketIcon(category: string) {
  if (category === "sales" || category === "paid-media") return BarChart3
  if (category === "marketing") return Megaphone
  if (category === "support") return Headphones
  if (category === "security") return ShieldCheck
  if (category === "design") return PencilLine
  if (category === "product" || category === "project-management" || category === "operations") return BriefcaseBusiness
  return Bot
}

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
  const [searchQuery, setSearchQuery] = useState("")
  const [activeCategory, setActiveCategory] = useState("all")
  const [availableOnly, setAvailableOnly] = useState(false)
  const [previewAgentId, setPreviewAgentId] = useState<string | null>(null)

  const copy =
    locale === "zh"
      ? {
          eyebrow: "Agent Marketplace",
          title: "Agent Market",
          description:
            "浏览专家 Agent，预览能力，并把最适合的 Agent 添加到你的工作区菜单。",
          countLabel: "可用 Agent",
          selectedCountLabel: "已安装 Agent",
          categoryLabel: "分类",
          activeMenuItems: "菜单入口",
          manageMenu: "管理菜单",
          addedLabel: "已安装",
          addLane: "添加到菜单",
          removeLane: "已在菜单",
          openLane: "打开工作区",
          preview: "预览",
          search: "搜索 Agent、场景或能力",
          all: "全部",
          recommended: "推荐",
          availableToAdd: "仅看可添加",
          sort: "默认排序",
          viewAll: "查看全部",
          useCases: "适用场景",
          inputs: "需要输入",
          outputs: "输出结果",
          tools: "工具 / 工作流",
          permissions: "权限",
          installed: "已安装",
          available: "可添加",
          previewTitle: "Agent 预览",
          installSuccess: "Agent added to your workspace menu",
          empty: "当前分类下还没有可运行的外部 Agent。",
          pending: "处理中…",
        }
      : {
          eyebrow: "Agent Marketplace",
          title: "Agent Market",
          description:
            "Browse expert agents, preview capabilities, and add the best ones to your workspace menu.",
          countLabel: "Available Agents",
          selectedCountLabel: "Installed Agents",
          categoryLabel: "Category",
          activeMenuItems: "Active Menu Items",
          manageMenu: "Manage Menu",
          addedLabel: "Installed",
          addLane: "Add to menu",
          removeLane: "In menu",
          openLane: "Open workspace",
          preview: "Preview",
          search: "Search agents, use cases, or capabilities",
          all: "All",
          recommended: "Recommended",
          availableToAdd: "Available to add",
          sort: "Default sort",
          viewAll: "View all",
          useCases: "Use cases",
          inputs: "Required inputs",
          outputs: "Outputs",
          tools: "Tools / Workflows",
          permissions: "Permissions",
          installed: "Installed",
          available: "Available",
          previewTitle: "Agent preview",
          installSuccess: "Agent added to your workspace menu",
          empty: "No runnable external agents are available in this lane yet.",
          pending: "Working…",
        }

  const selectedAgentIdSet = useMemo(() => new Set(selectedAgentIds), [selectedAgentIds])
  const normalizedSearchQuery = searchQuery.trim().toLowerCase()

  const categoryFilters = useMemo(
    () => [
      { slug: "all", title: copy.all },
      { slug: "recommended", title: copy.recommended },
      ...entries
        .filter((entry) => agents.some((agent) => agent.businessSlug === entry.slug))
        .slice(0, 8)
        .map((entry) => ({ slug: entry.slug, title: entry.title })),
    ],
    [agents, copy.all, copy.recommended, entries],
  )

  const agentMatches = useMemo(
    () => (agent: ImportedAgencyAgentPlatformCard) => {
      if (availableOnly && selectedAgentIdSet.has(agent.agentId)) return false
      if (!normalizedSearchQuery) return true
      return [
        agent.name,
        agent.summary,
        agent.sourceCategoryLabel,
        agent.systemPromptSummary,
        ...agent.proofPoints,
        ...agent.samplePrompts,
        ...agent.artifactKinds,
        ...agent.workflowSlugs,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearchQuery)
    },
    [availableOnly, normalizedSearchQuery, selectedAgentIdSet],
  )

  const recommendedAgents = useMemo(() => {
    const selected = agents.filter((agent) => selectedAgentIdSet.has(agent.agentId))
    const popular = agents.filter((agent) => !selectedAgentIdSet.has(agent.agentId)).slice(0, 6)
    return [...selected, ...popular].filter(agentMatches).slice(0, 6)
  }, [agentMatches, agents, selectedAgentIdSet])

  const sections = useMemo(
    () =>
      entries
        .filter((entry) => activeCategory === "all" || activeCategory === entry.slug)
        .map((entry) => ({
          entry,
          agents: agents.filter((agent) => agent.businessSlug === entry.slug).filter(agentMatches),
        }))
        .filter((section) => section.agents.length > 0),
    [activeCategory, agentMatches, agents, entries],
  )

  const previewAgent = useMemo(
    () => agents.find((agent) => agent.agentId === previewAgentId) || null,
    [agents, previewAgentId],
  )

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

  const renderAgentCard = (agent: ImportedAgencyAgentPlatformCard, recommended = false) => {
    const isSelected = selectedAgentIdSet.has(agent.agentId)
    const isPending = pendingAgentId === agent.agentId
    const Icon = getAgentMarketIcon(agent.sourceCategory)
    const tags = [
      agent.sourceCategoryLabel,
      ...agent.artifactKinds.map((tag) => tag.replace(/_/g, " ")),
      ...agent.workflowSlugs,
    ].slice(0, 3)

    return (
      <article key={`${recommended ? "recommended" : "agent"}-${agent.agentId}`} className="agent-card">
        {recommended ? <div className="agent-recommended-badge">{copy.recommended}</div> : null}
        <div className="flex items-start gap-4">
          <div className="agent-icon-block">
            <Icon className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="agent-category">{agent.sourceCategoryLabel}</div>
            <h3 className="agent-title">{agent.name}</h3>
            <p className="agent-description">{agent.summary}</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span key={`${agent.agentId}-${tag}`} className="agent-chip">
              {tag}
            </span>
          ))}
        </div>

        <div className="agent-card-actions">
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              void toggleAgentSelection(agent.agentId)
            }}
            className={`agent-card-primary-action ${isSelected ? "agent-installed" : ""}`}
          >
            {isPending ? copy.pending : isSelected ? copy.removeLane : copy.addLane}
          </button>
          <button
            type="button"
            className="agent-preview"
            onClick={() => setPreviewAgentId(agent.agentId)}
          >
            <Eye className="size-4" />
            {copy.preview}
          </button>
          <Bookmark className="size-4 text-[#777]" />
        </div>

        {isSelected ? (
          <Link href={agent.nativeHref} className="agent-open-link">
            {copy.openLane}
            <ChevronRight className="size-4" />
          </Link>
        ) : null}
      </article>
    )
  }

  return (
    <section className="agent-market-page">
      <div className="mx-auto max-w-[1480px] px-4 py-6 lg:px-8 lg:py-8">
        {showHero ? (
          <header className="agent-market-header">
            <div className="min-w-0 max-w-[780px]">
              <div className="agent-market-eyebrow">{copy.eyebrow}</div>
              <h1 className="agent-market-title">{copy.title}</h1>
              <p className="agent-market-subtitle">{copy.description}</p>
            </div>
            <div className="agent-market-stats">
              <div className="market-stat-card">
                <Bot className="size-5 text-[#111]" />
                <div className="market-stat-number">{agents.length}</div>
                <div className="market-stat-label">{copy.countLabel}</div>
              </div>
              <div className="market-stat-card">
                <CheckCircle2 className="size-5 text-[#25a85a]" />
                <div className="market-stat-number">{selectedAgentIds.length}</div>
                <div className="market-stat-label">{copy.selectedCountLabel}</div>
              </div>
              <div className="market-stat-card">
                <LayoutGrid className="size-5 text-[#111]" />
                <div className="market-stat-number">{sections.length}</div>
                <div className="market-stat-label">{copy.categoryLabel}</div>
              </div>
              <Link href="/dashboard/business" className="manage-menu-card">
                <Settings2 className="size-5" />
                <div className="text-lg font-black uppercase">{copy.manageMenu}</div>
                <div className="text-xs text-white/65">{selectedAgentIds.length} {copy.activeMenuItems}</div>
              </Link>
            </div>
          </header>
        ) : null}

        <div className="agent-market-toolbar">
          <div className="agent-search-wrap">
            <Search className="size-4 text-[#777]" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="agent-search"
              placeholder={copy.search}
            />
            <span className="agent-search-shortcut">⌘ K</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {categoryFilters.map((filter) => (
              <button
                key={filter.slug}
                type="button"
                className={`filter-pill ${activeCategory === filter.slug ? "active" : ""}`}
                onClick={() => setActiveCategory(filter.slug)}
              >
                {filter.title}
              </button>
            ))}
            <button type="button" className="filter-pill" aria-label={copy.sort}>
              {copy.sort}
            </button>
            <button
              type="button"
              className={`available-toggle ${availableOnly ? "active" : ""}`}
              onClick={() => setAvailableOnly((current) => !current)}
            >
              {copy.availableToAdd}
              <span />
            </button>
          </div>
        </div>

        {(activeCategory === "all" || activeCategory === "recommended") && recommendedAgents.length > 0 ? (
          <section className="agent-market-section">
            <div className="market-section-header">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-[#111]" />
                <h2>{copy.recommended}</h2>
              </div>
              <button type="button" className="market-view-all" onClick={() => setActiveCategory("all")}>
                {copy.viewAll}
                <ChevronRight className="size-4" />
              </button>
            </div>
            <div className="agent-grid">{recommendedAgents.map((agent) => renderAgentCard(agent, true))}</div>
          </section>
        ) : null}

        {sections.length === 0 && recommendedAgents.length === 0 ? (
          <div className="agent-empty-state">{copy.empty}</div>
        ) : null}

        {activeCategory === "recommended" ? null : (
          <div className="space-y-8">
            {sections.map(({ entry, agents: sectionAgents }) => {
              const Icon = getAgentMarketIcon(entry.slug)
              return (
                <section key={entry.slug} className="agent-market-section">
                  <div className="market-section-header">
                    <div className="flex min-w-0 items-center gap-2">
                      <Icon className="size-4 text-[#111]" />
                      <h2>{entry.title}</h2>
                      <span className="agent-count-pill">{sectionAgents.length}</span>
                    </div>
                    <button type="button" className="market-view-all" onClick={() => setActiveCategory(entry.slug)}>
                      {copy.viewAll}
                      <ChevronRight className="size-4" />
                    </button>
                  </div>
                  <div className="agent-grid">{sectionAgents.map((agent) => renderAgentCard(agent))}</div>
                </section>
              )
            })}
          </div>
        )}

        <div className="market-floating-tools">
          <button type="button" aria-label="AI assist">
            <Sparkles className="size-5" />
          </button>
          <button type="button" aria-label="Marketplace help">
            <Headphones className="size-5" />
          </button>
        </div>
      </div>

      {previewAgent ? (
        <div className="agent-preview-drawer" role="dialog" aria-modal="true" aria-label={copy.previewTitle}>
          <div className="agent-preview-panel">
            <button type="button" className="agent-preview-close" onClick={() => setPreviewAgentId(null)} aria-label="Close preview">
              <X className="size-5" />
            </button>
            <div className="agent-icon-block">
              {(() => {
                const Icon = getAgentMarketIcon(previewAgent.sourceCategory)
                return <Icon className="size-6" />
              })()}
            </div>
            <div className="agent-category mt-5">{previewAgent.sourceCategoryLabel}</div>
            <h2 className="agent-preview-title">{previewAgent.name}</h2>
            <p className="mt-3 text-sm leading-7 text-[#666]">{previewAgent.summary}</p>

            <div className="mt-6 space-y-4">
              <div className="agent-preview-block">
                <div className="agent-preview-block-label">{copy.useCases}</div>
                <p>{previewAgent.systemPromptSummary}</p>
              </div>
              <div className="agent-preview-block">
                <div className="agent-preview-block-label">{copy.inputs}</div>
                <p>{previewAgent.samplePrompts[0] || previewAgent.summary}</p>
              </div>
              <div className="agent-preview-block">
                <div className="agent-preview-block-label">{copy.outputs}</div>
                <div className="flex flex-wrap gap-2">
                  {previewAgent.artifactKinds.slice(0, 4).map((kind) => (
                    <span key={kind} className="agent-chip">{kind.replace(/_/g, " ")}</span>
                  ))}
                </div>
              </div>
              <div className="agent-preview-block">
                <div className="agent-preview-block-label">{copy.tools}</div>
                <p>{previewAgent.workflowSlugs.length ? previewAgent.workflowSlugs.join(", ") : "AI workspace"}</p>
              </div>
              <div className="agent-preview-block">
                <div className="agent-preview-block-label">{copy.permissions}</div>
                <p>{selectedAgentIdSet.has(previewAgent.agentId) ? copy.installed : copy.available}</p>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                disabled={pendingAgentId === previewAgent.agentId}
                onClick={() => {
                  void toggleAgentSelection(previewAgent.agentId)
                }}
                className={`agent-card-primary-action flex-1 ${selectedAgentIdSet.has(previewAgent.agentId) ? "agent-installed" : ""}`}
              >
                {pendingAgentId === previewAgent.agentId
                  ? copy.pending
                  : selectedAgentIdSet.has(previewAgent.agentId)
                    ? copy.removeLane
                    : copy.addLane}
              </button>
              <Link href={previewAgent.nativeHref} className="secondary-btn">
                {copy.openLane}
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
