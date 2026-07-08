"use client"

import { useEffect, useState, type MouseEvent } from "react"
import { Check, Edit2, Loader2, MessageSquare, Trash2, X } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { useI18n } from "@/components/locale-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  SidebarCreateLink,
  SidebarListState,
  SidebarSectionBody,
  SidebarSectionToggle,
  SidebarSessionLink,
  SidebarSessionRow,
} from "@/components/dashboard/sidebar-session-ui"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useCachedSidebarList } from "@/lib/hooks/use-cached-sidebar-list"
import { useSidebarListPreheat } from "@/lib/hooks/use-sidebar-list-preheat"
import { normalizeRouteEntityId } from "@/lib/navigation/route-params"
import { resolveAiEntrySidebarEntryState } from "@/lib/ai-entry/sidebar-entry-state"
import {
  AI_ENTRY_SIDEBAR_REFRESH_EVENT,
  type AiEntrySidebarRefreshDetail,
} from "@/lib/ai-entry/sidebar-refresh-event"
import { resolveAiEntryConversationSummaryPollIntervalMs } from "@/lib/ai-entry/task-run-runtime"

type AiEntryConversationSummary = {
  id: string
  name: string
  status: "normal"
  created_at: number
  updated_at: number
  last_message_at?: number | null
  last_task_event_at?: number | null
  has_unread: boolean
  unread_count: number
  has_running_ppt_task: boolean
  running_ppt_task_count: number
}

const AI_ENTRY_CONVERSATION_LIST_CACHE_KEY = "ai-entry-conversations-cache-v2"
const AI_ENTRY_CONVERSATION_CACHE_TTL_MS = 60_000

function mergeConversations(
  current: AiEntryConversationSummary[],
  incoming: AiEntryConversationSummary[],
) {
  const seen = new Set<string>()
  const merged: AiEntryConversationSummary[] = []

  for (const conversation of [...current, ...incoming]) {
    if (seen.has(conversation.id)) continue
    seen.add(conversation.id)
    merged.push(conversation)
  }

  return merged
}

export function AiEntrySidebarItem({
  title,
  icon: Icon,
  entryHref = "/dashboard/ai",
  activeAgentId = null,
}: {
  title: string
  icon: any
  entryHref?: string
  activeAgentId?: string | null
}) {
  const { messages, locale } = useI18n()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [editingConvId, setEditingConvId] = useState<string | null>(null)
  const [editingConvName, setEditingConvName] = useState("")
  const [deletingConvId, setDeletingConvId] = useState<string | null>(null)
  const [pendingDeleteConversation, setPendingDeleteConversation] =
    useState<AiEntryConversationSummary | null>(null)
  const currentAgentId = (searchParams.get("agent") || "").trim() || null
  const currentEntryMode = (searchParams.get("entry") || "").trim() || null
  const {
    basePath,
    entryMode,
    effectiveAgentId,
    hrefSuffix,
    cacheKeySuffix,
    isMatchedAgent,
  } = resolveAiEntrySidebarEntryState({
    entryHref,
    activeAgentId,
    currentAgentId,
    currentEntryMode,
  })
  const isAiRoute = pathname.startsWith(basePath)
  const routeConversationId = pathname.startsWith(`${basePath}/`)
    ? pathname.slice(basePath.length + 1).split("/")[0] || null
    : null
  const activeConversationId = normalizeRouteEntityId(routeConversationId)

  const {
    items: conversations,
    isLoading,
    isLoadingMore,
    fetchItems: fetchConversations,
    readCache,
    updateList,
    createSnapshot,
    restoreSnapshot,
    handleListScroll,
  } = useCachedSidebarList<AiEntryConversationSummary>({
    cacheKey: `${AI_ENTRY_CONVERSATION_LIST_CACHE_KEY}:${cacheKeySuffix}`,
    ttlMs: AI_ENTRY_CONVERSATION_CACHE_TTL_MS,
    isExpanded: isOpen,
    activeItemId: activeConversationId,
    fetchPage: async ({ cursor }) => {
      const params = new URLSearchParams({ limit: "30" })
      if (cursor) params.set("cursor", cursor)
      if (entryMode) params.set("entryMode", entryMode)
      if (effectiveAgentId) params.set("agent", effectiveAgentId)

      const response = await fetch(`/api/ai/conversations?${params.toString()}`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const payload = await response.json()
      const batch = Array.isArray(payload?.data)
        ? (payload.data as AiEntryConversationSummary[])
        : []
      return {
        items: batch,
        hasMore: Boolean(payload?.has_more) && batch.length > 0,
        nextCursor:
          typeof payload?.next_cursor === "string" ? payload.next_cursor : null,
      }
    },
    mergeItems: mergeConversations,
    getItemId: (item) => item.id,
  })

  useEffect(() => {
    if (isAiRoute && isMatchedAgent) {
      setIsOpen(true)
    }
  }, [isAiRoute, isMatchedAgent])

  useSidebarListPreheat({
    enabled: isAiRoute && isMatchedAgent,
    ttlMs: AI_ENTRY_CONVERSATION_CACHE_TTL_MS,
    readCache,
    fetchItems: fetchConversations,
  })

  useEffect(() => {
    const handleRefresh = (event: Event) => {
      const detail = (event as CustomEvent<AiEntrySidebarRefreshDetail>).detail
      const detailAgentId = typeof detail?.agentId === "string" && detail.agentId.trim()
        ? detail.agentId.trim()
        : null
      const detailEntryMode = typeof detail?.entryMode === "string" && detail.entryMode.trim()
        ? detail.entryMode.trim()
        : null

      if (detailAgentId !== effectiveAgentId) return
      if (detailEntryMode !== entryMode) return
      if (!isOpen) return

      void fetchConversations({ background: conversations.length > 0 }).catch(() => {})
    }

    window.addEventListener(AI_ENTRY_SIDEBAR_REFRESH_EVENT, handleRefresh)
    return () => window.removeEventListener(AI_ENTRY_SIDEBAR_REFRESH_EVENT, handleRefresh)
  }, [conversations.length, effectiveAgentId, entryMode, fetchConversations, isOpen])

  useEffect(() => {
    if (!isOpen) return

    let cancelled = false
    let timeoutId: number | null = null

    const refresh = () => {
      void fetchConversations({ background: conversations.length > 0 }).catch(() => {})
    }

    const scheduleNextRefresh = () => {
      if (cancelled) return
      const intervalMs = resolveAiEntryConversationSummaryPollIntervalMs({
        isDocumentVisible: document.visibilityState === "visible",
      })
      timeoutId = window.setTimeout(() => {
        refresh()
        scheduleNextRefresh()
      }, intervalMs)
    }

    const handleVisibleRefresh = () => {
      if (document.visibilityState !== "visible") return
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
      refresh()
      scheduleNextRefresh()
    }

    scheduleNextRefresh()
    window.addEventListener("focus", handleVisibleRefresh)
    window.addEventListener("online", handleVisibleRefresh)
    window.addEventListener("pageshow", handleVisibleRefresh)
    document.addEventListener("visibilitychange", handleVisibleRefresh)

    return () => {
      cancelled = true
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
      window.removeEventListener("focus", handleVisibleRefresh)
      window.removeEventListener("online", handleVisibleRefresh)
      window.removeEventListener("pageshow", handleVisibleRefresh)
      document.removeEventListener("visibilitychange", handleVisibleRefresh)
    }
  }, [conversations.length, fetchConversations, isOpen])

  const handleCreateConversation = (
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    router.push(`${basePath}${hrefSuffix}`)
  }

  const handleDeleteRequest = (
    conversation: AiEntryConversationSummary,
    event: MouseEvent,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    if (deletingConvId) return
    setPendingDeleteConversation(conversation)
  }

  const handleRenameStart = (
    conversation: AiEntryConversationSummary,
    event: MouseEvent,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    if (deletingConvId) return
    setEditingConvId(conversation.id)
    setEditingConvName(conversation.name || "")
  }

  const handleRenameSave = async (conversationId: string, event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    try {
      const response = await fetch(`/api/ai/conversations/${conversationId}/name`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editingConvName,
          ...(entryMode ? { entryMode } : {}),
          ...(effectiveAgentId ? { agentId: effectiveAgentId } : {}),
        }),
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      setEditingConvId(null)
      void fetchConversations().catch(() => {})
    } catch (error) {
      console.error("Failed to rename AI entry conversation", error)
    }
  }

  const handleRenameCancel = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setEditingConvId(null)
  }

  const handleDeleteConfirm = async () => {
    if (!pendingDeleteConversation) return

    const convId = pendingDeleteConversation.id
    const snapshot = createSnapshot()
    setDeletingConvId(convId)
    updateList((current) => current.filter((item) => item.id !== convId))

    try {
      const deleteUrl = entryMode
        ? `/api/ai/conversations/${convId}?${new URLSearchParams({
            entryMode,
            ...(effectiveAgentId ? { agent: effectiveAgentId } : {}),
          }).toString()}`
        : `/api/ai/conversations/${convId}${effectiveAgentId ? `?agent=${encodeURIComponent(effectiveAgentId)}` : ""}`
      const response = await fetch(deleteUrl, {
        method: "DELETE",
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      setPendingDeleteConversation(null)
      if (pathname === `${basePath}/${convId}` && isMatchedAgent) {
        router.push(`${basePath}${hrefSuffix}`)
      }
    } catch (error) {
      restoreSnapshot(snapshot)
      console.error("Failed to delete AI entry conversation", error)
    } finally {
      setDeletingConvId(null)
    }
  }

  return (
    <>
      <div className="mb-2 w-full min-w-0">
        <SidebarSectionToggle
          title={title}
          icon={Icon}
          expanded={isOpen}
          onToggle={() => setIsOpen((current) => !current)}
        />

        {isOpen && (
          <SidebarSectionBody>
            <SidebarCreateLink
              href={`${basePath}${hrefSuffix}`}
              label={messages.sidebar.newSession}
              testId="ai-entry-new-session-button"
              onClick={handleCreateConversation}
            />

            {isLoading && conversations.length === 0 ? (
              <SidebarListState loading label={messages.sidebar.loading} />
            ) : conversations.length === 0 ? (
              <SidebarListState label={messages.sidebar.noSessions} />
            ) : (
              <div
                className="w-full min-w-0 max-h-72 space-y-2 overflow-x-hidden overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                onScroll={handleListScroll}
              >
                {conversations.map((conversation) => {
                  const isActive =
                    pathname === `${basePath}/${conversation.id}` && isMatchedAgent
                  const isDeleting = deletingConvId === conversation.id
                  return (
                    <SidebarSessionLink
                      key={conversation.id}
                      href={`${basePath}/${conversation.id}${hrefSuffix}`}
                      active={isActive}
                      testId={`ai-entry-conversation-${conversation.id}`}
                    >
                      {editingConvId === conversation.id ? (
                        <div
                          className="flex w-full items-center gap-1"
                          onClick={(event) => event.preventDefault()}
                        >
                          <Input
                            value={editingConvName}
                            onChange={(event) => setEditingConvName(event.target.value)}
                            className="h-6 flex-1 border-primary/50 px-1 py-0 text-xs text-foreground"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={(event) =>
                              void handleRenameSave(conversation.id, event)
                            }
                            className="p-1 text-foreground hover:text-green-600"
                            aria-label={messages.sidebar.saveConversationName}
                          >
                            <Check className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={handleRenameCancel}
                            className="p-1 text-foreground hover:text-red-600"
                            aria-label={messages.sidebar.cancelRenameConversation}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <SidebarSessionRow
                          active={isActive}
                          leading={
                            <div className="relative">
                              <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-60" />
                              {conversation.has_running_ppt_task ? (
                                <Loader2 className="absolute -right-2 -top-1 h-3 w-3 animate-spin text-primary" />
                              ) : null}
                              {conversation.has_unread ? (
                                <span className="absolute -right-1.5 -top-1.5 h-2.5 w-2.5 rounded-full bg-red-500" />
                              ) : null}
                            </div>
                          }
                          title={conversation.name || messages.sidebar.newChatFallback}
                          subtitle={
                            conversation.has_running_ppt_task
                              ? locale === "zh"
                                ? `生成中 · ${conversation.running_ppt_task_count}`
                                : `Running · ${conversation.running_ppt_task_count}`
                              : undefined
                          }
                          actions={
                            <>
                              <button
                                type="button"
                                aria-label={messages.shared.rename}
                                onClick={(event) =>
                                  handleRenameStart(conversation, event)
                                }
                                className="p-1 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={isDeleting}
                              >
                                <Edit2 className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                aria-label={messages.shared.delete}
                                data-testid={`ai-entry-delete-${conversation.id}`}
                                onClick={(event) =>
                                  handleDeleteRequest(conversation, event)
                                }
                                className="p-1 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={isDeleting}
                              >
                                {isDeleting ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3 w-3" />
                                )}
                              </button>
                            </>
                          }
                        />
                      )}
                    </SidebarSessionLink>
                  )
                })}
                {isLoadingMore ? (
                  <SidebarListState loading label={messages.sidebar.loading} />
                ) : null}
              </div>
            )}
          </SidebarSectionBody>
        )}
      </div>

      <Dialog
        open={!!pendingDeleteConversation}
        onOpenChange={(open) => {
          if (!open && !deletingConvId) {
            setPendingDeleteConversation(null)
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{messages.sidebar.deleteConversationTitle}</DialogTitle>
            <DialogDescription>
              {messages.sidebar.deleteConversationDescriptionPrefix}{" "}
              {pendingDeleteConversation?.name
                ? messages.sidebar.deleteConversationDescriptionNamed.replace(
                    "{name}",
                    pendingDeleteConversation.name,
                  )
                : messages.sidebar.deleteConversationDescriptionCurrent}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingDeleteConversation(null)}
              disabled={!!deletingConvId}
            >
              {messages.shared.cancel}
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDeleteConfirm()}
              disabled={!!deletingConvId}
            >
              {deletingConvId ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {messages.shared.confirmDelete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
