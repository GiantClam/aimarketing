import type {
  AiEntryAgentCatalogGroup,
  AiEntryAgentCatalogItem,
  AiEntryAgentCategory,
} from "@/lib/ai-entry/agent-catalog"
import { getBusinessAgentConfigById } from "@/lib/platform/business-agents"
import { isExecutiveBusinessMenuAgentId } from "@/lib/platform/business-menu-builtin-agents"
import { buildCustomAgentRuntimeId } from "@/lib/platform/custom-agent-runtime-id"
import type { CustomAgentView } from "@/lib/platform/custom-agents"
import { buildDashboardBusinessHref } from "@/lib/platform/workspace-business"

export type AgentPlatformDirectoryCard =
  | {
      kind: "create"
      id: "create-custom-agent"
      href: string
      title: string
      description: string
      meta: string
    }
  | {
      kind: "custom"
      id: string
      href: string
      editHref: string
      title: string
      description: string
      meta: string
      status: string
      visibility: string
      businessMenuAgentId: string
      businessMenuEligible: boolean
      businessMenuHint: string | null
    }
  | {
      kind: "builtin"
      id: string
      href: string
      title: string
      description: string
      meta: string
      businessMenuAgentId: string | null
    }

export type AgentPlatformDirectoryGroup = {
  id: "custom" | AiEntryAgentCategory | "other"
  label: string
  cards: AgentPlatformDirectoryCard[]
}

export function resolveAgentPlatformBuiltinHref(agentId: string) {
  const businessAgent = getBusinessAgentConfigById(agentId)
  if (businessAgent) {
    return buildDashboardBusinessHref(businessAgent.businessSlug, { agentId })
  }
  if (agentId === "general") return "/dashboard/ai"
  if (agentId === "executive-brand" || agentId === "executive-growth") {
    return `/dashboard/ai?agent=${encodeURIComponent(agentId)}&entry=consulting-advisor`
  }
  return `/dashboard/ai?agent=${encodeURIComponent(agentId)}`
}

function localizeGroupLabel(locale: "zh" | "en", group: AiEntryAgentCatalogGroup) {
  return locale === "zh" ? group.label.zh : group.label.en
}

function localizeAgentTitle(locale: "zh" | "en", agent: AiEntryAgentCatalogItem) {
  return locale === "zh" ? agent.name.zh : agent.name.en
}

function localizeAgentDescription(locale: "zh" | "en", agent: AiEntryAgentCatalogItem) {
  return locale === "zh" ? agent.description.zh : agent.description.en
}

function localizeCategoryMeta(locale: "zh" | "en", category: AiEntryAgentCategory | "custom" | "other") {
  if (category === "custom") return locale === "zh" ? "当前用户创建" : "Created by you"
  if (category === "executive") return locale === "zh" ? "专家顾问" : "Executive"
  if (category === "business") return locale === "zh" ? "业务 Agent" : "Business"
  if (category === "other") return locale === "zh" ? "其他" : "Other"
  return locale === "zh" ? "通用" : "General"
}

function localizeCustomStatus(locale: "zh" | "en", status: CustomAgentView["status"]) {
  if (locale === "zh") {
    if (status === "published") return "已发布"
    if (status === "disabled") return "已停用"
    if (status === "archived") return "已归档"
    return "草稿"
  }
  if (status === "published") return "Published"
  if (status === "disabled") return "Disabled"
  if (status === "archived") return "Archived"
  return "Draft"
}

function localizeCustomVisibility(locale: "zh" | "en", visibility: CustomAgentView["visibility"]) {
  if (locale === "zh") return visibility === "shared" ? "共享" : "私有"
  return visibility === "shared" ? "Shared" : "Private"
}

function localizeCustomExecutionMode(locale: "zh" | "en", mode: CustomAgentView["executionMode"]) {
  if (locale === "zh") return mode === "workflow_backed" ? "Workflow 驱动" : "直接执行"
  return mode === "workflow_backed" ? "Workflow-backed" : "Direct"
}

function localizeCustomBusinessMenuHint(
  locale: "zh" | "en",
  agent: Pick<CustomAgentView, "status" | "businessBindings">,
) {
  const enabledBindingCount = agent.businessBindings.filter((binding) => binding.enabled).length
  if (enabledBindingCount === 0) {
    return locale === "zh" ? "先绑定业务入口后，才能加入业务菜单。" : "Bind at least one business entry before adding this agent to the business menu."
  }
  if (agent.status !== "published") {
    return locale === "zh" ? "发布后，才能加入业务菜单。" : "Publish this agent before adding it to the business menu."
  }
  return null
}

export function buildAgentPlatformDirectoryGroups(input: {
  locale: "zh" | "en"
  builtinAgents: AiEntryAgentCatalogItem[]
  builtinGroups: AiEntryAgentCatalogGroup[]
  customAgents: CustomAgentView[]
}) {
  const { locale, builtinAgents, builtinGroups, customAgents } = input

  const groups: AgentPlatformDirectoryGroup[] = [
    {
      id: "custom",
      label: locale === "zh" ? "自定义 Agent" : "Custom Agents",
      cards: [
        {
          kind: "create",
          id: "create-custom-agent",
          href: "/dashboard/agent-platform/new",
          title: locale === "zh" ? "创建 Agent" : "Create agent",
          description:
            locale === "zh"
              ? "从空白或模板开始，创建新的自定义 Agent，并继续绑定 workflow、知识库与业务入口。"
              : "Start blank or from a template, then bind workflows, knowledge, and business entries.",
          meta: locale === "zh" ? "新建入口" : "New entry",
        },
        ...customAgents.map((agent) => ({
          kind: "custom" as const,
          id: `custom-${agent.id}`,
          href: `/dashboard/agent-platform/${agent.id}`,
          editHref: `/dashboard/agent-platform/${agent.id}`,
          title: agent.name,
          description: agent.summary || (locale === "zh" ? "暂无简介" : "No summary yet."),
          meta: localizeCustomExecutionMode(locale, agent.executionMode),
          status: localizeCustomStatus(locale, agent.status),
          visibility: localizeCustomVisibility(locale, agent.visibility),
          businessMenuAgentId: buildCustomAgentRuntimeId(agent.id),
          businessMenuEligible:
            agent.status === "published" && agent.businessBindings.some((binding) => binding.enabled),
          businessMenuHint: localizeCustomBusinessMenuHint(locale, agent),
        })),
      ],
    },
  ]

  const normalizedBuiltins = builtinAgents.map((agent) => ({
    kind: "builtin" as const,
    id: agent.id,
    href: resolveAgentPlatformBuiltinHref(agent.id),
    title: localizeAgentTitle(locale, agent),
    description: localizeAgentDescription(locale, agent),
    meta: localizeCategoryMeta(locale, agent.category),
    category: agent.category,
    businessMenuAgentId:
      getBusinessAgentConfigById(agent.id) || isExecutiveBusinessMenuAgentId(agent.id)
        ? agent.id
        : null,
  }))

  for (const group of builtinGroups) {
    const cards = normalizedBuiltins
      .filter((agent) => agent.category === group.id)
      .map(({ category: _category, ...card }) => card)
    if (cards.length === 0) continue
    groups.push({
      id: group.id,
      label: localizeGroupLabel(locale, group),
      cards,
    })
  }

  const groupedIds = new Set(builtinGroups.map((group) => group.id))
  const leftovers = normalizedBuiltins
    .filter((agent) => !groupedIds.has(agent.category))
    .map(({ category: _category, ...card }) => card)
  if (leftovers.length > 0) {
    groups.push({
      id: "other",
      label: locale === "zh" ? "其他 Agent" : "Other Agents",
      cards: leftovers,
    })
  }

  return groups
}
