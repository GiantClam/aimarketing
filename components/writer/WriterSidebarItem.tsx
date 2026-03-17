"use client"

import { useCallback, useEffect, useState, type MouseEvent, type UIEvent } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  Check,
  ChevronDown,
  ChevronRight,
  Edit2,
  Loader2,
  MessageSquare,
  Plus,
  Trash2,
  X,
} from "lucide-react"

import { useI18n } from "@/components/locale-provider"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { WRITER_PLATFORM_CONFIG } from "@/lib/writer/config"
import {
  deleteWriterSessionMeta,
  getWriterSessionMeta,
  type WriterRefreshDetail,
  WRITER_REFRESH_EVENT,
} from "@/lib/writer/session-store"
import type { WriterConversationSummary } from "@/lib/writer/types"

function getConversationStatusLabel(status: WriterConversationSummary["status"], readySuffix: string, generatingSuffix: string) {
  if (status === "ready") return readySuffix
  if (status === "image_generating") return generatingSuffix
  return ""
}

function mergeConversations(current: WriterConversationSummary[], incoming: WriterConversationSummary[]) {
  const seen = new Set<string>()
  const merged: WriterConversationSummary[] = []

  for (const conversation of [...current, ...incoming]) {
    if (seen.has(conversation.id)) continue
    seen.add(conversation.id)
    merged.push(conversation)
  }

  return merged
}

export function WriterSidebarItem({
  title,
  icon: Icon,
}: {
  title: string
  icon: any
}) {
  const { messages } = useI18n()
  const pathname = usePathname()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [conversations, setConversations] = useState<WriterConversationSummary[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [editingConvId, setEditingConvId] = useState<string | null>(null)
  const [editingConvName, setEditingConvName] = useState("")
  const [pendingDeleteConversation, setPendingDeleteConversation] = useState<WriterConversationSummary | null>(null)
  const [deletingConvId, setDeletingConvId] = useState<string | null>(null)

  const isWriterRoute = pathname.startsWith("/dashboard/writer")
  const isExpanded = isOpen
  const activeConversationId = pathname.match(/^\/dashboard\/writer\/([^/?]+)/)?.[1] || null

  const upsertConversation = (conversation: WriterConversationSummary) => {
    setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)])
  }

  const fetchConversations = useCallback(async ({ append = false, cursor }: { append?: boolean; cursor?: string | null } = {}) => {
    if (append) {
      setIsLoadingMore(true)
    } else {
      setIsLoading(true)
    }
    try {
      const params = new URLSearchParams({ limit: "30" })
      if (cursor) {
        params.set("cursor", cursor)
      }

      const response = await fetch(`/api/writer/conversations?${params.toString()}`)
      if (!response.ok) return
      const data = await response.json()
      const nextBatch = Array.isArray(data?.data) ? (data.data as WriterConversationSummary[]) : []
      setConversations((current) => (append ? mergeConversations(current, nextBatch) : nextBatch))
      setHasMore(Boolean(data?.has_more) && nextBatch.length > 0)
      setNextCursor(typeof data?.next_cursor === "string" ? data.next_cursor : null)
    } catch (error) {
      console.error("Failed to load writer conversations", error)
    } finally {
      if (append) {
        setIsLoadingMore(false)
      } else {
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    if (isWriterRoute) {
      setIsOpen(true)
    }
  }, [isWriterRoute])

  useEffect(() => {
    if (isExpanded) {
      void fetchConversations()
    }
  }, [fetchConversations, isExpanded])

  useEffect(() => {
    const handleRefresh = (event: Event) => {
      const detail = (event as CustomEvent<WriterRefreshDetail>).detail

      if (detail?.action === "upsert") {
        upsertConversation(detail.conversation)
        return
      }

      if (detail?.action === "remove") {
        setConversations((current) => current.filter((item) => item.id !== detail.conversationId))
        return
      }

      if (isExpanded) {
        void fetchConversations()
      }
    }

    window.addEventListener(WRITER_REFRESH_EVENT, handleRefresh)
    return () => window.removeEventListener(WRITER_REFRESH_EVENT, handleRefresh)
  }, [fetchConversations, isExpanded])

  useEffect(() => {
    if (!isExpanded || !activeConversationId || isLoading || isLoadingMore) return
    if (conversations.some((conversation) => conversation.id === activeConversationId)) return
    if (hasMore && nextCursor) {
      void fetchConversations({ append: true, cursor: nextCursor })
    }
  }, [activeConversationId, conversations, fetchConversations, hasMore, isExpanded, isLoading, isLoadingMore, nextCursor])

  const handleListScroll = (event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget
    if (isLoading || isLoadingMore || !hasMore || !nextCursor) return
    if (target.scrollHeight - target.scrollTop - target.clientHeight > 48) return
    void fetchConversations({ append: true, cursor: nextCursor })
  }

  const handleDeleteRequest = (conversation: WriterConversationSummary, event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (deletingConvId) return
    setPendingDeleteConversation(conversation)
  }

  const handleDeleteConfirm = async () => {
    if (!pendingDeleteConversation) return

    const convId = pendingDeleteConversation.id
    const previousConversations = conversations

    setDeletingConvId(convId)
    setConversations((current) => current.filter((item) => item.id !== convId))

    try {
      const response = await fetch(`/api/writer/conversations/${convId}`, { method: "DELETE" })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      deleteWriterSessionMeta(convId)
      setPendingDeleteConversation(null)

      if (pathname === `/dashboard/writer/${convId}`) {
        router.push("/dashboard/writer")
      }
    } catch (error) {
      setConversations(previousConversations)
      console.error("Failed to delete writer conversation", error)
    } finally {
      setDeletingConvId(null)
    }
  }

  const handleRenameStart = (conversation: WriterConversationSummary, event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (deletingConvId) return
    setEditingConvId(conversation.id)
    setEditingConvName(conversation.name || "")
  }

  const handleRenameSave = async (convId: string, event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()

    if (!editingConvName.trim()) return

    const nextName = editingConvName.trim()
    const previousConversations = conversations
    const existing = conversations.find((item) => item.id === convId)
    if (!existing) return

    setConversations((current) => {
      const target = current.find((item) => item.id === convId)
      if (!target) return current
      return [{ ...target, name: nextName, updated_at: Math.floor(Date.now() / 1000) }, ...current.filter((item) => item.id !== convId)]
    })

    try {
      const response = await fetch(`/api/writer/conversations/${convId}/name`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nextName }),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const payload = await response.json().catch(() => null)
      if (payload?.conversation) {
        upsertConversation(payload.conversation as WriterConversationSummary)
      }
      setEditingConvId(null)
      setEditingConvName("")
    } catch (error) {
      setConversations(previousConversations)
      setEditingConvId(null)
      setEditingConvName("")
      console.error("Failed to rename writer conversation", error)
    }
  }

  const handleRenameCancel = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setEditingConvId(null)
    setEditingConvName("")
  }

  return (
    <>
      <div className="mb-2">
        <Button
          variant="ghost"
          className={cn("w-full justify-between font-manrope", isExpanded && "bg-sidebar-accent text-sidebar-accent-foreground")}
          size="sm"
          onClick={() => setIsOpen((current) => !current)}
        >
          <div className="flex items-center">
            <Icon className="mr-2 h-4 w-4" />
            {title}
          </div>
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>

        {isExpanded && (
          <div className="ml-4 mt-1 space-y-1 border-l border-sidebar-border pl-2">
            <Link href="/dashboard/writer">
              <Button
                variant="ghost"
                className="h-8 w-full justify-start text-xs text-primary hover:text-primary/80"
                data-testid="writer-new-session-button"
              >
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
                {conversations.map((conversation) => {
                  const isActive = pathname === `/dashboard/writer/${conversation.id}`
                  const meta = getWriterSessionMeta(conversation.id)
                  const platform = conversation.platform || meta?.platform || "wechat"
                  const mode = conversation.mode || meta?.mode || "article"
                  const language = conversation.language || meta?.language || "auto"
                  const query = new URLSearchParams()
                  const isDeleting = deletingConvId === conversation.id

                  query.set("platform", platform)
                  query.set("mode", mode)
                  query.set("language", language)

                  return (
                    <Link key={conversation.id} href={`/dashboard/writer/${conversation.id}?${query.toString()}`}>
                      <div
                        data-testid={`writer-conversation-${conversation.id}`}
                        className={cn(
                          "group flex items-center justify-between rounded-lg px-3 py-2 text-xs transition-colors",
                          isActive
                            ? "bg-primary/10 font-medium text-primary"
                            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        )}
                      >
                        {editingConvId === conversation.id ? (
                          <div className="flex w-full items-center gap-1" onClick={(event) => event.preventDefault()}>
                            <Input
                              value={editingConvName}
                              onChange={(event) => setEditingConvName(event.target.value)}
                              className="h-6 flex-1 border-primary/50 px-1 py-0 text-xs text-foreground"
                              autoFocus
                            />
                            <button
                              type="button"
                              aria-label={messages.sidebar.saveConversationName}
                              data-testid={`writer-save-rename-${conversation.id}`}
                              onClick={(event) => void handleRenameSave(conversation.id, event)}
                              className="p-1 text-foreground hover:text-green-600"
                            >
                              <Check className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              aria-label={messages.sidebar.cancelRenameConversation}
                              data-testid={`writer-cancel-rename-${conversation.id}`}
                              onClick={handleRenameCancel}
                              className="p-1 text-foreground hover:text-red-600"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex min-w-0 flex-1 items-center gap-2 md:max-w-[160px]">
                              <MessageSquare className="h-3 w-3 shrink-0 opacity-70" />
                              <div className="min-w-0">
                                <div className="truncate">{conversation.name || messages.sidebar.newArticle}</div>
                                <div className="truncate text-[10px] opacity-70">
                                  {WRITER_PLATFORM_CONFIG[platform as keyof typeof WRITER_PLATFORM_CONFIG].shortLabel}
                                  {mode === "thread" ? messages.sidebar.threadSuffix : ""}
                                  {getConversationStatusLabel(conversation.status, messages.sidebar.readySuffix, messages.sidebar.generatingImagesSuffix)}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                              <button
                                type="button"
                                aria-label={messages.shared.rename}
                                data-testid={`writer-rename-${conversation.id}`}
                                onClick={(event) => handleRenameStart(conversation, event)}
                                className="p-1 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={isDeleting}
                              >
                                <Edit2 className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                aria-label={messages.shared.delete}
                                data-testid={`writer-delete-${conversation.id}`}
                                onClick={(event) => handleDeleteRequest(conversation, event)}
                                className="p-1 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                                disabled={isDeleting}
                              >
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
            <Button
              variant="outline"
              data-testid="writer-delete-cancel-button"
              onClick={() => setPendingDeleteConversation(null)}
              disabled={!!deletingConvId}
            >
              {messages.shared.cancel}
            </Button>
            <Button
              variant="destructive"
              data-testid="writer-delete-confirm-button"
              onClick={() => void handleDeleteConfirm()}
              disabled={!!deletingConvId}
            >
              {deletingConvId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {messages.shared.confirmDelete}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
