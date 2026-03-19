"use client"

import { useCallback, useEffect, useState, type MouseEvent } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { Check, Edit2, ImageIcon, Loader2, Trash2, X } from "lucide-react"

import { useI18n } from "@/components/locale-provider"
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
import {
  deleteImageAssistantSessionContentCache,
  getImageAssistantSessionContentCache,
  IMAGE_ASSISTANT_SESSION_CACHE_TTL_MS,
  isImageAssistantSessionContentCacheFresh,
  saveImageAssistantSessionContentCache,
} from "@/lib/image-assistant/session-store"
import type { ImageAssistantConversationSummary } from "@/lib/image-assistant/types"
import {
  fetchWorkspaceQueryData,
  getImageAssistantDetailQueryKey,
  getImageAssistantSessionDetail,
} from "@/lib/query/workspace-cache"
import { useCachedSidebarList } from "@/lib/hooks/use-cached-sidebar-list"
import { useSidebarDetailPrefetch } from "@/lib/hooks/use-sidebar-detail-prefetch"
import { normalizeRouteEntityId } from "@/lib/navigation/route-params"

function mergeSessions(current: ImageAssistantConversationSummary[], incoming: ImageAssistantConversationSummary[]) {
  const seen = new Set<string>()
  const merged: ImageAssistantConversationSummary[] = []

  for (const session of [...current, ...incoming]) {
    if (seen.has(session.id)) continue
    seen.add(session.id)
    merged.push(session)
  }

  return merged
}

const IMAGE_ASSISTANT_CONVERSATION_CACHE_TTL_MS = 60_000
const IMAGE_ASSISTANT_SESSION_PREFETCH_LIMIT = 3
const IMAGE_ASSISTANT_CONVERSATION_LIST_CACHE_KEY = "image-assistant-conversations-cache-v2"

export function ImageAssistantSidebarItem({
  title,
  icon: Icon,
}: {
  title: string
  icon: typeof ImageIcon
}) {
  const { messages } = useI18n()
  const pathname = usePathname()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [isOpen, setIsOpen] = useState(false)
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null)
  const [editingSessionName, setEditingSessionName] = useState("")
  const [pendingDeleteSession, setPendingDeleteSession] = useState<ImageAssistantConversationSummary | null>(null)
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null)

  const isImageAssistantRoute = pathname.startsWith("/dashboard/image-assistant")
  const isExpanded = isOpen
  const activeSessionId = normalizeRouteEntityId(pathname.match(/^\/dashboard\/image-assistant\/([^/]+)$/)?.[1] || null)

  const {
    items: sessions,
    isLoading,
    isLoadingMore,
    hasMore,
    nextCursor,
    fetchItems: fetchSessions,
    updateList,
    createSnapshot,
    restoreSnapshot,
    handleListScroll,
  } = useCachedSidebarList<ImageAssistantConversationSummary>({
    cacheKey: IMAGE_ASSISTANT_CONVERSATION_LIST_CACHE_KEY,
    legacyKeys: [{ area: "local", key: "image-assistant-conversations-cache-v1" }],
    ttlMs: IMAGE_ASSISTANT_CONVERSATION_CACHE_TTL_MS,
    isExpanded,
    activeItemId: activeSessionId,
    fetchPage: async ({ cursor }) => {
      const params = new URLSearchParams({ limit: "20" })
      if (cursor) {
        params.set("cursor", cursor)
      }

      const response = await fetch(`/api/image-assistant/sessions?${params.toString()}`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const data = await response.json()
      const nextBatch = Array.isArray(data?.data) ? (data.data as ImageAssistantConversationSummary[]) : []
      return {
        items: nextBatch,
        hasMore: Boolean(data?.has_more) && nextBatch.length > 0,
        nextCursor: typeof data?.next_cursor === "string" ? data.next_cursor : null,
      }
    },
    mergeItems: mergeSessions,
    getItemId: (session) => session.id,
  })

  const prefetchSessionDetail = useCallback(async (targetSessionId: string) => {
    const cached = getImageAssistantSessionContentCache(targetSessionId)
    if (cached && isImageAssistantSessionContentCacheFresh(cached, IMAGE_ASSISTANT_SESSION_CACHE_TTL_MS)) {
      return
    }

    const detail = await fetchWorkspaceQueryData(queryClient, {
      queryKey: getImageAssistantDetailQueryKey(targetSessionId, {
        mode: "content",
        messageLimit: 12,
        versionLimit: 6,
      }),
      queryFn: () =>
        getImageAssistantSessionDetail(targetSessionId, {
          mode: "content",
          messageLimit: 12,
          versionLimit: 6,
        }),
    })

    saveImageAssistantSessionContentCache(targetSessionId, detail)
  }, [queryClient])
  useEffect(() => {
    if (isImageAssistantRoute) {
      setIsOpen(true)
    }
  }, [isImageAssistantRoute])

  const { prefetchItem: warmSessionDetail } = useSidebarDetailPrefetch({
    items: sessions,
    activeItemId: activeSessionId,
    prefetchLimit: IMAGE_ASSISTANT_SESSION_PREFETCH_LIMIT,
    getItemId: (session: ImageAssistantConversationSummary) => session.id,
    prefetchItem: prefetchSessionDetail,
  })

  const handleRenameStart = (session: ImageAssistantConversationSummary, event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (deletingSessionId) return
    setEditingSessionId(session.id)
    setEditingSessionName(session.name || "")
  }

  const handleRenameSave = async (sessionId: string, event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const nextName = editingSessionName.trim()
    if (!nextName) return

    updateList((current) => current.map((session) => (session.id === sessionId ? { ...session, name: nextName } : session)))
    try {
      await fetch(`/api/image-assistant/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: nextName }),
      })
      setEditingSessionId(null)
      setEditingSessionName("")
      void fetchSessions().catch(() => {})
    } catch (error) {
      console.error("Failed to rename image assistant session", error)
    }
  }

  const handleRenameCancel = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setEditingSessionId(null)
    setEditingSessionName("")
  }

  const handleDeleteRequest = (session: ImageAssistantConversationSummary, event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (deletingSessionId) return
    setPendingDeleteSession(session)
  }

  const handleDeleteConfirm = async () => {
    if (!pendingDeleteSession) return

    const nextSessionId = pendingDeleteSession.id
    const previousSnapshot = createSnapshot()
    setDeletingSessionId(nextSessionId)
    updateList((current) => current.filter((session) => session.id !== nextSessionId))

    try {
      const response = await fetch(`/api/image-assistant/sessions/${nextSessionId}`, {
        method: "DELETE",
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      deleteImageAssistantSessionContentCache(nextSessionId)
      setPendingDeleteSession(null)
      if (pathname === `/dashboard/image-assistant/${nextSessionId}`) {
        router.push("/dashboard/image-assistant")
      }
    } catch (error) {
      restoreSnapshot(previousSnapshot)
      console.error("Failed to delete image assistant session", error)
    } finally {
      setDeletingSessionId(null)
    }
  }

  return (
    <>
      <div className="mb-2">
        <SidebarSectionToggle title={title} icon={Icon} expanded={isExpanded} onToggle={() => setIsOpen((current) => !current)} />

        {isExpanded ? (
          <SidebarSectionBody>
            <SidebarCreateLink href="/dashboard/image-assistant" label={messages.sidebar.newDesign} />

            {isLoading && sessions.length === 0 ? (
              <SidebarListState loading label={messages.sidebar.loading} />
            ) : sessions.length === 0 ? (
              <SidebarListState label={messages.sidebar.noDesignSessions} />
            ) : (
              <div
                className="max-h-72 overflow-y-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                onScroll={handleListScroll}
              >
                {sessions.map((session) => {
                  const isActive = pathname === `/dashboard/image-assistant/${session.id}`
                  const isDeleting = deletingSessionId === session.id
                  return (
                    <SidebarSessionLink
                      key={session.id}
                      href={`/dashboard/image-assistant/${session.id}`}
                      onWarm={() => void warmSessionDetail(session.id)}
                      active={isActive}
                    >
                        {editingSessionId === session.id ? (
                          <div className="flex w-full items-center gap-1" onClick={(event) => event.preventDefault()}>
                            <Input
                              value={editingSessionName}
                              onChange={(event) => setEditingSessionName(event.target.value)}
                              className="h-6 flex-1 border-primary/50 px-1 py-0 text-xs text-foreground"
                              autoFocus
                            />
                            <button type="button" onClick={(event) => void handleRenameSave(session.id, event)} className="p-1 text-foreground hover:text-green-600">
                              <Check className="h-3 w-3" />
                            </button>
                            <button type="button" onClick={handleRenameCancel} className="p-1 text-foreground hover:text-red-600">
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <SidebarSessionRow
                            active={isActive}
                            leading={
                              session.cover_asset_url ? (
                                <img
                                  src={session.cover_asset_url}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                  className="h-6 w-6 shrink-0 rounded-md object-cover"
                                />
                              ) : (
                                <ImageIcon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                              )
                            }
                            title={session.name || messages.sidebar.newDesignFallback}
                            subtitle={session.current_mode === "canvas" ? messages.sidebar.hasCanvasDraft : messages.sidebar.conversationInProgress}
                            actions={
                              <>
                              <button type="button" onClick={(event) => handleRenameStart(session, event)} className="p-1 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50" disabled={isDeleting} aria-label={messages.shared.rename}>
                                <Edit2 className="h-3 w-3" />
                              </button>
                              <button type="button" onClick={(event) => handleDeleteRequest(session, event)} className="p-1 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50" disabled={isDeleting} aria-label={messages.shared.delete}>
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
        ) : null}
      </div>

      <Dialog
        open={!!pendingDeleteSession}
        onOpenChange={(open) => {
          if (!open && !deletingSessionId) {
            setPendingDeleteSession(null)
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{messages.sidebar.deleteDesignTitle}</DialogTitle>
            <DialogDescription>
              {messages.sidebar.deleteConversationDescriptionPrefix}{" "}
              {pendingDeleteSession?.name
                ? messages.sidebar.deleteDesignDescriptionNamed.replace("{name}", pendingDeleteSession.name)
                : messages.sidebar.deleteDesignDescriptionCurrent}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeleteSession(null)} disabled={!!deletingSessionId}>
              {messages.shared.cancel}
            </Button>
            <Button variant="destructive" onClick={() => void handleDeleteConfirm()} disabled={!!deletingSessionId}>
              {deletingSessionId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {messages.shared.confirmDelete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
