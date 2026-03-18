"use client"

import { useCallback, useEffect, useState, type MouseEvent } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Check, ChevronDown, ChevronRight, Edit2, Loader2, MessageSquare, Plus, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import Link from "next/link"
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
import { normalizeRouteEntityId } from "@/lib/navigation/route-params"
import { cn } from "@/lib/utils"

interface Conversation {
  id: string
  name: string
  status: string
  created_at: number
}

const ADVISOR_CONVERSATION_CACHE_TTL_MS = 60_000
const ADVISOR_SESSION_PREFETCH_LIMIT = 3
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
    hasMore,
    nextCursor: nextLastId,
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

  return (
    <>
      <div className="mb-2">
        <Button
          variant="ghost"
          className={cn("w-full justify-between font-manrope", isOpen && "bg-sidebar-accent text-sidebar-accent-foreground")}
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
        >
          <div className="flex items-center">
            <Icon className="mr-2 h-4 w-4" />
            {title}
          </div>
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>

        {isOpen && (
          <div className="ml-4 mt-1 space-y-1 border-l border-sidebar-border pl-2">
            <Link href={`/dashboard/advisor/${advisorType}/new`}>
              <Button variant="ghost" className="h-8 w-full justify-start text-xs text-primary hover:text-primary/80">
                <Plus className="mr-2 h-3 w-3" />
                {messages.sidebar.newSession}
              </Button>
            </Link>

            {isLoading && conversations.length === 0 ? (
              <div className="flex items-center px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                {messages.sidebar.loading}
              </div>
            ) : conversations.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">{messages.sidebar.noSessions}</div>
            ) : (
              <div
                className="max-h-72 overflow-y-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                onScroll={handleListScroll}
              >
                {conversations.map((conv) => {
                  const isActive = pathname === `/dashboard/advisor/${advisorType}/${conv.id}`
                  const isDeleting = deletingConvId === conv.id
                  return (
                    <Link key={conv.id} href={`/dashboard/advisor/${advisorType}/${conv.id}`} onMouseEnter={() => void warmConversation(conv.id)}>
                      <div
                        className={cn(
                          "group flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-xs transition-colors",
                          isActive
                            ? "bg-primary/10 font-medium text-primary"
                            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        )}
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
                          <>
                            <div className="flex flex-1 items-center gap-2 truncate md:max-w-[140px]">
                              <MessageSquare className="h-3 w-3 shrink-0 opacity-70" />
                              <span className="truncate">{conv.name || messages.sidebar.newChatFallback}</span>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                              <button onClick={(event) => handleRenameStart(conv, event)} className="p-1 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50" aria-label={messages.shared.rename} disabled={isDeleting}>
                                <Edit2 className="h-3 w-3" />
                              </button>
                              <button onClick={(event) => void handleDeleteRequest(conv, event)} className="p-1 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50" aria-label={messages.shared.delete} disabled={isDeleting}>
                                {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </Link>
                  )
                })}
                {isLoadingMore ? (
                  <div className="flex items-center px-3 py-2 text-xs text-muted-foreground">
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    {messages.sidebar.loading}
                  </div>
                ) : null}
              </div>
            )}
          </div>
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
