import type { WorkflowDefinitionNode } from "@/lib/workflows/schema"

type KnowledgeWorkflowRecord = {
  id: number
  title: string
  status: string
  nodes: WorkflowDefinitionNode[]
}

export type WorkflowKnowledgeReadNodeSummary = {
  nodeKey: string
  title: string
  selectedDatasetIds: number[]
  selectedPersonalDatasetIds: number[]
  topK: number
}

export type WorkflowKnowledgeWriteNodeSummary = {
  nodeKey: string
  title: string
  datasetId: number | null
  datasetScope: "enterprise" | "personal"
  knowledgeCategory: string
}

export type WorkflowKnowledgeQueueNodeSummary = {
  nodeKey: string
  title: string
  knowledgeTargetType: string
}

export type WorkflowKnowledgeGovernanceSummary = {
  workflowId: number
  title: string
  status: string
  readNodes: WorkflowKnowledgeReadNodeSummary[]
  writeNodes: WorkflowKnowledgeWriteNodeSummary[]
  queueNodes: WorkflowKnowledgeQueueNodeSummary[]
}

function normalizePositiveInteger(value: unknown) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null
}

function normalizePositiveIntegerList(value: unknown) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => normalizePositiveInteger(item)).filter((item): item is number => item !== null))]
}

function normalizeNodeTitle(node: Pick<WorkflowDefinitionNode, "title" | "nodeKey">) {
  return node.title?.trim() || node.nodeKey
}

export function summarizeWorkflowKnowledgeUsage(
  workflows: KnowledgeWorkflowRecord[],
): WorkflowKnowledgeGovernanceSummary[] {
  return workflows
    .map((workflow) => {
      const readNodes = workflow.nodes
        .filter((node) => node.type === "knowledge_retrieve")
        .map((node) => ({
          nodeKey: node.nodeKey,
          title: normalizeNodeTitle(node),
          selectedDatasetIds: normalizePositiveIntegerList(node.config.selectedDatasetIds),
          selectedPersonalDatasetIds: normalizePositiveIntegerList(node.config.selectedPersonalDatasetIds),
          topK: normalizePositiveInteger(node.config.topK) ?? 4,
        }))

      const writeNodes = workflow.nodes
        .filter((node) => node.type === "knowledge_write")
        .map<WorkflowKnowledgeWriteNodeSummary>((node) => ({
          nodeKey: node.nodeKey,
          title: normalizeNodeTitle(node),
          datasetId: normalizePositiveInteger(node.config.datasetId),
          datasetScope: node.config.datasetScope === "personal" ? "personal" : "enterprise",
          knowledgeCategory:
            typeof node.config.knowledgeCategory === "string" && node.config.knowledgeCategory.trim()
              ? node.config.knowledgeCategory.trim()
              : "general",
        }))

      const queueNodes = workflow.nodes
        .filter((node) => node.type === "product_store" && Boolean(node.config.persistToKnowledgeBase))
        .map((node) => ({
          nodeKey: node.nodeKey,
          title: normalizeNodeTitle(node),
          knowledgeTargetType:
            typeof node.config.knowledgeTargetType === "string" && node.config.knowledgeTargetType.trim()
              ? node.config.knowledgeTargetType.trim()
              : "knowledge_base",
        }))

      return {
        workflowId: workflow.id,
        title: workflow.title,
        status: workflow.status,
        readNodes,
        writeNodes,
        queueNodes,
      }
    })
    .filter((workflow) => workflow.readNodes.length > 0 || workflow.writeNodes.length > 0 || workflow.queueNodes.length > 0)
    .sort((left, right) => left.title.localeCompare(right.title))
}
