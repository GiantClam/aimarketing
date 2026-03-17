"use client"

import { useCallback, useEffect, useState, type UIEvent } from "react"
import { Check, ChevronDown, ChevronRight, Edit2, Loader2, MessageSquare, Plus, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

import { useI18n } from "@/components/locale-provider"
import { cn } from "@/lib/utils"

interface Conversation {
  id: string
  name: string
  status: string
  created_at: number
}

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
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [nextLastId, setNextLastId] = useState<string | null>(null)
  const [editingConvId, setEditingConvId] = useState<string | null>(null)
  const [editingConvName, setEditingConvName] = useState("")

  const pathname = usePathname()
  const router = useRouter()
  const user = `${userEmail}_${advisorType}`
  const activeConversationId = pathname.match(new RegExp(`^/dashboard/advisor/${advisorType}/([^/]+)$`))?.[1] || null

  const fetchConversations = useCallback(async ({ append = false, lastId }: { append?: boolean; lastId?: string | null } = {}) => {
    if (append) {
      setIsLoadingMore(true)
    } else {
      setIsLoading(true)
    }
    try {
      const params = new URLSearchParams({
        user,
        limit: "20",
        advisorType,
      })
      if (lastId) {
        params.set("last_id", lastId)
      }

      const res = await fetch(`/api/dify/conversations?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        const nextBatch = Array.isArray(data?.data) ? (data.data as Conversation[]) : []
        setConversations((current) => (append ? mergeConversations(current, nextBatch) : nextBatch))
        setHasMore(Boolean(data?.has_more) && nextBatch.length > 0)
        setNextLastId(Boolean(data?.has_more) && nextBatch.length > 0 ? nextBatch.at(-1)?.id ?? null : null)
      }
    } catch (error) {
      console.error("Failed to load conversations", error)
    } finally {
      if (append) {
        setIsLoadingMore(false)
      } else {
        setIsLoading(false)
      }
    }
  }, [advisorType, user])

  useEffect(() => {
    if (isOpen) {
      void fetchConversations()
    }
  }, [fetchConversations, isOpen])

  useEffect(() => {
    const handleRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ advisorType?: string }>).detail
      if (detail?.advisorType === advisorType && isOpen) {
        void fetchConversations()
      }
    }
    window.addEventListener("dify-refresh", handleRefresh)
    return () => window.removeEventListener("dify-refresh", handleRefresh)
  }, [advisorType, fetchConversations, isOpen])

  useEffect(() => {
    if (pathname.includes(`/dashboard/advisor/${advisorType}`)) {
      setIsOpen(true)
    }
  }, [pathname, advisorType])

  useEffect(() => {
    if (!isOpen || !activeConversationId || isLoading || isLoadingMore) return
    if (conversations.some((conversation) => conversation.id === activeConversationId)) return
    if (hasMore && nextLastId) {
      void fetchConversations({ append: true, lastId: nextLastId })
    }
  }, [activeConversationId, conversations, fetchConversations, hasMore, isLoading, isLoadingMore, isOpen, nextLastId])

  const handleListScroll = (event: UIEvent<HTMLDivElement>) => {
    const target = event.currentTarget
    if (isLoading || isLoadingMore || !hasMore || !nextLastId) return
    if (target.scrollHeight - target.scrollTop - target.clientHeight > 48) return
    void fetchConversations({ append: true, lastId: nextLastId })
  }

  const handleDelete = async (convId: string, event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    try {
      await fetch(`/api/dify/conversations/${convId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, advisorType }),
      })
      void fetchConversations()
      if (pathname.includes(convId)) {
        router.push(`/dashboard/advisor/${advisorType}/new`)
      }
    } catch (error) {
      console.error(error)
    }
  }

  const handleRenameStart = (conv: Conversation, event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setEditingConvId(conv.id)
    setEditingConvName(conv.name)
  }

  const handleRenameSave = async (convId: string, event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    try {
      await fetch(`/api/dify/conversations/${convId}/name`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, name: editingConvName, advisorType }),
      })
      setEditingConvId(null)
      void fetchConversations()
    } catch (error) {
      console.error(error)
    }
  }

  const handleRenameCancel = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    setEditingConvId(null)
  }

  return (
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
                return (
                  <Link key={conv.id} href={`/dashboard/advisor/${advisorType}/${conv.id}`}>
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
                            <button onClick={(event) => handleRenameStart(conv, event)} className="p-1 hover:text-foreground" aria-label={messages.shared.rename}>
                              <Edit2 className="h-3 w-3" />
                            </button>
                            <button onClick={(event) => void handleDelete(conv.id, event)} className="p-1 hover:text-destructive" aria-label={messages.shared.delete}>
                              <Trash2 className="h-3 w-3" />
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
  )
}
