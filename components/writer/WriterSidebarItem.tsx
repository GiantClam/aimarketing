"use client"

import { useEffect, useState, type MouseEvent } from "react"
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

const getConversationStatusLabel = (status: WriterConversationSummary["status"]) => {
  if (status === "ready") return " / 已完成"
  if (status === "image_generating") return " / 配图中"
  return ""
}

export function WriterSidebarItem({
  title,
  icon: Icon,
}: {
  title: string
  icon: any
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [conversations, setConversations] = useState<WriterConversationSummary[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [editingConvId, setEditingConvId] = useState<string | null>(null)
  const [editingConvName, setEditingConvName] = useState("")
  const [pendingDeleteConversation, setPendingDeleteConversation] = useState<WriterConversationSummary | null>(null)
  const [deletingConvId, setDeletingConvId] = useState<string | null>(null)

  const isWriterRoute = pathname.startsWith("/dashboard/writer")
  const isExpanded = isOpen || isWriterRoute

  const upsertConversation = (conversation: WriterConversationSummary) => {
    setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)].slice(0, 30))
  }

  const fetchConversations = async () => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/writer/conversations?limit=30")
      if (!response.ok) return
      const data = await response.json()
      setConversations(data.data || [])
    } catch (error) {
      console.error("Failed to load writer conversations", error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isWriterRoute) {
      setIsOpen(true)
    }
  }, [isWriterRoute])

  useEffect(() => {
    if (isExpanded) {
      void fetchConversations()
    }
  }, [isExpanded])

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
  }, [isExpanded])

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
                新建会话
              </Button>
            </Link>

            {isLoading && conversations.length === 0 ? (
              <div className="flex items-center px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                加载中...
              </div>
            ) : conversations.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">暂无会话</div>
            ) : (
              conversations.map((conversation) => {
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
                            aria-label="保存会话名称"
                            data-testid={`writer-save-rename-${conversation.id}`}
                            onClick={(event) => void handleRenameSave(conversation.id, event)}
                            className="p-1 text-foreground hover:text-green-600"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            aria-label="取消重命名会话"
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
                              <div className="truncate">{conversation.name || "新建文章"}</div>
                              <div className="truncate text-[10px] opacity-70">
                                {WRITER_PLATFORM_CONFIG[platform as keyof typeof WRITER_PLATFORM_CONFIG].shortLabel}
                                {mode === "thread" ? " / 线程" : ""}
                                {getConversationStatusLabel(conversation.status)}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              type="button"
                              aria-label="重命名会话"
                              data-testid={`writer-rename-${conversation.id}`}
                              onClick={(event) => handleRenameStart(conversation, event)}
                              className="p-1 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={isDeleting}
                            >
                              <Edit2 className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              aria-label="删除会话"
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
              })
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
            <DialogTitle>确认删除会话</DialogTitle>
            <DialogDescription>
              删除后无法恢复。
              {pendingDeleteConversation?.name ? ` 你将删除“${pendingDeleteConversation.name}”。` : " 你将删除当前会话。"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              data-testid="writer-delete-cancel-button"
              onClick={() => setPendingDeleteConversation(null)}
              disabled={!!deletingConvId}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              data-testid="writer-delete-confirm-button"
              onClick={() => void handleDeleteConfirm()}
              disabled={!!deletingConvId}
            >
              {deletingConvId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
