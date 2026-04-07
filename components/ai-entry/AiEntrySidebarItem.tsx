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
import { normalizeRouteEntityId } from "@/lib/navigation/route-params"
import {
  AI_ENTRY_CONSULTING_ENTRY_MODE,
  AI_ENTRY_SONNET_46_MODEL_HINT,
  isConsultingAdvisorEntryMode,
} from "@/lib/ai-entry/model-policy"

type AiEntryConversationSummary = {
  id: string
  name: string
  status: "normal"
  created_at: number
  updated_at: number
}

const AI_ENTRY_CONVERSATION_LIST_CACHE_KEY = "ai-entry-conversations-cache-v1"
const AI_ENTRY_CONVERSATION_CACHE_TTL_MS = 60_000
const AI_ENTRY_SELECTED_MODEL_STORAGE_KEY = "ai-entry-selected-model-id-v1"

function readPersistedAiEntrySelectedModelId() {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(AI_ENTRY_SELECTED_MODEL_STORAGE_KEY)
    const normalized = typeof raw === "string" ? raw.trim() : ""
    return normalized || null
  } catch {
    return null
  }
}

function isTransientAiEntryConversationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "")
  const normalized = message.toLowerCase()
  return (
    normalized.includes("failed query:") ||
    normalized.includes("auth_session_temporarily_unavailable") ||
    normalized.includes("http 503")
  )
}

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
  const { messages } = useI18n()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [editingConvId, setEditingConvId] = useState<string | null>(null)
  const [editingConvName, setEditingConvName] = useState("")
  const [isCreatingConversation, setIsCreatingConversation] = useState(false)
  const [deletingConvId, setDeletingConvId] = useState<string | null>(null)
  const [pendingDeleteConversation, setPendingDeleteConversation] =
    useState<AiEntryConversationSummary | null>(null)

  const [entryPath, entryQuery = ""] = entryHref.split("?")
  const basePath = entryPath || "/dashboard/ai"
  const entryQueryParams = new URLSearchParams(entryQuery)
  const entryModeRaw = entryQueryParams.get("entry")
  const entryAgentIdRaw = entryQueryParams.get("agent")
  const isConsultingEntry = isConsultingAdvisorEntryMode(entryModeRaw)
  const entryMode =
    isConsultingEntry ? AI_ENTRY_CONSULTING_ENTRY_MODE : null
  const scopeCacheKeySuffix = entryMode || "chat"
  const entryAgentId =
    typeof entryAgentIdRaw === "string" && entryAgentIdRaw.trim()
      ? entryAgentIdRaw.trim()
      : null
  const currentAgentId = (searchParams.get("agent") || "").trim() || null
  const effectiveAgentId = isConsultingEntry ? entryAgentId : (entryAgentId || currentAgentId)
  const hrefQueryParams = new URLSearchParams(entryQuery)
  if (effectiveAgentId) {
    hrefQueryParams.set("agent", effectiveAgentId)
  } else {
    hrefQueryParams.delete("agent")
  }
  const hrefSuffix = hrefQueryParams.toString() ? `?${hrefQueryParams.toString()}` : ""
  const isMatchedAgent = !activeAgentId || currentAgentId === activeAgentId
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
    updateList,
    createSnapshot,
    restoreSnapshot,
    handleListScroll,
  } = useCachedSidebarList<AiEntryConversationSummary>({
    cacheKey: `${AI_ENTRY_CONVERSATION_LIST_CACHE_KEY}:${scopeCacheKeySuffix}`,
    ttlMs: AI_ENTRY_CONVERSATION_CACHE_TTL_MS,
    isExpanded: isOpen,
    activeItemId: activeConversationId,
    fetchPage: async ({ cursor }) => {
      const params = new URLSearchParams({ limit: "30" })
      if (cursor) params.set("cursor", cursor)
      if (entryMode) params.set("entryMode", entryMode)

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

  const handleCreateConversation = async (
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault()
    event.stopPropagation()
    if (isCreatingConversation) return

    setIsCreatingConversation(true)
    try {
      const persistedModelId = readPersistedAiEntrySelectedModelId()
      const response = await fetch("/api/ai/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: messages.sidebar.newChatFallback,
          ...(isConsultingEntry
            ? { modelId: AI_ENTRY_SONNET_46_MODEL_HINT }
            : persistedModelId
              ? { modelId: persistedModelId }
              : {}),
          ...(entryMode ? { entryMode } : {}),
          ...(effectiveAgentId ? { agentId: effectiveAgentId } : {}),
        }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : `HTTP ${response.status}`,
        )
      }

      const created = payload?.data as AiEntryConversationSummary | undefined
      if (!created?.id) {
        throw new Error("ai_entry_conversation_create_missing_id")
      }

      updateList((current) => mergeConversations([created], current))
      void fetchConversations().catch(() => {})
      router.push(`${basePath}/${created.id}${hrefSuffix}`)
    } catch (error) {
      if (isTransientAiEntryConversationError(error)) {
        console.warn("AI entry conversation create skipped due to transient backend failure")
      } else {
        console.error("Failed to create AI entry conversation", error)
      }
      router.push(`${basePath}${hrefSuffix}`)
    } finally {
      setIsCreatingConversation(false)
    }
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
        ? `/api/ai/conversations/${convId}?entryMode=${encodeURIComponent(entryMode)}`
        : `/api/ai/conversations/${convId}`
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
                            <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-60" />
                          }
                          title={conversation.name || messages.sidebar.newChatFallback}
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
