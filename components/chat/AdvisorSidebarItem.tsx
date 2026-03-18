"use client"

import { useCallback, useEffect, useState, type MouseEvent, type UIEvent } from "react"
import { Check, ChevronDown, ChevronRight, Edit2, Loader2, MessageSquare, Plus, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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

type AdvisorConversationCache = {
  conversations: Conversation[]
  hasMore: boolean
  nextLastId: string | null
  updatedAt: number
}

const ADVISOR_CONVERSATION_CACHE_TTL_MS = 60_000

function getAdvisorConversationCacheKey(advisorType: string) {
  return `advisor-conversations-cache-v1:${advisorType}`
}

function readAdvisorConversationCache(advisorType: string): AdvisorConversationCache | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(getAdvisorConversationCacheKey(advisorType))
    if (!raw) return null
    return JSON.parse(raw) as AdvisorConversationCache
  } catch {
    return null
  }
}

function writeAdvisorConversationCache(advisorType: string, value: AdvisorConversationCache) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(getAdvisorConversationCacheKey(advisorType), JSON.stringify(value))
  } catch {}
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
  const [pendingDeleteConversation, setPendingDeleteConversation] = useState<Conversation | null>(null)
  const [deletingConvId, setDeletingConvId] = useState<string | null>(null)

  const pathname = usePathname()
  const router = useRouter()
  const user = `${userEmail}_${advisorType}`
  const activeConversationId = pathname.match(new RegExp(`^/dashboard/advisor/${advisorType}/([^/]+)$`))?.[1] || null

  useEffect(() => {
    const cached = readAdvisorConversationCache(advisorType)
    if (!cached) return
    setConversations(cached.conversations)
    setHasMore(cached.hasMore)
    setNextLastId(cached.nextLastId)
  }, [advisorType])

  const fetchConversations = useCallback(async ({ append = false, lastId, background = false }: { append?: boolean; lastId?: string | null; background?: boolean } = {}) => {
    if (append) {
      setIsLoadingMore(true)
    } else if (!background) {
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
        const nextHasMore = Boolean(data?.has_more) && nextBatch.length > 0
        const nextCursor = nextHasMore ? nextBatch.at(-1)?.id ?? null : null
        setConversations((current) => {
          const nextConversations = append ? mergeConversations(current, nextBatch) : nextBatch
          writeAdvisorConversationCache(advisorType, {
            conversations: nextConversations,
            hasMore: nextHasMore,
            nextLastId: nextCursor,
            updatedAt: Date.now(),
          })
          return nextConversations
        })
        setHasMore(nextHasMore)
        setNextLastId(nextCursor)
      }
    } catch (error) {
      console.error("Failed to load conversations", error)
    } finally {
      if (append) {
        setIsLoadingMore(false)
      } else if (!background) {
        setIsLoading(false)
      }
    }
  }, [advisorType, user])

  useEffect(() => {
    if (isOpen) {
      const cached = readAdvisorConversationCache(advisorType)
      const isFresh = Boolean(cached && Date.now() - cached.updatedAt < ADVISOR_CONVERSATION_CACHE_TTL_MS)
      void fetchConversations({ background: Boolean(isFresh && cached && cached.conversations.length > 0) })
    }
  }, [fetchConversations, isOpen])

  useEffect(() => {
    const handleRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ advisorType?: string }>).detail
      if (detail?.advisorType === advisorType && isOpen) {
        void fetchConversations({ background: conversations.length > 0 })
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

  const handleDeleteRequest = async (conversation: Conversation, event: MouseEvent) => {
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
    setConversations((current) => current.filter((conversation) => conversation.id !== convId))

    try {
      const response = await fetch(`/api/dify/conversations/${convId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, advisorType }),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      setPendingDeleteConversation(null)
      void fetchConversations({ background: previousConversations.length > 1 })
      if (pathname.includes(convId)) {
        router.push(`/dashboard/advisor/${advisorType}/new`)
      }
    } catch (error) {
      setConversations(previousConversations)
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
      void fetchConversations()
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
