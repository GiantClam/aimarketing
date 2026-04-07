"use client"

import { useCallback, useEffect, useState, type MouseEvent } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Check, Edit2, Loader2, MessageSquare, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  SidebarCreateLink,
  SidebarListState,
  SidebarSectionBody,
  SidebarSectionToggle,
  SidebarSessionLink,
  SidebarSessionRow,
} from "@/components/dashboard/sidebar-session-ui"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { usePathname, useRouter } from "next/navigation"

import { useI18n } from "@/components/locale-provider"
import {
  ADVISOR_SESSION_CACHE_TTL_MS,
  buildAdvisorConversationCache,
  deleteAdvisorConversationCache,
  getAdvisorConversationCache,
  isAdvisorConversationCacheFresh,
  saveAdvisorConversationCache,
} from "@/lib/advisor/session-store"
import {
  fetchWorkspaceQueryData,
  getAdvisorMessagesPage,
  getAdvisorMessagesQueryKey,
} from "@/lib/query/workspace-cache"
import { useCachedSidebarList } from "@/lib/hooks/use-cached-sidebar-list"
import { useSidebarDetailPrefetch } from "@/lib/hooks/use-sidebar-detail-prefetch"
import { normalizeLeadHunterAdvisorType } from "@/lib/lead-hunter/types"
import { normalizeRouteEntityId } from "@/lib/navigation/route-params"

interface Conversation {
  id: string
  name: string
  status: string
  created_at: number
}

const ADVISOR_CONVERSATION_CACHE_TTL_MS = 60_000
const ADVISOR_SESSION_PREFETCH_LIMIT = 0
const ADVISOR_CONVERSATION_LIST_CACHE_KEY = "advisor-conversations-cache-v2"

function mergeConversations(current: Conversation[], incoming: Conversation[]) {
  const seen = new Set<string>()
  const merged: Conversation[] = []

  for (const conversation of [...current, ...incoming]) {
    if (seen.has(conversation.id)) continue
    seen.add(conversation.id)
    merged.push(conversation)
  }

  return merged
}

export function AdvisorSidebarItem({
  title,
  advisorType,
  userEmail,
  icon: Icon,
}: {
  title: string
  advisorType: string
  userEmail: string
  icon: any
}) {
  const { messages } = useI18n()
  const [isOpen, setIsOpen] = useState(false)
  const [editingConvId, setEditingConvId] = useState<string | null>(null)
  const [editingConvName, setEditingConvName] = useState("")
  const [pendingDeleteConversation, setPendingDeleteConversation] = useState<Conversation | null>(null)
  const [deletingConvId, setDeletingConvId] = useState<string | null>(null)
  const [isCreatingConversation, setIsCreatingConversation] = useState(false)

  const pathname = usePathname()
  const router = useRouter()
  const queryClient = useQueryClient()
  const user = `${userEmail}_${advisorType}`
  const routeConversationId = pathname.match(new RegExp(`^/dashboard/advisor/${advisorType}/([^/]+)$`))?.[1] || null
  const activeConversationId = normalizeRouteEntityId(routeConversationId)

  const {
    items: conversations,
    isLoading,
    isLoadingMore,
    hasMore: _hasMore,
    nextCursor: _nextLastId,
    fetchItems: fetchConversations,
    updateList,
    createSnapshot,
    restoreSnapshot,
    handleListScroll,
  } = useCachedSidebarList<Conversation>({
    cacheKey: `${ADVISOR_CONVERSATION_LIST_CACHE_KEY}:${advisorType}`,
    legacyKeys: [{ area: "local", key: `advisor-conversations-cache-v1:${advisorType}` }],
    ttlMs: ADVISOR_CONVERSATION_CACHE_TTL_MS,
    isExpanded: isOpen,
    activeItemId: activeConversationId,
    fetchPage: async ({ cursor }) => {
      const params = new URLSearchParams({
        user,
        limit: "20",
        advisorType,
      })
      if (cursor) {
        params.set("last_id", cursor)
      }

      const res = await fetch(`/api/dify/conversations?${params.toString()}`)
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      const data = await res.json()
      const nextBatch = Array.isArray(data?.data) ? (data.data as Conversation[]) : []
      const nextHasMore = Boolean(data?.has_more) && nextBatch.length > 0
      const nextCursor = nextHasMore ? nextBatch.at(-1)?.id ?? null : null
      return {
        items: nextBatch,
        hasMore: nextHasMore,
        nextCursor,
      }
    },
    mergeItems: mergeConversations,
    getItemId: (conversation) => conversation.id,
  })

  const prefetchConversation = useCallback(async (conversationId: string) => {
    const cached = getAdvisorConversationCache(advisorType, conversationId)
    if (cached && isAdvisorConversationCacheFresh(cached, ADVISOR_SESSION_CACHE_TTL_MS)) {
      return
    }

    const page = await fetchWorkspaceQueryData(queryClient, {
      queryKey: getAdvisorMessagesQueryKey(advisorType, conversationId, 20),
      queryFn: () => getAdvisorMessagesPage(user, advisorType, conversationId, 20),
    })

    saveAdvisorConversationCache(advisorType, conversationId, buildAdvisorConversationCache(page, title))
  }, [advisorType, queryClient, title, user])

  const { prefetchItem: warmConversation } = useSidebarDetailPrefetch({
    items: conversations,
    activeItemId: activeConversationId,
    prefetchLimit: ADVISOR_SESSION_PREFETCH_LIMIT,
    getItemId: (conversation: Conversation) => conversation.id,
    prefetchItem: prefetchConversation,
  })

  useEffect(() => {
    const handleRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ advisorType?: string }>).detail
      if (detail?.advisorType === advisorType && isOpen) {
        void fetchConversations({ background: conversations.length > 0 }).catch(() => {})
      }
    }
    window.addEventListener("dify-refresh", handleRefresh)
    return () => window.removeEventListener("dify-refresh", handleRefresh)
  }, [advisorType, conversations.length, fetchConversations, isOpen])

  useEffect(() => {
    if (pathname.includes(`/dashboard/advisor/${advisorType}`)) {
      setIsOpen(true)
    }
  }, [pathname, advisorType])

  const handleDeleteRequest = (conversation: Conversation, event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (deletingConvId) return
    setPendingDeleteConversation(conversation)
  }

  const handleDeleteConfirm = async () => {
    if (!pendingDeleteConversation) return

    const convId = pendingDeleteConversation.id
    const previousSnapshot = createSnapshot()
    setDeletingConvId(convId)
    updateList((current) => current.filter((conversation) => conversation.id !== convId))

    try {
      const response = await fetch(`/api/dify/conversations/${convId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, advisorType }),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      deleteAdvisorConversationCache(advisorType, convId)
      setPendingDeleteConversation(null)
      void fetchConversations({ background: previousSnapshot.items.length > 1 }).catch(() => {})
      if (pathname.includes(convId)) {
        router.push(`/dashboard/advisor/${advisorType}/new`)
      }
    } catch (error) {
      restoreSnapshot(previousSnapshot)
      console.error(error)
    } finally {
      setDeletingConvId(null)
    }
  }

  const handleRenameStart = (conv: Conversation, event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (deletingConvId) return
    setEditingConvId(conv.id)
    setEditingConvName(conv.name)
  }

  const handleRenameSave = async (convId: string, event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    try {
      await fetch(`/api/dify/conversations/${convId}/name`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, name: editingConvName, advisorType }),
      })
      setEditingConvId(null)
      void fetchConversations().catch(() => {})
    } catch (error) {
      console.error(error)
    }
  }

  const handleRenameCancel = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setEditingConvId(null)
  }

  const handleCreateConversation = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (isCreatingConversation) return

    setIsCreatingConversation(true)
    try {
      if (!normalizeLeadHunterAdvisorType(advisorType)) {
        router.push(`/dashboard/advisor/${advisorType}/new`)
        return
      }

      const response = await fetch("/api/dify/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          advisorType,
          name: messages.sidebar.newChatFallback,
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`)
      }

      const created = payload?.data as Conversation | undefined
      if (!created?.id) {
        throw new Error("advisor_conversation_create_missing_id")
      }

      updateList((current) => mergeConversations([created], current))
      void fetchConversations().catch(() => {})
      void warmConversation(created.id).catch(() => {})
      router.push(`/dashboard/advisor/${advisorType}/${created.id}`)
    } catch (error) {
      console.error("Failed to create advisor conversation", error)
      router.push(`/dashboard/advisor/${advisorType}/new`)
    } finally {
      setIsCreatingConversation(false)
    }
  }

  return (
    <>
      <div className="mb-2 w-full min-w-0">
        <SidebarSectionToggle title={title} icon={Icon} expanded={isOpen} onToggle={() => setIsOpen(!isOpen)} />

        {isOpen && (
          <SidebarSectionBody>
            <SidebarCreateLink
              href={`/dashboard/advisor/${advisorType}/new`}
              label={messages.sidebar.newSession}
              loading={isCreatingConversation}
              disabled={isCreatingConversation}
              onClick={(event) => void handleCreateConversation(event)}
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
                {conversations.map((conv) => {
                  const isActive = pathname === `/dashboard/advisor/${advisorType}/${conv.id}`
                  const isDeleting = deletingConvId === conv.id
                  return (
                    <SidebarSessionLink
                      key={conv.id}
                      href={`/dashboard/advisor/${advisorType}/${conv.id}`}
                      active={isActive}
                      onWarm={() => void warmConversation(conv.id)}
                    >
                        {editingConvId === conv.id ? (
                          <div className="flex w-full items-center gap-1" onClick={(event) => event.preventDefault()}>
                            <Input
                              value={editingConvName}
                              onChange={(event) => setEditingConvName(event.target.value)}
                              className="h-6 flex-1 border-primary/50 px-1 py-0 text-xs text-foreground"
                              autoFocus
                            />
                            <button onClick={(event) => void handleRenameSave(conv.id, event)} className="p-1 text-foreground hover:text-green-600">
                              <Check className="h-3 w-3" />
                            </button>
                            <button onClick={handleRenameCancel} className="p-1 text-foreground hover:text-red-600">
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <SidebarSessionRow
                            active={isActive}
                            leading={<MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-60" />}
                            title={conv.name || messages.sidebar.newChatFallback}
                            actions={
                              <>
                              <button onClick={(event) => handleRenameStart(conv, event)} className="p-1 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50" aria-label={messages.shared.rename} disabled={isDeleting}>
                                <Edit2 className="h-3 w-3" />
                              </button>
                              <button onClick={(event) => void handleDeleteRequest(conv, event)} className="p-1 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50" aria-label={messages.shared.delete} disabled={isDeleting}>
                                {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
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
                ? messages.sidebar.deleteConversationDescriptionNamed.replace("{name}", pendingDeleteConversation.name)
                : messages.sidebar.deleteConversationDescriptionCurrent}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeleteConversation(null)} disabled={!!deletingConvId}>
              {messages.shared.cancel}
            </Button>
            <Button variant="destructive" onClick={() => void handleDeleteConfirm()} disabled={!!deletingConvId}>
              {deletingConvId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {messages.shared.confirmDelete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
