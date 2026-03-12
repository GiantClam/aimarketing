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
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { WRITER_PLATFORM_CONFIG } from "@/lib/writer/config"
import {
  deleteWriterSessionMeta,
  emitWriterRefresh,
  getWriterSessionMeta,
  WRITER_REFRESH_EVENT,
} from "@/lib/writer/session-store"

type WriterConversation = {
  id: string
  name: string
  status: string
  created_at: number
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
  const [conversations, setConversations] = useState<WriterConversation[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [editingConvId, setEditingConvId] = useState<string | null>(null)
  const [editingConvName, setEditingConvName] = useState("")

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
    if (pathname.startsWith("/dashboard/writer")) {
      setIsOpen(true)
    }
  }, [pathname])

  useEffect(() => {
    if (isOpen) {
      void fetchConversations()
    }
  }, [isOpen])

  useEffect(() => {
    const handleRefresh = () => {
      if (isOpen) {
        void fetchConversations()
      }
    }

    window.addEventListener(WRITER_REFRESH_EVENT, handleRefresh)
    return () => window.removeEventListener(WRITER_REFRESH_EVENT, handleRefresh)
  }, [isOpen])

  const handleDelete = async (convId: string, event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()

    try {
      await fetch(`/api/writer/conversations/${convId}`, { method: "DELETE" })
      deleteWriterSessionMeta(convId)
      emitWriterRefresh()

      if (pathname.includes(convId)) {
        router.push("/dashboard/writer")
      } else {
        void fetchConversations()
      }
    } catch (error) {
      console.error("Failed to delete writer conversation", error)
    }
  }

  const handleRenameStart = (conv: WriterConversation, event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setEditingConvId(conv.id)
    setEditingConvName(conv.name || "")
  }

  const handleRenameSave = async (convId: string, event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()

    if (!editingConvName.trim()) return

    try {
      await fetch(`/api/writer/conversations/${convId}/name`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingConvName.trim() }),
      })
      setEditingConvId(null)
      setEditingConvName("")
      emitWriterRefresh()
      void fetchConversations()
    } catch (error) {
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
    <div className="mb-2">
      <Button
        variant="ghost"
        className={cn("w-full justify-between font-manrope", isOpen && "bg-sidebar-accent text-sidebar-accent-foreground")}
        size="sm"
        onClick={() => setIsOpen((current) => !current)}
      >
        <div className="flex items-center">
          <Icon className="mr-2 h-4 w-4" />
          {title}
        </div>
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </Button>

      {isOpen && (
        <div className="ml-4 mt-1 space-y-1 border-l border-sidebar-border pl-2">
          <Link href="/dashboard/writer">
            <Button variant="ghost" className="h-8 w-full justify-start text-xs text-primary hover:text-primary/80">
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
              const query = new URLSearchParams()
              query.set("platform", meta?.platform || "wechat")
              query.set("mode", meta?.mode || "article")
              const href = `/dashboard/writer/${conversation.id}?${query.toString()}`

              return (
                <Link key={conversation.id} href={href}>
                  <div
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
                        <button onClick={(event) => void handleRenameSave(conversation.id, event)} className="p-1 text-foreground hover:text-green-600">
                          <Check className="h-3 w-3" />
                        </button>
                        <button onClick={handleRenameCancel} className="p-1 text-foreground hover:text-red-600">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex min-w-0 flex-1 items-center gap-2 md:max-w-[150px]">
                          <MessageSquare className="h-3 w-3 shrink-0 opacity-70" />
                          <div className="min-w-0">
                            <div className="truncate">{conversation.name || "新文章"}</div>
                            {meta && (
                              <div className="truncate text-[10px] opacity-70">
                                {WRITER_PLATFORM_CONFIG[meta.platform].shortLabel}
                                {meta.mode === "thread" ? " · 线程" : ""}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <button onClick={(event) => handleRenameStart(conversation, event)} className="p-1 hover:text-foreground">
                            <Edit2 className="h-3 w-3" />
                          </button>
                          <button onClick={(event) => void handleDelete(conversation.id, event)} className="p-1 hover:text-destructive">
                            <Trash2 className="h-3 w-3" />
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
  )
}
