import type { LocalizedBusinessAgentConfig } from "@/lib/platform/business-agents"
import type { CustomAgentView } from "@/lib/platform/custom-agents"
import { buildCustomAgentRuntimeId } from "@/lib/platform/custom-agent-runtime-id"
import type { WorkspaceBusinessSlug } from "@/lib/platform/workspace-business"

export type BusinessScopedCustomAgentSummary = {
  id: number
  name: string
  slug: string
  summary: string
  status: CustomAgentView["status"]
  visibility: CustomAgentView["visibility"]
  executionMode: CustomAgentView["executionMode"]
  linkedWorkflowId: number | null
  linkedWorkflowTitle: string | null
  workflowLabels: string[]
  artifactKinds: string[]
}

function buildCustomWorkbenchPrompts(agent: Pick<CustomAgentView, "goal" | "summary" | "name">, locale: "zh" | "en") {
  if (locale === "zh") {
    return [
      agent.goal ? `围绕「${agent.goal}」先给我一版可执行方案。` : `请用 ${agent.name} 的方式帮我推进当前任务。`,
      `结合当前业务上下文，给我一版 ${agent.summary} 的执行建议。`,
    ]
  }

  return [
    agent.goal ? `Help me build an execution plan around "${agent.goal}".` : `Use ${agent.name} to move this task forward.`,
    `Given the current business context, turn ${agent.summary} into an actionable next-step plan.`,
  ]
}

function normalizeCustomAgentArtifactKinds(
  artifactKinds: CustomAgentView["artifactKinds"],
): LocalizedBusinessAgentConfig["artifactKinds"] {
  return artifactKinds.filter(
    (kind): kind is LocalizedBusinessAgentConfig["artifactKinds"][number] =>
      ["brief", "plan", "copy", "asset", "workflow_result", "knowledge_note", "report"].includes(kind),
  )
}

export function listCustomAgentBoundBusinessSlugs(agents: CustomAgentView[]) {
  const slugs = new Set<WorkspaceBusinessSlug>()

  for (const agent of agents) {
    for (const binding of agent.businessBindings) {
      if (!binding.enabled) continue
      slugs.add(binding.businessSlug)
    }
  }

  return [...slugs]
}

export function listBusinessScopedCustomAgents(
  agents: CustomAgentView[],
  businessSlug: WorkspaceBusinessSlug,
): BusinessScopedCustomAgentSummary[] {
  return agents
    .map((agent) => {
      const businessBinding = agent.businessBindings
        .filter((binding) => binding.enabled && binding.businessSlug === businessSlug)
        .sort((left, right) => left.displayPriority - right.displayPriority)[0] ?? null
      if (!businessBinding) return null

      return {
        id: agent.id,
        name: agent.name,
        slug: agent.slug,
        summary: agent.summary,
        status: agent.status,
        visibility: agent.visibility,
        executionMode: agent.executionMode,
        linkedWorkflowId: agent.linkedWorkflowId,
        linkedWorkflowTitle: agent.linkedWorkflowTitle,
        workflowLabels: agent.workflowBindings
          .filter((binding) => binding.enabled)
          .map((binding) => binding.workflowTitle || binding.workflowSlug || `#${binding.workflowId}`),
        artifactKinds: agent.artifactKinds,
        displayPriority: businessBinding.displayPriority,
        updatedAt: agent.updatedAt instanceof Date ? agent.updatedAt.getTime() : 0,
      }
    })
    .filter((agent): agent is NonNullable<typeof agent> => Boolean(agent))
    .sort((left, right) => {
      if (left.displayPriority !== right.displayPriority) return left.displayPriority - right.displayPriority
      return right.updatedAt - left.updatedAt
    })
    .map(({ displayPriority: _displayPriority, updatedAt: _updatedAt, ...agent }) => agent)
}

export function buildBusinessWorkbenchCustomAgents(
  agents: CustomAgentView[],
  businessSlug: WorkspaceBusinessSlug,
  locale: "zh" | "en",
): LocalizedBusinessAgentConfig[] {
  return agents
    .map((agent) => {
      const businessBinding = agent.businessBindings
        .filter((binding) => binding.enabled && binding.businessSlug === businessSlug)
        .sort((left, right) => left.displayPriority - right.displayPriority)[0] ?? null
      if (!businessBinding || agent.status !== "published") return null

      return {
        businessSlug,
        agentId: buildCustomAgentRuntimeId(agent.id),
        promptDocumentPath: buildCustomAgentRuntimeId(agent.id),
        name: agent.name,
        summary: agent.summary,
        systemPromptSummary:
          agent.systemPromptSummary ||
          agent.goal ||
          agent.scope ||
          agent.guardrails ||
          agent.summary,
        samplePrompts: buildCustomWorkbenchPrompts(agent, locale),
        workflowSlugs: agent.workflowBindings
          .filter((binding) => binding.enabled)
          .map((binding) => binding.workflowSlug || `workflow-${binding.workflowId}`),
        artifactKinds: normalizeCustomAgentArtifactKinds(agent.artifactKinds),
        executionMode: agent.executionMode,
        linkedWorkflowId: agent.linkedWorkflowId,
        linkedWorkflowTitle: agent.linkedWorkflowTitle,
        displayPriority: businessBinding.displayPriority,
        updatedAt: agent.updatedAt instanceof Date ? agent.updatedAt.getTime() : 0,
      }
    })
    .filter((agent): agent is NonNullable<typeof agent> => Boolean(agent))
    .sort((left, right) => {
      if (left.displayPriority !== right.displayPriority) return left.displayPriority - right.displayPriority
      return right.updatedAt - left.updatedAt
    })
    .map(({ displayPriority: _displayPriority, updatedAt: _updatedAt, ...agent }) => agent)
}

export function buildSelectedCustomBusinessMenuAgents(
  agents: CustomAgentView[],
  locale: "zh" | "en",
  selectedAgentIds: readonly string[],
): LocalizedBusinessAgentConfig[] {
  const selectedSet = new Set(selectedAgentIds)

  return agents
    .flatMap((agent) => {
      const runtimeAgentId = buildCustomAgentRuntimeId(agent.id)
      if (!selectedSet.has(runtimeAgentId) || agent.status !== "published") return []

      return agent.businessBindings
        .filter((binding) => binding.enabled)
        .sort((left, right) => left.displayPriority - right.displayPriority)
        .map((binding) => ({
          businessSlug: binding.businessSlug,
          agentId: runtimeAgentId,
          promptDocumentPath: runtimeAgentId,
          name: agent.name,
          summary: agent.summary,
          systemPromptSummary:
            agent.systemPromptSummary ||
            agent.goal ||
            agent.scope ||
            agent.guardrails ||
            agent.summary,
          samplePrompts: buildCustomWorkbenchPrompts(agent, locale),
          workflowSlugs: agent.workflowBindings
            .filter((workflowBinding) => workflowBinding.enabled)
            .map((workflowBinding) => workflowBinding.workflowSlug || `workflow-${workflowBinding.workflowId}`),
          artifactKinds: normalizeCustomAgentArtifactKinds(agent.artifactKinds),
          executionMode: agent.executionMode,
          linkedWorkflowId: agent.linkedWorkflowId,
          linkedWorkflowTitle: agent.linkedWorkflowTitle,
          displayPriority: binding.displayPriority,
          updatedAt: agent.updatedAt instanceof Date ? agent.updatedAt.getTime() : 0,
        }))
    })
    .sort((left, right) => {
      if (left.displayPriority !== right.displayPriority) return left.displayPriority - right.displayPriority
      return right.updatedAt - left.updatedAt
    })
    .map(({ displayPriority: _displayPriority, updatedAt: _updatedAt, ...agent }) => agent)
}
