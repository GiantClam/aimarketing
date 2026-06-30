import { listEnterpriseWorkflowPresets } from "@/lib/workflows/presets"
import type { WorkflowDefinition } from "@/lib/workflows/store"
import type { PlatformTaskRunRecord } from "@/lib/platform/task-run-store"

export type PlatformWorkflowGovernanceWorkflowSummary = {
  workflowId: number
  title: string
  slug: string
  status: string
  hasDefaultPreset: boolean
  qualityGateCount: number
  reviewRuleCount: number
  knowledgeReadNodeCount: number
  knowledgeWriteNodeCount: number
  assetQueueNodeCount: number
  runCount: number
  succeededRunCount: number
  failedRunCount: number
  successRate: number | null
  averageDurationMs: number | null
  averageCreditsConsumed: number
  persistedArtifactCount: number
  persistedWorkItemCount: number
  persistedKnowledgeJobCount: number
}

export type PlatformWorkflowGovernanceSummary = {
  totalWorkflowCount: number
  liveWorkflowCount: number
  workflowsWithQualityGates: number
  workflowsWithReviewRules: number
  workflowsWithKnowledgeLoop: number
  workflowsWithDefaultPreset: number
  recentRunCount: number
  recentSucceededRunCount: number
  recentFailedRunCount: number
  recentActiveRunCount: number
  recentSuccessRate: number | null
  recentAverageDurationMs: number | null
  recentCreditsConsumed: number
  recentArtifactCount: number
  recentWorkItemCount: number
  recentKnowledgeSaveJobCount: number
  topWorkflows: PlatformWorkflowGovernanceWorkflowSummary[]
}

type WorkflowRunLike = Pick<
  PlatformTaskRunRecord,
  "id" | "status" | "normalizedResult" | "startedAt" | "finishedAt" | "itemSlug"
>

type WorkflowGovernanceNodeExecutionLike = {
  creditsConsumed: number | null
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()))]
}

function normalizeNumberList(value: unknown) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is number => Number.isInteger(item) && item > 0))]
}

function listQualityGates(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata || typeof metadata !== "object") return []
  return normalizeStringList(metadata.qualityGates)
}

function getWorkflowIdFromNormalizedResult(value: unknown) {
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  return typeof record.workflowId === "number" && record.workflowId > 0 ? record.workflowId : null
}

function getPersistedCounts(value: unknown) {
  if (!value || typeof value !== "object") {
    return {
      artifactCount: 0,
      workItemCount: 0,
      knowledgeSaveJobCount: 0,
    }
  }

  const record = value as Record<string, unknown>
  return {
    artifactCount: normalizeNumberList(record.persistedArtifactIds).length,
    workItemCount: normalizeNumberList(record.persistedWorkItemIds).length,
    knowledgeSaveJobCount: normalizeNumberList(record.persistedKnowledgeSaveJobIds).length,
  }
}

function calculateDurationMs(startedAt: Date | null, finishedAt: Date | null) {
  if (!(startedAt instanceof Date) || !(finishedAt instanceof Date)) return null
  const value = finishedAt.getTime() - startedAt.getTime()
  return Number.isFinite(value) && value >= 0 ? value : null
}

function average(values: number[]) {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function summarizePlatformWorkflowGovernance(input: {
  locale: "zh" | "en"
  workflows: WorkflowDefinition[]
  recentRuns: WorkflowRunLike[]
  nodeExecutionsByRunId: Map<number, WorkflowGovernanceNodeExecutionLike[]>
}): PlatformWorkflowGovernanceSummary {
  const workflowSummaries = input.workflows.map((workflow) => {
    const defaultPreset = listEnterpriseWorkflowPresets(workflow.metadata, input.locale).find((preset) => preset.isDefault) ?? null
    const qualityGates = listQualityGates(workflow.metadata)
    const knowledgeReadNodeCount = workflow.nodes.filter((node) => node.type === "knowledge_retrieve").length
    const knowledgeWriteNodeCount = workflow.nodes.filter((node) => node.type === "knowledge_write").length
    const assetQueueNodeCount = workflow.nodes.filter(
      (node) => node.type === "product_store" && node.config.persistToKnowledgeBase === true,
    ).length
    const runs = input.recentRuns.filter((run) => getWorkflowIdFromNormalizedResult(run.normalizedResult) === workflow.id)
    const succeededRunCount = runs.filter((run) => run.status === "succeeded").length
    const failedRunCount = runs.filter((run) => run.status === "failed").length
    const successfulOrFailedRuns = runs.filter((run) => run.status === "succeeded" || run.status === "failed")
    const durations = successfulOrFailedRuns
      .map((run) => calculateDurationMs(run.startedAt, run.finishedAt))
      .filter((value): value is number => typeof value === "number")
    const averageCreditsConsumed = average(
      runs.map((run) => {
        const nodeExecutions = input.nodeExecutionsByRunId.get(run.id) ?? []
        return nodeExecutions.reduce((sum, execution) => sum + (execution.creditsConsumed ?? 0), 0)
      }),
    ) ?? 0
    const persistedCounts = runs.reduce(
      (sum, run) => {
        const counts = getPersistedCounts(run.normalizedResult)
        return {
          artifactCount: sum.artifactCount + counts.artifactCount,
          workItemCount: sum.workItemCount + counts.workItemCount,
          knowledgeSaveJobCount: sum.knowledgeSaveJobCount + counts.knowledgeSaveJobCount,
        }
      },
      { artifactCount: 0, workItemCount: 0, knowledgeSaveJobCount: 0 },
    )

    return {
      workflowId: workflow.id,
      title: workflow.title,
      slug: workflow.slug,
      status: workflow.status,
      hasDefaultPreset: Boolean(defaultPreset),
      qualityGateCount: qualityGates.length,
      reviewRuleCount: defaultPreset?.reviewRules.length ?? 0,
      knowledgeReadNodeCount,
      knowledgeWriteNodeCount,
      assetQueueNodeCount,
      runCount: runs.length,
      succeededRunCount,
      failedRunCount,
      successRate: successfulOrFailedRuns.length > 0 ? succeededRunCount / successfulOrFailedRuns.length : null,
      averageDurationMs: average(durations),
      averageCreditsConsumed,
      persistedArtifactCount: persistedCounts.artifactCount,
      persistedWorkItemCount: persistedCounts.workItemCount,
      persistedKnowledgeJobCount: persistedCounts.knowledgeSaveJobCount,
    } satisfies PlatformWorkflowGovernanceWorkflowSummary
  })

  const recentSucceededRunCount = input.recentRuns.filter((run) => run.status === "succeeded").length
  const recentFailedRunCount = input.recentRuns.filter((run) => run.status === "failed").length
  const recentActiveRunCount = input.recentRuns.filter((run) => run.status === "queued" || run.status === "running").length
  const recentCompletedRuns = input.recentRuns.filter((run) => run.status === "succeeded" || run.status === "failed")
  const recentDurationValues = recentCompletedRuns
    .map((run) => calculateDurationMs(run.startedAt, run.finishedAt))
    .filter((value): value is number => typeof value === "number")

  return {
    totalWorkflowCount: input.workflows.length,
    liveWorkflowCount: input.workflows.filter((workflow) => workflow.status === "live").length,
    workflowsWithQualityGates: workflowSummaries.filter((workflow) => workflow.qualityGateCount > 0).length,
    workflowsWithReviewRules: workflowSummaries.filter((workflow) => workflow.reviewRuleCount > 0).length,
    workflowsWithKnowledgeLoop: workflowSummaries.filter(
      (workflow) => workflow.knowledgeReadNodeCount > 0 || workflow.knowledgeWriteNodeCount > 0 || workflow.assetQueueNodeCount > 0,
    ).length,
    workflowsWithDefaultPreset: workflowSummaries.filter((workflow) => workflow.hasDefaultPreset).length,
    recentRunCount: input.recentRuns.length,
    recentSucceededRunCount,
    recentFailedRunCount,
    recentActiveRunCount,
    recentSuccessRate: recentCompletedRuns.length > 0 ? recentSucceededRunCount / recentCompletedRuns.length : null,
    recentAverageDurationMs: average(recentDurationValues),
    recentCreditsConsumed: input.recentRuns.reduce((sum, run) => {
      const nodeExecutions = input.nodeExecutionsByRunId.get(run.id) ?? []
      return sum + nodeExecutions.reduce((inner, execution) => inner + (execution.creditsConsumed ?? 0), 0)
    }, 0),
    recentArtifactCount: input.recentRuns.reduce((sum, run) => sum + getPersistedCounts(run.normalizedResult).artifactCount, 0),
    recentWorkItemCount: input.recentRuns.reduce((sum, run) => sum + getPersistedCounts(run.normalizedResult).workItemCount, 0),
    recentKnowledgeSaveJobCount: input.recentRuns.reduce((sum, run) => sum + getPersistedCounts(run.normalizedResult).knowledgeSaveJobCount, 0),
    topWorkflows: workflowSummaries
      .sort((left, right) => {
        if (right.runCount !== left.runCount) return right.runCount - left.runCount
        return right.workflowId - left.workflowId
      })
      .slice(0, 6),
  }
}
