import { getDefaultEnterpriseWorkflowPreset } from "@/lib/workflows/presets"

type WorkflowGovernanceNode = {
  nodeKey: string
  type: string
  title: string
  config: Record<string, unknown>
}

type WorkflowGovernanceDefinition = {
  metadata: Record<string, unknown> | null
  nodes: WorkflowGovernanceNode[]
}

type WorkflowGovernanceRun = {
  status: string
  artifacts: Array<unknown>
  workItems: Array<unknown>
  knowledgeSaveJobs: Array<{
    id: number
    status: string
    targetType: string
    requestPayload: Record<string, unknown> | null
  }>
}

type WorkflowGovernanceNodeExecution = {
  status: string
  creditsConsumed: number
}

export type WorkflowRunGovernanceGateStatus = "tracked" | "attention" | "pending"

export type WorkflowRunGovernanceGateSummary = {
  label: string
  status: WorkflowRunGovernanceGateStatus
  evidence: string[]
}

export type WorkflowRunGovernanceSummary = {
  totalCreditsConsumed: number
  artifactCount: number
  workItemCount: number
  qualityGates: WorkflowRunGovernanceGateSummary[]
  reviewRules: string[]
  bannedTerms: string[]
  channelTargets: string[]
  allowedKnowledgeDatasetIds: number[]
  defaultPreset: {
    name: string
    industry: string
    audience: string
    brandVoice: string
    notes: string
  } | null
  explicitKnowledgeReadNodes: number
  explicitKnowledgeWriteNodes: number
  assetStoreNodes: number
  assetToKnowledgeQueueNodes: number
  complianceNodeCount: number
  brandNodeCount: number
  approvalSignalCount: number
  nodeStatusCounts: {
    succeeded: number
    failed: number
    running: number
    queued: number
    cancelled: number
  }
  knowledgeSaveJobCount: number
  knowledgeSaveJobStatusCounts: {
    queued: number
    running: number
    succeeded: number
    failed: number
    rejected: number
  }
}

function normalizeStringList(value: unknown) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean))]
}

function normalizeQualityGates(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata || typeof metadata !== "object") return []
  return normalizeStringList(metadata.qualityGates)
}

function buildNodeDescriptor(node: WorkflowGovernanceNode) {
  return `${node.nodeKey} ${node.title} ${typeof node.config.agentId === "string" ? node.config.agentId : ""}`.toLowerCase()
}

function isComplianceLikeNode(node: WorkflowGovernanceNode) {
  return /(compliance|privacy|audit|review|审批|合规|隐私|审计|法务)/i.test(buildNodeDescriptor(node))
}

function isBrandLikeNode(node: WorkflowGovernanceNode) {
  return /(brand|creative|ux|ui|品牌|创意|设计)/i.test(buildNodeDescriptor(node))
}

function inferQualityGateSummary(input: {
  gate: string
  runStatus: string
  reviewRules: string[]
  channelTargets: string[]
  bannedTerms: string[]
  hasBrandVoice: boolean
  artifactCount: number
  workItemCount: number
  knowledgeSaveJobCount: number
  complianceNodeCount: number
  brandNodeCount: number
}) {
  const evidence: string[] = []

  if (/(资产|archive|asset|知识|knowledge|归档|tag)/i.test(input.gate)) {
    if (input.artifactCount > 0) evidence.push(`artifacts:${input.artifactCount}`)
    if (input.workItemCount > 0) evidence.push(`workItems:${input.workItemCount}`)
    if (input.knowledgeSaveJobCount > 0) evidence.push(`knowledgeJobs:${input.knowledgeSaveJobCount}`)
  }

  if (/(合规|风险|隐私|审计|compliance|risk|privacy|audit)/i.test(input.gate)) {
    if (input.complianceNodeCount > 0) evidence.push(`complianceNodes:${input.complianceNodeCount}`)
    if (input.reviewRules.length > 0) evidence.push(`reviewRules:${input.reviewRules.length}`)
  }

  if (/(品牌|brand|tone)/i.test(input.gate)) {
    if (input.hasBrandVoice) evidence.push("brandVoice")
    if (input.bannedTerms.length > 0) evidence.push(`bannedTerms:${input.bannedTerms.length}`)
    if (input.brandNodeCount > 0) evidence.push(`brandNodes:${input.brandNodeCount}`)
  }

  if (/(渠道|负责人|节奏|执行|目标|cta|channel|owner|cadence|execution|goal)/i.test(input.gate)) {
    if (input.channelTargets.length > 0) evidence.push(`channels:${input.channelTargets.length}`)
    if (input.runStatus === "succeeded") evidence.push("runSucceeded")
  }

  if (evidence.length > 0) {
    return {
      label: input.gate,
      status: "tracked" as const,
      evidence,
    }
  }

  if (input.runStatus === "queued" || input.runStatus === "running") {
    return {
      label: input.gate,
      status: "pending" as const,
      evidence: [],
    }
  }

  return {
    label: input.gate,
    status: "attention" as const,
    evidence: [],
  }
}

export function summarizeWorkflowRunGovernance(input: {
  locale: "zh" | "en"
  workflow: WorkflowGovernanceDefinition
  run: WorkflowGovernanceRun
  nodeExecutions: WorkflowGovernanceNodeExecution[]
}): WorkflowRunGovernanceSummary {
  const defaultPreset = getDefaultEnterpriseWorkflowPreset(input.workflow.metadata, input.locale)
  const reviewRules = defaultPreset?.reviewRules ?? []
  const bannedTerms = defaultPreset?.bannedTerms ?? []
  const channelTargets = defaultPreset?.channelTargets ?? []
  const allowedKnowledgeDatasetIds = defaultPreset?.allowedKnowledgeDatasetIds ?? []
  const qualityGates = normalizeQualityGates(input.workflow.metadata)
  const explicitKnowledgeReadNodes = input.workflow.nodes.filter((node) => node.type === "knowledge_retrieve").length
  const explicitKnowledgeWriteNodes = input.workflow.nodes.filter((node) => node.type === "knowledge_write").length
  const assetStoreNodes = input.workflow.nodes.filter((node) => node.type === "product_store").length
  const assetToKnowledgeQueueNodes = input.workflow.nodes.filter(
    (node) => node.type === "product_store" && node.config.persistToKnowledgeBase === true,
  ).length
  const complianceNodeCount = input.workflow.nodes.filter(isComplianceLikeNode).length
  const brandNodeCount = input.workflow.nodes.filter(isBrandLikeNode).length
  const totalCreditsConsumed = input.nodeExecutions.reduce(
    (sum, execution) => sum + (Number.isFinite(execution.creditsConsumed) ? execution.creditsConsumed : 0),
    0,
  )

  const nodeStatusCounts = {
    succeeded: input.nodeExecutions.filter((item) => item.status === "succeeded").length,
    failed: input.nodeExecutions.filter((item) => item.status === "failed").length,
    running: input.nodeExecutions.filter((item) => item.status === "running").length,
    queued: input.nodeExecutions.filter((item) => item.status === "queued").length,
    cancelled: input.nodeExecutions.filter((item) => item.status === "cancelled").length,
  }

  const knowledgeSaveJobStatusCounts = {
    queued: input.run.knowledgeSaveJobs.filter((job) => job.status === "queued").length,
    running: input.run.knowledgeSaveJobs.filter((job) => job.status === "running").length,
    succeeded: input.run.knowledgeSaveJobs.filter((job) => job.status === "succeeded").length,
    failed: input.run.knowledgeSaveJobs.filter((job) => job.status === "failed").length,
    rejected: input.run.knowledgeSaveJobs.filter((job) => job.status === "rejected").length,
  }

  return {
    totalCreditsConsumed,
    artifactCount: input.run.artifacts.length,
    workItemCount: input.run.workItems.length,
    qualityGates: qualityGates.map((gate) =>
      inferQualityGateSummary({
        gate,
        runStatus: input.run.status,
        reviewRules,
        channelTargets,
        bannedTerms,
        hasBrandVoice: Boolean(defaultPreset?.brandVoice),
        artifactCount: input.run.artifacts.length,
        workItemCount: input.run.workItems.length,
        knowledgeSaveJobCount: input.run.knowledgeSaveJobs.length,
        complianceNodeCount,
        brandNodeCount,
      }),
    ),
    reviewRules,
    bannedTerms,
    channelTargets,
    allowedKnowledgeDatasetIds,
    defaultPreset: defaultPreset
      ? {
          name: defaultPreset.name,
          industry: defaultPreset.industry,
          audience: defaultPreset.audience,
          brandVoice: defaultPreset.brandVoice,
          notes: defaultPreset.notes,
        }
      : null,
    explicitKnowledgeReadNodes,
    explicitKnowledgeWriteNodes,
    assetStoreNodes,
    assetToKnowledgeQueueNodes,
    complianceNodeCount,
    brandNodeCount,
    approvalSignalCount: reviewRules.length,
    nodeStatusCounts,
    knowledgeSaveJobCount: input.run.knowledgeSaveJobs.length,
    knowledgeSaveJobStatusCounts,
  }
}
