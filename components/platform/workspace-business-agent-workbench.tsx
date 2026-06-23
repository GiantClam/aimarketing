"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Bot, History, Plus, X } from "lucide-react"

import {
  AiEntryWorkspace,
  type AiEntryWorkspaceGuideMessage,
  type AiEntryWorkspaceLinkAction,
} from "@/components/ai-entry/ai-entry-workspace"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import type { LocalizedBusinessAgentConfig } from "@/lib/platform/business-agents"
import {
  resolveWorkspaceBusinessSlug,
  type LocalizedWorkspaceBusinessEntry,
  type WorkspaceBusinessSlug,
} from "@/lib/platform/workspace-business"
import { cn } from "@/lib/utils"

type AgentConversationSummary = {
  id: string
  name: string
  updated_at: number
}

type AgentWorkspaceTab = {
  id: string
  agentId: string
  conversationId: string | null
  draftSeed: string
  workspaceVersion: number
}

type BusinessWorkbenchStatePayload = {
  currentViewSlug?: string | null
  activeTabId?: string | null
  tabs?: AgentWorkspaceTab[]
}

function buildCopy(locale: "zh" | "en") {
  if (locale === "zh") {
    return {
      historyTitle: "历史会话",
      historyEmpty: "当前 agent 还没有专属会话。",
      historyLoading: "正在加载历史会话…",
      historyOpen: "打开历史会话",
      newConversation: "新会话",
      closeTab: "关闭标签页",
      noOpenTabs: "还没有打开的 Agent 标签页。",
      historyDescription: "右侧侧滑展示当前标签页对应 agent 的历史会话，点击即可切回该消息时间线。",
    }
  }

  return {
    historyTitle: "Conversation history",
    historyEmpty: "No agent-scoped history yet.",
    historyLoading: "Loading conversation history…",
    historyOpen: "Open conversation history",
    newConversation: "New conversation",
    closeTab: "Close tab",
    noOpenTabs: "No open agent tabs yet.",
    historyDescription: "Open the right-side history tray for the active agent tab and jump back into any prior conversation.",
  }
}

function formatTimestamp(value: number, locale: "zh" | "en") {
  try {
    return new Date(value * 1000).toLocaleString(locale === "zh" ? "zh-CN" : "en-US")
  } catch {
    return String(value)
  }
}

function formatArtifactKind(kind: string, locale: "zh" | "en") {
  if (locale === "en") return `Output: ${kind.replace(/_/g, " ")}`
  const zhMap: Record<string, string> = {
    brief: "产物: 简报",
    plan: "产物: 计划",
    copy: "产物: 文案",
    asset: "产物: 素材",
    workflow_result: "产物: 工作流结果",
    knowledge_note: "产物: 知识条目",
    report: "产物: 报告",
  }
  return zhMap[kind] || `产物: ${kind.replace(/_/g, " ")}`
}

function createAgentTab(agent: LocalizedBusinessAgentConfig, index = 0): AgentWorkspaceTab {
  return {
    id: `${agent.agentId}-${Date.now()}-${index}`,
    agentId: agent.agentId,
    conversationId: null,
    draftSeed: agent.samplePrompts[0] || "",
    workspaceVersion: 0,
  }
}

function dedupeTabsByAgent(input: AgentWorkspaceTab[]) {
  const seen = new Set<string>()
  const deduped: AgentWorkspaceTab[] = []

  for (const tab of input) {
    if (seen.has(tab.agentId)) continue
    seen.add(tab.agentId)
    deduped.push(tab)
  }

  return deduped
}

export function WorkspaceBusinessAgentWorkbench({
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
  const copy = buildCopy(locale)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const queryAgentId = (searchParams.get("agent") || "").trim()
  const queryViewSlug = resolveWorkspaceBusinessSlug(searchParams.get("view"), currentSlug)
  const defaultAgent = agents[0] || null
  const normalizedQueryAgentId = agents.find((agent) => agent.agentId === queryAgentId)?.agentId || ""
  const persistTimeoutRef = useRef<number | null>(null)

  const hydratedRef = useRef(false)
  const tabsRef = useRef<AgentWorkspaceTab[]>([])
  const activeAgentIdRef = useRef<string>("")
  const [tabs, setTabs] = useState<AgentWorkspaceTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [conversationHistory, setConversationHistory] = useState<AgentConversationSummary[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  const sanitizeTabs = useCallback(
    (input: unknown): AgentWorkspaceTab[] => {
      if (!Array.isArray(input)) return []
      return dedupeTabsByAgent(
        input
        .map((item, index) => {
          const agentId = typeof item?.agentId === "string" ? item.agentId.trim() : ""
          if (!agentId || !agents.some((agent) => agent.agentId === agentId)) return null
          return {
            id:
              typeof item?.id === "string" && item.id.trim()
                ? item.id.trim()
                : `${agentId}-${Date.now()}-${index}`,
            agentId,
            conversationId:
              typeof item?.conversationId === "string" && item.conversationId.trim()
                ? item.conversationId.trim()
                : null,
            draftSeed: typeof item?.draftSeed === "string" ? item.draftSeed : "",
            workspaceVersion:
              typeof item?.workspaceVersion === "number" && Number.isFinite(item.workspaceVersion)
                ? Math.max(0, Math.trunc(item.workspaceVersion))
                : 0,
          } satisfies AgentWorkspaceTab
        })
        .filter((item): item is AgentWorkspaceTab => Boolean(item))
        .slice(0, 24),
      )
    },
    [agents],
  )

  useEffect(() => {
    if (!defaultAgent) return
    if (hydratedRef.current) return

    let cancelled = false
    const hydrate = async () => {
      try {
        const response = await fetch("/api/platform/business/workbench-state", {
          cache: "no-store",
          credentials: "same-origin",
        })
        const payload = (await response.json().catch(() => null)) as { data?: BusinessWorkbenchStatePayload } | null
        if (cancelled) return
        if (!response.ok) throw new Error(`http_${response.status}`)

        const state = payload?.data
        let nextTabs = sanitizeTabs(state?.tabs)
        let nextActiveTabId =
          typeof state?.activeTabId === "string" && state.activeTabId.trim() ? state.activeTabId.trim() : null

        if (nextTabs.length === 0) {
          const firstTab = createAgentTab(defaultAgent)
          nextTabs = [firstTab]
          nextActiveTabId = firstTab.id
        }

        const requestedView = resolveWorkspaceBusinessSlug(state?.currentViewSlug || queryViewSlug, currentSlug)
        const requestedDefaultAgent =
          agents.find((agent) => agent.businessSlug === requestedView) || defaultAgent

        if (normalizedQueryAgentId) {
          const existing = nextTabs.find((tab) => tab.agentId === normalizedQueryAgentId)
          if (existing) {
            nextActiveTabId = existing.id
          } else {
            const requestedAgent = agents.find((agent) => agent.agentId === normalizedQueryAgentId) || defaultAgent
            if (requestedAgent) {
              const nextTab = createAgentTab(requestedAgent, nextTabs.length)
              nextTabs = [...nextTabs, nextTab]
              nextActiveTabId = nextTab.id
            }
          }
        } else if (requestedDefaultAgent) {
          const existing = nextTabs.find((tab) => tab.agentId === requestedDefaultAgent.agentId)
          if (existing) {
            nextActiveTabId = existing.id
          } else {
            const nextTab = createAgentTab(requestedDefaultAgent, nextTabs.length)
            nextTabs = [...nextTabs, nextTab]
            nextActiveTabId = nextTab.id
          }
        }

        const validActiveTabId = nextTabs.some((tab) => tab.id === nextActiveTabId)
          ? nextActiveTabId
          : nextTabs[0]?.id || null

        setTabs(nextTabs)
        setActiveTabId(validActiveTabId)
      } catch {
        if (cancelled) return
        const fallbackAgent =
          agents.find((agent) => agent.agentId === normalizedQueryAgentId) ||
          agents.find((agent) => agent.businessSlug === queryViewSlug) ||
          defaultAgent
        if (!fallbackAgent) return
        const firstTab = createAgentTab(fallbackAgent)
        setTabs([firstTab])
        setActiveTabId(firstTab.id)
      } finally {
        if (!cancelled) {
          hydratedRef.current = true
        }
      }
    }

    void hydrate()
    return () => {
      cancelled = true
    }
  }, [agents, currentSlug, defaultAgent, normalizedQueryAgentId, queryViewSlug, sanitizeTabs])

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) || tabs[0] || null,
    [activeTabId, tabs],
  )
  const activeAgentId = activeTab?.agentId || defaultAgent?.agentId || ""
  const activeAgent = useMemo(
    () => agents.find((agent) => agent.agentId === activeAgentId) || defaultAgent || null,
    [activeAgentId, agents, defaultAgent],
  )

  useEffect(() => {
    tabsRef.current = tabs
  }, [tabs])

  useEffect(() => {
    activeAgentIdRef.current = activeAgentId
  }, [activeAgentId])

  const entriesBySlug = useMemo(
    () =>
      new Map<WorkspaceBusinessSlug, LocalizedWorkspaceBusinessEntry>(
        entries.map((entry) => [entry.slug, entry]),
      ),
    [entries],
  )
  const activeEntry = useMemo(() => {
    if (!activeAgent) return entries[0] || null
    return entriesBySlug.get(activeAgent.businessSlug) || entries[0] || null
  }, [activeAgent, entries, entriesBySlug])
  const activeViewSlug = activeAgent?.businessSlug || queryViewSlug || currentSlug
  const currentBusinessAgents = useMemo(
    () => agents.filter((agent) => agent.businessSlug === queryViewSlug),
    [agents, queryViewSlug],
  )
  const currentBusinessDefaultAgent = currentBusinessAgents[0] || defaultAgent || null
  const replaceWorkspaceQuery = useCallback((viewSlug: WorkspaceBusinessSlug, agentId?: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("view", viewSlug)
    const normalizedAgentId = typeof agentId === "string" ? agentId.trim() : ""
    if (normalizedAgentId) {
      params.set("agent", normalizedAgentId)
    } else {
      params.delete("agent")
    }
    const nextSearch = params.toString()
    const nextHref = nextSearch ? `${pathname}?${nextSearch}` : pathname
    const currentSearch = searchParams.toString()
    const currentHref = currentSearch ? `${pathname}?${currentSearch}` : pathname
    if (nextHref === currentHref) return
    router.replace(nextHref, { scroll: false })
  }, [pathname, router, searchParams])

  const applyTabsState = useCallback((nextTabs: AgentWorkspaceTab[], nextActiveTabId: string | null) => {
    tabsRef.current = nextTabs
    setTabs(nextTabs)
    setActiveTabId(nextActiveTabId)
  }, [])

  const openOrFocusAgentTab = useCallback(
    (
      agent: LocalizedBusinessAgentConfig,
      options?: {
        syncQuery?: boolean
        viewSlug?: WorkspaceBusinessSlug
      },
    ) => {
      const currentTabs = tabsRef.current
      const existing = currentTabs.find((tab) => tab.agentId === agent.agentId)
      const viewSlug = options?.viewSlug || agent.businessSlug
      if (existing) {
        setActiveTabId(existing.id)
        if (options?.syncQuery) {
          replaceWorkspaceQuery(viewSlug, existing.agentId)
        }
        return existing.id
      }

      const nextTab = createAgentTab(agent, currentTabs.length)
      const nextTabs = dedupeTabsByAgent([...currentTabs, nextTab]).slice(0, 24)
      const resolvedTab = nextTabs.find((tab) => tab.agentId === agent.agentId) || nextTabs[nextTabs.length - 1] || null
      applyTabsState(nextTabs, resolvedTab?.id || null)
      if (options?.syncQuery && resolvedTab) {
        replaceWorkspaceQuery(viewSlug, resolvedTab.agentId)
      }
      return resolvedTab?.id || null
    },
    [applyTabsState, replaceWorkspaceQuery],
  )

  useLayoutEffect(() => {
    if (!hydratedRef.current || !defaultAgent || !normalizedQueryAgentId) return
    if (activeAgentIdRef.current === normalizedQueryAgentId) return

    const agent = agents.find((item) => item.agentId === normalizedQueryAgentId) || defaultAgent
    openOrFocusAgentTab(agent)
  }, [agents, defaultAgent, normalizedQueryAgentId, openOrFocusAgentTab])

  useLayoutEffect(() => {
    if (!hydratedRef.current || normalizedQueryAgentId || !currentBusinessDefaultAgent) return

    const currentActiveAgent = agents.find((agent) => agent.agentId === activeAgentIdRef.current) || null
    if (currentActiveAgent?.businessSlug === queryViewSlug) return

    openOrFocusAgentTab(currentBusinessDefaultAgent, {
      syncQuery: true,
      viewSlug: currentBusinessDefaultAgent.businessSlug,
    })
  }, [agents, currentBusinessDefaultAgent, normalizedQueryAgentId, openOrFocusAgentTab, queryViewSlug])

  useEffect(() => {
    if (!hydratedRef.current) return

    if (persistTimeoutRef.current) {
      window.clearTimeout(persistTimeoutRef.current)
    }

    persistTimeoutRef.current = window.setTimeout(() => {
      void fetch("/api/platform/business/workbench-state", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({
          currentViewSlug: activeViewSlug,
          activeTabId,
          tabs,
        }),
      }).catch(() => {
        // The workspace remains usable even if account persistence is temporarily unavailable.
      })
    }, 250)

    return () => {
      if (persistTimeoutRef.current) {
        window.clearTimeout(persistTimeoutRef.current)
        persistTimeoutRef.current = null
      }
    }
  }, [activeTabId, activeViewSlug, tabs])

  useEffect(() => {
    if (!activeAgentId) {
      setConversationHistory([])
      return
    }

    let cancelled = false
    const loadHistory = async () => {
      setHistoryLoading(true)
      try {
        const params = new URLSearchParams({
          limit: "20",
          agent: activeAgentId,
        })
        const response = await fetch(`/api/ai/conversations?${params.toString()}`, {
          cache: "no-store",
          credentials: "same-origin",
        })
        const payload = (await response.json().catch(() => null)) as
          | { data?: AgentConversationSummary[] }
          | null
        if (cancelled) return
        if (!response.ok) throw new Error(`http_${response.status}`)
        setConversationHistory(Array.isArray(payload?.data) ? payload.data : [])
      } catch {
        if (cancelled) return
        setConversationHistory([])
      } finally {
        if (!cancelled) setHistoryLoading(false)
      }
    }

    void loadHistory()
    return () => {
      cancelled = true
    }
  }, [activeAgentId, activeTab?.conversationId])

  const accessoryLinks = useMemo<AiEntryWorkspaceLinkAction[]>(() => {
    if (!activeEntry) return []
    const links = activeEntry.relatedLinks.map((item) => ({ label: item.label, href: item.href }))
    if (activeEntry.expertWorkbenchHref) {
      links.push({
        label: activeEntry.expertWorkbenchLabel || (locale === "zh" ? "专家工作台" : "Expert workbench"),
        href: activeEntry.expertWorkbenchHref,
      })
    }
    return links.slice(0, 6)
  }, [activeEntry, locale])

  const accessoryContextChips = useMemo(() => {
    if (!activeAgent) return []
    const workflowChips = activeAgent.workflowSlugs.map((slug) =>
      locale === "zh" ? `工作流: ${slug}` : `Workflow: ${slug}`,
    )
    const artifactChips = activeAgent.artifactKinds.map((kind) => formatArtifactKind(kind, locale))
    return [...workflowChips, ...artifactChips].slice(0, 6)
  }, [activeAgent, locale])
  const activeAgentGuideMessage = useMemo<AiEntryWorkspaceGuideMessage | null>(() => {
    if (!activeAgent) return null
    return {
      title: activeAgent.name,
      body: `${activeAgent.summary}\n\n${activeAgent.systemPromptSummary}`,
      promptLabel: locale === "zh" ? "你可以这样开始：" : "You can start with:",
      prompts: activeAgent.samplePrompts.slice(0, 2),
    }
  }, [activeAgent, locale])

  const updateActiveTab = (updater: (tab: AgentWorkspaceTab) => AgentWorkspaceTab) => {
    if (!activeTab) return
    setTabs((current) =>
      dedupeTabsByAgent(current.map((tab) => (tab.id === activeTab.id ? updater(tab) : tab))),
    )
  }

  const resetActiveConversation = () => {
    if (!activeAgent) return
    updateActiveTab((tab) => ({
      ...tab,
      conversationId: null,
      draftSeed: activeAgent.samplePrompts[0] || "",
      workspaceVersion: tab.workspaceVersion + 1,
    }))
    setHistoryOpen(false)
  }

  const closeTab = (tabId: string) => {
    setTabs((current) => {
      if (current.length <= 1) return current
      const nextTabs = current.filter((tab) => tab.id !== tabId)
      if (activeTabId === tabId) {
        const closedIndex = current.findIndex((tab) => tab.id === tabId)
        const fallback = nextTabs[Math.max(0, closedIndex - 1)] || nextTabs[0] || null
        setActiveTabId(fallback?.id || null)
        if (fallback?.agentId) {
          const fallbackAgent = agents.find((agent) => agent.agentId === fallback.agentId)
          if (fallbackAgent) {
            replaceWorkspaceQuery(fallbackAgent.businessSlug, fallback.agentId)
          }
        }
      }
      return nextTabs
    })
  }

  if (!activeTab || !activeAgent) {
    return (
      <section className="rounded-[12px] border border-border bg-card/75 p-4 text-sm text-muted-foreground">
        {copy.noOpenTabs}
      </section>
    )
  }

  return (
    <section className="flex h-full min-h-0 flex-col space-y-3 overflow-x-hidden sm:space-y-4">
      <div className="flex min-h-0 flex-1 flex-col overflow-x-hidden rounded-[12px] border border-border bg-card/75">
        <div className="border-b border-border bg-muted/20 px-2 py-1 sm:px-3 sm:py-1.5">
          <div className="flex items-center gap-2 overflow-hidden">
            <div
              className="min-w-0 flex-1 overflow-x-auto pb-1 [scrollbar-width:none] touch-pan-x [&::-webkit-scrollbar]:hidden"
              aria-label={locale === "zh" ? "Agent 标签页" : "Agent tabs"}
              role="tablist"
            >
              <div className="flex min-w-max items-end gap-1.5 pr-2">
              {tabs.map((tab) => {
                const agent = agents.find((item) => item.agentId === tab.agentId)
                if (!agent) return null
                const isActive = tab.id === activeTab.id
                return (
                  <div
                    key={tab.id}
                    className={cn(
                      "inline-flex snap-start items-center rounded-t-[10px] border border-b-0 px-3 pb-2 pt-2 text-xs transition",
                      isActive
                        ? "relative -mb-px border-border bg-background text-foreground shadow-sm"
                        : "border-transparent bg-transparent text-muted-foreground hover:border-border/70 hover:bg-background/70 hover:text-foreground",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTabId(tab.id)
                        replaceWorkspaceQuery(agent.businessSlug, tab.agentId)
                      }}
                      className="inline-flex items-center gap-2"
                      role="tab"
                      aria-selected={isActive}
                      aria-current={isActive ? "page" : undefined}
                      title={agent.summary}
                    >
                      <Bot className="h-3.5 w-3.5 shrink-0" />
                      <span className="max-w-[132px] truncate sm:max-w-[188px]">{agent.name}</span>
                    </button>
                    {tabs.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => closeTab(tab.id)}
                        className={cn(
                          "ml-2 inline-flex h-5 w-5 items-center justify-center rounded-[4px] transition",
                          isActive
                            ? "hover:bg-muted"
                            : "hover:bg-primary/10",
                        )}
                        aria-label={copy.closeTab}
                        title={copy.closeTab}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    ) : null}
                  </div>
                )
              })}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 pb-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setHistoryOpen(true)}
                className="dashboard-chip h-8 w-8 rounded-[6px] border border-border bg-background px-0 text-xs text-foreground hover:border-primary hover:bg-primary hover:text-primary-foreground"
                aria-label={copy.historyOpen}
                title={copy.historyOpen}
              >
                <History className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={resetActiveConversation}
                className="dashboard-chip h-8 w-8 rounded-[6px] border border-border bg-background px-0 text-xs text-foreground hover:border-primary hover:bg-primary hover:text-primary-foreground"
                aria-label={copy.newConversation}
                title={copy.newConversation}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 p-1 sm:p-1.5">
          <AiEntryWorkspace
            key={`${activeTab.id}:${activeTab.workspaceVersion}`}
            initialConversationId={activeTab.conversationId}
            embedded
            compactEmbedded
            forcedAgentId={activeAgent.agentId}
            draftSeed={activeTab.draftSeed}
            embeddedPromptButtons={activeAgent.samplePrompts}
            embeddedLinkActions={accessoryLinks}
            embeddedContextChips={accessoryContextChips}
            embeddedGuideMessage={activeAgentGuideMessage}
            onConversationIdChange={(conversationId) => {
              updateActiveTab((tab) => ({
                ...tab,
                conversationId,
              }))
            }}
          />
        </div>
      </div>

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="right" className="w-full border-l border-border bg-card p-0 sm:max-w-[360px]">
          <div className="flex h-full flex-col">
            <SheetHeader className="border-b border-border px-5 py-4 text-left">
              <div className="flex items-start justify-between gap-3 pr-8">
                <div className="min-w-0">
                  <SheetTitle className="text-base">{copy.historyTitle}</SheetTitle>
                  <SheetDescription className="mt-1 text-sm leading-6">
                    {copy.historyDescription}
                  </SheetDescription>
                </div>
                <button
                  type="button"
                  onClick={resetActiveConversation}
                  className="dashboard-chip inline-flex h-8 w-8 items-center justify-center rounded-[6px] border border-border px-0 py-0 text-xs text-foreground transition hover:border-primary hover:bg-primary hover:text-primary-foreground"
                  aria-label={copy.newConversation}
                  title={copy.newConversation}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </SheetHeader>

            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-3 px-4 py-4">
                {historyLoading ? <div className="text-sm text-muted-foreground">{copy.historyLoading}</div> : null}
                {!historyLoading && conversationHistory.length === 0 ? (
                  <div className="text-sm text-muted-foreground">{copy.historyEmpty}</div>
                ) : null}
                {conversationHistory.map((conversation) => {
                  const isSelected = conversation.id === activeTab.conversationId
                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => {
                        updateActiveTab((tab) => ({
                          ...tab,
                          conversationId: conversation.id,
                        }))
                        setHistoryOpen(false)
                      }}
                      className={cn(
                        "w-full rounded-[8px] border px-4 py-3 text-left transition",
                        isSelected
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-background text-foreground/85 hover:border-primary/50 hover:bg-primary/5",
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <History className="mt-0.5 h-4 w-4 shrink-0" />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-foreground">{conversation.name}</div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {formatTimestamp(conversation.updated_at, locale)}
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </ScrollArea>
          </div>
        </SheetContent>
      </Sheet>
    </section>
  )
}
