"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { WorkbenchAgentDirectory, type WorkbenchAgentDirectoryGroup } from "@aimarketing/workbench-ui"

import { dispatchBusinessMarketplaceSelectionUpdated } from "@/lib/platform/business-marketplace-events"
import { buildAgentPlatformDirectoryGroups } from "@/lib/platform/agent-platform-directory"
import type { CustomAgentView } from "@/lib/platform/custom-agents"
import type { ImportedAgencyAgentPlatformCard } from "@/lib/platform/imported-agency-agents"
import type { AiEntryAgentCatalogGroup, AiEntryAgentCatalogItem } from "@/lib/ai-entry/agent-catalog"

export function WorkspaceAgentPlatformDirectory({
  locale,
  builtinAgents,
  builtinGroups,
  customAgents,
  importedAgents,
  initialSelectedBusinessMenuAgentIds,
}: {
  locale: "zh" | "en"
  builtinAgents: AiEntryAgentCatalogItem[]
  builtinGroups: AiEntryAgentCatalogGroup[]
  customAgents: CustomAgentView[]
  importedAgents: ImportedAgencyAgentPlatformCard[]
  initialSelectedBusinessMenuAgentIds: string[]
}) {
  const router = useRouter()
  const [selectedBusinessMenuAgentIds, setSelectedBusinessMenuAgentIds] = useState(initialSelectedBusinessMenuAgentIds)
  const [pendingAgentId, setPendingAgentId] = useState<string | null>(null)
  const selectedAgentIds = useMemo(() => new Set(selectedBusinessMenuAgentIds), [selectedBusinessMenuAgentIds])
  const sourceGroups = useMemo(() => buildAgentPlatformDirectoryGroups({ locale, builtinAgents, builtinGroups, customAgents, importedAgents }), [builtinAgents, builtinGroups, customAgents, importedAgents, locale])
  const copy = locale === "zh" ? {
    title: "智能体中台",
    description: "保留原有 Agent 分类卡片视图，并把当前用户创建的自定义 Agent 收敛到首个分组里统一管理与进入。",
    create: "创建 Agent",
    edit: "编辑 Agent",
    open: "打开 Agent",
    add: "添加到业务菜单",
    selected: "已在业务菜单",
    remove: "从业务菜单中删除",
    configure: "配置业务菜单",
    pending: "处理中…",
  } : {
    title: "Agent Platform",
    description: "Keep the original categorized agent-card layout and place the current user's custom agents into the first group.",
    create: "Create agent",
    edit: "Edit agent",
    open: "Open agent",
    add: "Add to business menu",
    selected: "In business menu",
    remove: "Remove from business menu",
    configure: "Configure business menu",
    pending: "Working…",
  }

  const groups: WorkbenchAgentDirectoryGroup[] = sourceGroups.map((group) => ({
    id: group.id,
    label: group.label,
    cards: group.cards.map((card) => {
      if (card.kind === "create") return { id: card.id, title: card.title, description: card.description, meta: card.meta, primaryAction: { id: `navigate:${card.href}`, label: copy.create } }
      if (card.kind === "builtin") {
        const selected = card.businessMenuAgentId ? selectedAgentIds.has(card.businessMenuAgentId) : false
        const pending = card.businessMenuAgentId === pendingAgentId
        return {
          id: card.id,
          title: card.title,
          description: card.description,
          meta: card.meta,
          availability: "ready" as const,
          primaryAction: card.businessMenuAgentId
            ? { id: `business:${card.businessMenuAgentId}`, label: pending ? copy.pending : selected ? copy.selected : copy.add, disabled: pending || selected }
            : { id: `navigate:${card.href}`, label: copy.open },
          ...(selected && card.businessMenuAgentId ? { secondaryAction: { id: `business:${card.businessMenuAgentId}`, label: pending ? copy.pending : copy.remove, disabled: pending } } : {}),
        }
      }
      const selected = selectedAgentIds.has(card.businessMenuAgentId)
      const pending = card.businessMenuAgentId === pendingAgentId
      return {
        id: card.id,
        title: card.title,
        description: card.description,
        meta: card.meta,
        status: `${card.status} · ${card.visibility}`,
        availability: card.businessMenuEligible ? "ready" as const : "needs-config" as const,
        unavailableReason: card.businessMenuHint ?? undefined,
        primaryAction: { id: `navigate:${card.editHref}`, label: copy.edit },
        secondaryAction: card.businessMenuEligible
          ? { id: `business:${card.businessMenuAgentId}`, label: pending ? copy.pending : selected ? copy.remove : copy.add, disabled: pending }
          : { id: `navigate:${card.editHref}`, label: copy.configure },
      }
    }),
  }))

  const toggleBusinessMenuAgent = async (agentId: string) => {
    const nextSelectedAgentIds = selectedAgentIds.has(agentId) ? selectedBusinessMenuAgentIds.filter((id) => id !== agentId) : [...selectedBusinessMenuAgentIds, agentId]
    setPendingAgentId(agentId)
    try {
      const response = await fetch("/api/platform/business/marketplace-selection", { method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ selectedAgentIds: nextSelectedAgentIds }) })
      const payload = (await response.json().catch(() => null)) as { data?: { selectedAgentIds?: string[] } } | null
      if (!response.ok) throw new Error(`http_${response.status}`)
      setSelectedBusinessMenuAgentIds(Array.isArray(payload?.data?.selectedAgentIds) ? payload.data.selectedAgentIds : nextSelectedAgentIds)
      dispatchBusinessMarketplaceSelectionUpdated()
      router.refresh()
    } catch {
      // Keep the previous selection when the online persistence request fails.
    } finally {
      setPendingAgentId(null)
    }
  }

  return <WorkbenchAgentDirectory
    locale={locale}
    title={copy.title}
    description={copy.description}
    groups={groups}
    onAction={(_card, action) => action.id.startsWith("navigate:") ? router.push(action.id.slice("navigate:".length)) : toggleBusinessMenuAgent(action.id.slice("business:".length))}
  />
}
