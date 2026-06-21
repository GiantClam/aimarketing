import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { createRetryableDbErrorMatcher, withDbRetry } from "@/lib/db/retry"
import {
  platformWorkflowEdges,
  platformWorkflowNodeExecutions,
  platformWorkflowNodes,
  platformWorkflows,
} from "@/lib/db/schema"
import { ensureEnterpriseAuthTables } from "@/lib/enterprise/server"
import {
  ensurePlatformTaskRunTables,
  getPlatformTaskRun,
  type HydratedPlatformTaskRun,
} from "@/lib/platform/task-run-store"
import {
  getDefaultWorkflowNodeTitle,
  isWorkflowNodeType,
  type WorkflowDefinitionEdge,
  type WorkflowDefinitionNode,
  type WorkflowNodeType,
} from "@/lib/workflows/schema"

export type WorkflowDefinitionStatus = "draft" | "live" | "archived"
export type WorkflowDefinitionTriggerType = "manual"

export type WorkflowRecord = typeof platformWorkflows.$inferSelect
export type WorkflowNodeRecord = typeof platformWorkflowNodes.$inferSelect
export type WorkflowEdgeRecord = typeof platformWorkflowEdges.$inferSelect
export type WorkflowNodeExecutionRecord = typeof platformWorkflowNodeExecutions.$inferSelect
export type WorkflowNodeExecutionStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled"

export type WorkflowDefinition = {
  id: number
  enterpriseId: number
  ownerUserId: number
  title: string
  slug: string
  status: WorkflowDefinitionStatus
  triggerType: WorkflowDefinitionTriggerType
  description: string | null
  metadata: Record<string, unknown> | null
  createdAt: Date
  updatedAt: Date
  nodes: WorkflowDefinitionNode[]
  edges: WorkflowDefinitionEdge[]
}

export type CreateWorkflowDefinitionInput = {
  enterpriseId: number
  ownerUserId: number
  title: string
  description?: string | null
  status?: WorkflowDefinitionStatus | null
  triggerType?: WorkflowDefinitionTriggerType | null
  metadata?: Record<string, unknown> | null
  nodes?: WorkflowDefinitionNode[]
  edges?: WorkflowDefinitionEdge[]
}

export type UpdateWorkflowDefinitionInput = {
  workflowId: number
  enterpriseId: number
  title?: string | null
  description?: string | null
  status?: WorkflowDefinitionStatus | null
  triggerType?: WorkflowDefinitionTriggerType | null
  metadata?: Record<string, unknown> | null
  nodes?: WorkflowDefinitionNode[]
  edges?: WorkflowDefinitionEdge[]
}

export type WorkflowStore = {
  createWorkflowDefinition(input: CreateWorkflowDefinitionInput): Promise<WorkflowDefinition>
  listWorkflowDefinitionsForEnterprise(enterpriseId: number): Promise<WorkflowDefinition[]>
  getWorkflowDefinition(workflowId: number, enterpriseId: number): Promise<WorkflowDefinition | null>
  updateWorkflowDefinition(input: UpdateWorkflowDefinitionInput): Promise<WorkflowDefinition>
}

export type WorkflowRunDetail = {
  run: HydratedPlatformTaskRun
  workflow: WorkflowDefinition
  nodeExecutions: WorkflowNodeExecutionRecord[]
}

export type WorkflowRunStatusDetail = {
  run: HydratedPlatformTaskRun
  nodeExecutions: Array<
    Pick<
      WorkflowNodeExecutionRecord,
      | "id"
      | "runId"
      | "workflowId"
      | "nodeKey"
      | "nodeType"
      | "status"
      | "providerId"
      | "modelId"
      | "taskRunId"
      | "outputPayload"
      | "errorMessage"
      | "creditsConsumed"
      | "startedAt"
      | "finishedAt"
      | "createdAt"
      | "updatedAt"
    >
  >
}

const LEGACY_WORKFLOW_TEXT_INPUT_PLACEHOLDERS = new Set(["这是直接在节点卡片里编辑的文本"])

function sanitizeWorkflowNodeConfig(type: WorkflowNodeType, config: WorkflowDefinitionNode["config"]) {
  if (!config || typeof config !== "object") return {}

  const normalizedConfig = { ...config }
  if (type === "text_input" && LEGACY_WORKFLOW_TEXT_INPUT_PLACEHOLDERS.has(String(normalizedConfig.text ?? ""))) {
    normalizedConfig.text = ""
  }
  if (type === "llm_generate") {
    delete normalizedConfig.outputLength
    delete normalizedConfig.responseLength
    delete normalizedConfig.language
    delete normalizedConfig.reasoningMode
  }
  if (type === "image_generate") {
    delete normalizedConfig.sizePreset
    delete normalizedConfig.resolution
  }

  return normalizedConfig
}

export type CreateWorkflowNodeExecutionInput = {
  runId: number
  workflowId: number
  nodeKey: string
  nodeType: WorkflowNodeType
  status?: WorkflowNodeExecutionStatus
  providerId?: string | null
  modelId?: string | null
  taskRunId?: number | null
  inputPayload?: Record<string, unknown> | null
  outputPayload?: Record<string, unknown> | null
  errorMessage?: string | null
  creditsConsumed?: number
  startedAt?: Date | null
  finishedAt?: Date | null
}

export type UpdateWorkflowNodeExecutionInput = {
  runId: number
  nodeKey: string
  status?: WorkflowNodeExecutionStatus
  providerId?: string | null
  modelId?: string | null
  taskRunId?: number | null
  inputPayload?: Record<string, unknown> | null
  outputPayload?: Record<string, unknown> | null
  errorMessage?: string | null
  creditsConsumed?: number
  startedAt?: Date | null
  finishedAt?: Date | null
}

const WORKFLOW_DB_RETRY_DELAYS_MS = [250, 750] as const
const isRetryableWorkflowDbError = createRetryableDbErrorMatcher(["timeout exceeded"])

async function withWorkflowDbRetry<T>(label: string, operation: () => Promise<T>) {
  return withDbRetry(label, operation, {
    retryDelaysMs: WORKFLOW_DB_RETRY_DELAYS_MS,
    isRetryable: isRetryableWorkflowDbError,
    logPrefix: "workflow.store.db.retry",
    exhaustedErrorPrefix: "workflow_store_db_retry_exhausted",
  })
}

async function measureWorkflowStoreStep<T>(label: string, meta: Record<string, unknown>, operation: () => Promise<T>) {
  const startedAt = Date.now()
  try {
    return await operation()
  } finally {
    console.info("workflow.store.timing", {
      label,
      durationMs: Date.now() - startedAt,
      ...meta,
    })
  }
}

type GlobalWithWorkflowEnsureState = typeof globalThis & {
  __aimarketingEnsureWorkflowTablesPromise__?: Promise<void> | null
}

const workflowEnsureState = globalThis as GlobalWithWorkflowEnsureState
let ensureWorkflowTablesPromise = workflowEnsureState.__aimarketingEnsureWorkflowTablesPromise__ ?? null

export async function ensureWorkflowTables() {
  if (!ensureWorkflowTablesPromise) {
    ensureWorkflowTablesPromise = (async () => {
      await ensureEnterpriseAuthTables()
      await ensurePlatformTaskRunTables()

      await withWorkflowDbRetry("ensure-platform-workflows-table", async () =>
        db.execute(sql`
          CREATE TABLE IF NOT EXISTS "AI_MARKETING_platform_workflows" (
            id SERIAL PRIMARY KEY,
            enterprise_id INTEGER NOT NULL REFERENCES "AI_MARKETING_enterprises"(id) ON DELETE CASCADE,
            owner_user_id INTEGER NOT NULL REFERENCES "AI_MARKETING_users"(id) ON DELETE CASCADE,
            title VARCHAR(255) NOT NULL,
            slug VARCHAR(160) NOT NULL,
            status VARCHAR(24) NOT NULL DEFAULT 'draft',
            trigger_type VARCHAR(24) NOT NULL DEFAULT 'manual',
            description TEXT,
            metadata JSONB,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `),
      )

      await withWorkflowDbRetry("ensure-platform-workflow-nodes-table", async () =>
        db.execute(sql`
          CREATE TABLE IF NOT EXISTS "AI_MARKETING_platform_workflow_nodes" (
            id SERIAL PRIMARY KEY,
            workflow_id INTEGER NOT NULL REFERENCES "AI_MARKETING_platform_workflows"(id) ON DELETE CASCADE,
            node_key VARCHAR(120) NOT NULL,
            type VARCHAR(32) NOT NULL,
            title VARCHAR(255) NOT NULL,
            position_x INTEGER NOT NULL DEFAULT 0,
            position_y INTEGER NOT NULL DEFAULT 0,
            config JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `),
      )

      await withWorkflowDbRetry("ensure-platform-workflow-edges-table", async () =>
        db.execute(sql`
          CREATE TABLE IF NOT EXISTS "AI_MARKETING_platform_workflow_edges" (
            id SERIAL PRIMARY KEY,
            workflow_id INTEGER NOT NULL REFERENCES "AI_MARKETING_platform_workflows"(id) ON DELETE CASCADE,
            source_node_key VARCHAR(120) NOT NULL,
            target_node_key VARCHAR(120) NOT NULL,
            input_name VARCHAR(80),
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `),
      )

      await withWorkflowDbRetry("ensure-platform-workflow-node-executions-table", async () =>
        db.execute(sql`
          CREATE TABLE IF NOT EXISTS "AI_MARKETING_platform_workflow_node_executions" (
            id SERIAL PRIMARY KEY,
            run_id INTEGER NOT NULL REFERENCES "AI_MARKETING_platform_task_runs"(id) ON DELETE CASCADE,
            workflow_id INTEGER NOT NULL REFERENCES "AI_MARKETING_platform_workflows"(id) ON DELETE CASCADE,
            node_key VARCHAR(120) NOT NULL,
            node_type VARCHAR(32) NOT NULL,
            status VARCHAR(24) NOT NULL DEFAULT 'queued',
            provider_id VARCHAR(80),
            model_id VARCHAR(160),
            task_run_id INTEGER REFERENCES "AI_MARKETING_platform_task_runs"(id) ON DELETE SET NULL,
            input_payload JSONB,
            output_payload JSONB,
            credits_consumed INTEGER NOT NULL DEFAULT 0,
            started_at TIMESTAMP,
            finished_at TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `),
      )

      await withWorkflowDbRetry("ensure-platform-workflow-node-executions-error-message-column", async () =>
        db.execute(sql`
          ALTER TABLE "AI_MARKETING_platform_workflow_node_executions"
          ADD COLUMN IF NOT EXISTS error_message TEXT
        `),
      )

      await withWorkflowDbRetry("ensure-platform-workflows-enterprise-slug-index", async () =>
        db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_platform_workflows_enterprise_slug_idx"
          ON "AI_MARKETING_platform_workflows"(enterprise_id, slug)
        `),
      )

      await withWorkflowDbRetry("ensure-platform-workflows-enterprise-updated-index", async () =>
        db.execute(sql`
          CREATE INDEX IF NOT EXISTS "AI_MARKETING_platform_workflows_enterprise_updated_idx"
          ON "AI_MARKETING_platform_workflows"(enterprise_id, updated_at DESC)
        `),
      )

      await withWorkflowDbRetry("ensure-platform-workflow-nodes-workflow-node-key-index", async () =>
        db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_platform_workflow_nodes_workflow_node_key_idx"
          ON "AI_MARKETING_platform_workflow_nodes"(workflow_id, node_key)
        `),
      )

      await withWorkflowDbRetry("ensure-platform-workflow-nodes-workflow-position-index", async () =>
        db.execute(sql`
          CREATE INDEX IF NOT EXISTS "AI_MARKETING_platform_workflow_nodes_workflow_position_idx"
          ON "AI_MARKETING_platform_workflow_nodes"(workflow_id, position_x, position_y)
        `),
      )

      await withWorkflowDbRetry("ensure-platform-workflow-edges-workflow-target-index", async () =>
        db.execute(sql`
          CREATE INDEX IF NOT EXISTS "AI_MARKETING_platform_workflow_edges_workflow_target_idx"
          ON "AI_MARKETING_platform_workflow_edges"(workflow_id, target_node_key, source_node_key)
        `),
      )

      await withWorkflowDbRetry("ensure-platform-workflow-edges-workflow-source-index", async () =>
        db.execute(sql`
          CREATE INDEX IF NOT EXISTS "AI_MARKETING_platform_workflow_edges_workflow_source_idx"
          ON "AI_MARKETING_platform_workflow_edges"(workflow_id, source_node_key)
        `),
      )

      await withWorkflowDbRetry("ensure-platform-workflow-node-executions-run-node-key-index", async () =>
        db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_platform_workflow_node_executions_run_node_key_idx"
          ON "AI_MARKETING_platform_workflow_node_executions"(run_id, node_key)
        `),
      )

      await withWorkflowDbRetry("ensure-platform-workflow-node-executions-workflow-status-index", async () =>
        db.execute(sql`
          CREATE INDEX IF NOT EXISTS "AI_MARKETING_platform_workflow_node_executions_workflow_status_idx"
          ON "AI_MARKETING_platform_workflow_node_executions"(workflow_id, status, created_at DESC)
        `),
      )

      await withWorkflowDbRetry("ensure-platform-workflow-node-executions-task-run-index", async () =>
        db.execute(sql`
          CREATE INDEX IF NOT EXISTS "AI_MARKETING_platform_workflow_node_executions_task_run_idx"
          ON "AI_MARKETING_platform_workflow_node_executions"(task_run_id)
        `),
      )
    })().catch((error) => {
      ensureWorkflowTablesPromise = null
      workflowEnsureState.__aimarketingEnsureWorkflowTablesPromise__ = null
      throw error
    })
    workflowEnsureState.__aimarketingEnsureWorkflowTablesPromise__ = ensureWorkflowTablesPromise
  }

  await ensureWorkflowTablesPromise
}

function normalizeSlug(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return (normalized || "workflow").slice(0, 160)
}

function normalizeTitle(value: string | null | undefined, fallback: string) {
  const normalized = typeof value === "string" ? value.trim() : ""
  return (normalized || fallback).slice(0, 255)
}

function normalizeOptionalText(value: string | null | undefined, maxLength: number) {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  return normalized ? normalized.slice(0, maxLength) : null
}

function normalizeStatus(value: WorkflowDefinitionStatus | null | undefined): WorkflowDefinitionStatus {
  if (value === "live" || value === "archived") return value
  return "draft"
}

function normalizeTriggerType(value: WorkflowDefinitionTriggerType | null | undefined): WorkflowDefinitionTriggerType {
  return value === "manual" ? value : "manual"
}

function normalizeNodeExecutionStatus(value: WorkflowNodeExecutionStatus | null | undefined): WorkflowNodeExecutionStatus {
  if (value === "running" || value === "succeeded" || value === "failed" || value === "cancelled") {
    return value
  }
  return "queued"
}

function normalizeNodeKey(value: string, index: number) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return (normalized || `node-${index + 1}`).slice(0, 120)
}

function normalizeNodeType(value: string): WorkflowNodeType {
  if (!isWorkflowNodeType(value)) {
    throw new Error("invalid_workflow_node_type")
  }

  return value
}

function normalizeWorkflowNodes(nodes: WorkflowDefinitionNode[] | undefined) {
  const normalized = (nodes ?? []).map<WorkflowDefinitionNode>((node, index) => {
    const type = normalizeNodeType(node.type)

    return {
      nodeKey: normalizeNodeKey(node.nodeKey, index),
      type,
      title: normalizeTitle(node.title, getDefaultWorkflowNodeTitle(type)),
      positionX: Number.isFinite(node.positionX) ? Math.round(node.positionX) : 0,
      positionY: Number.isFinite(node.positionY) ? Math.round(node.positionY) : 0,
      config: sanitizeWorkflowNodeConfig(type, node.config),
    }
  })

  const seenNodeKeys = new Set<string>()
  for (const node of normalized) {
    if (seenNodeKeys.has(node.nodeKey)) {
      throw new Error("duplicate_workflow_node_key")
    }
    seenNodeKeys.add(node.nodeKey)
  }

  return normalized
}

function normalizeWorkflowEdges(edges: WorkflowDefinitionEdge[] | undefined, nodeKeys: Set<string>) {
  return (edges ?? []).map<WorkflowDefinitionEdge>((edge) => {
    const sourceNodeKey = normalizeNodeKey(edge.sourceNodeKey, 0)
    const targetNodeKey = normalizeNodeKey(edge.targetNodeKey, 0)
    const inputName = normalizeOptionalText(edge.inputName ?? null, 80)

    if (!nodeKeys.has(sourceNodeKey) || !nodeKeys.has(targetNodeKey)) {
      throw new Error("invalid_workflow_edge_node_reference")
    }

    return {
      sourceNodeKey,
      targetNodeKey,
      inputName,
    }
  })
}

function toWorkflowDefinition(
  workflow: WorkflowRecord,
  nodes: WorkflowNodeRecord[],
  edges: WorkflowEdgeRecord[],
): WorkflowDefinition {
  return {
    id: workflow.id,
    enterpriseId: workflow.enterpriseId,
    ownerUserId: workflow.ownerUserId,
    title: workflow.title,
    slug: workflow.slug,
    status: normalizeStatus(workflow.status as WorkflowDefinitionStatus),
    triggerType: normalizeTriggerType(workflow.triggerType as WorkflowDefinitionTriggerType),
    description: workflow.description ?? null,
    metadata: workflow.metadata ?? null,
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
    nodes: nodes.map((node) => ({
      nodeKey: node.nodeKey,
      type: normalizeNodeType(node.type),
      title: node.title,
      positionX: node.positionX,
      positionY: node.positionY,
      config: sanitizeWorkflowNodeConfig(normalizeNodeType(node.type), node.config ?? {}),
    })),
    edges: edges.map((edge) => ({
      sourceNodeKey: edge.sourceNodeKey,
      targetNodeKey: edge.targetNodeKey,
      inputName: edge.inputName ?? null,
    })),
  }
}

function areWorkflowNodeDefinitionsEqual(left: WorkflowDefinitionNode, right: WorkflowDefinitionNode) {
  return (
    left.nodeKey === right.nodeKey &&
    left.type === right.type &&
    left.title === right.title &&
    left.positionX === right.positionX &&
    left.positionY === right.positionY &&
    JSON.stringify(left.config) === JSON.stringify(right.config)
  )
}

function getWorkflowEdgeSignature(edge: Pick<WorkflowDefinitionEdge, "sourceNodeKey" | "targetNodeKey" | "inputName">) {
  return JSON.stringify([edge.sourceNodeKey, edge.targetNodeKey, edge.inputName ?? null])
}

function countWorkflowEdgesBySignature(edges: WorkflowDefinitionEdge[]) {
  const counts = new Map<string, number>()
  for (const edge of edges) {
    const signature = getWorkflowEdgeSignature(edge)
    counts.set(signature, (counts.get(signature) ?? 0) + 1)
  }
  return counts
}

async function buildUniqueWorkflowSlug(enterpriseId: number, title: string, excludeWorkflowId?: number) {
  const baseSlug = normalizeSlug(title)

  for (let counter = 0; counter < 200; counter += 1) {
    const candidate = counter === 0 ? baseSlug : `${baseSlug}-${counter + 1}`.slice(0, 160)
    const rows = await withWorkflowDbRetry("workflow-store.slug-check", () =>
      db
        .select({ id: platformWorkflows.id })
        .from(platformWorkflows)
        .where(
          excludeWorkflowId
            ? and(
                eq(platformWorkflows.enterpriseId, enterpriseId),
                eq(platformWorkflows.slug, candidate),
                ne(platformWorkflows.id, excludeWorkflowId),
              )
            : and(eq(platformWorkflows.enterpriseId, enterpriseId), eq(platformWorkflows.slug, candidate)),
        )
        .limit(1),
    )

    if (rows.length === 0) return candidate
  }

  throw new Error("workflow_slug_generation_failed")
}

async function loadWorkflowDefinitionFromDb(workflowId: number, enterpriseId: number) {
  const startedAt = Date.now()
  const rows = await measureWorkflowStoreStep(
    "select-workflow-row",
    { workflowId, enterpriseId },
    () =>
      withWorkflowDbRetry("workflow-store.select-workflow", () =>
        db
          .select()
          .from(platformWorkflows)
          .where(and(eq(platformWorkflows.id, workflowId), eq(platformWorkflows.enterpriseId, enterpriseId)))
          .limit(1),
      ),
  )
  const workflow = rows[0]
  if (!workflow) return null

  const [nodes, edges] = await Promise.all([
    measureWorkflowStoreStep("select-workflow-nodes", { workflowId: workflow.id }, () =>
      withWorkflowDbRetry("workflow-store.select-nodes", () =>
        db
          .select()
          .from(platformWorkflowNodes)
          .where(eq(platformWorkflowNodes.workflowId, workflow.id))
          .orderBy(asc(platformWorkflowNodes.id)),
      ),
    ),
    measureWorkflowStoreStep("select-workflow-edges", { workflowId: workflow.id }, () =>
      withWorkflowDbRetry("workflow-store.select-edges", () =>
        db
          .select()
          .from(platformWorkflowEdges)
          .where(eq(platformWorkflowEdges.workflowId, workflow.id))
          .orderBy(asc(platformWorkflowEdges.id)),
      ),
    ),
  ])

  console.info("workflow.store.timing", {
    label: "load-workflow-definition-total",
    workflowId: workflow.id,
    enterpriseId,
    nodeCount: nodes.length,
    edgeCount: edges.length,
    durationMs: Date.now() - startedAt,
  })

  return toWorkflowDefinition(workflow, nodes, edges)
}

const dbWorkflowStore: WorkflowStore = {
  async createWorkflowDefinition(input) {
    await ensureWorkflowTables()

    const title = normalizeTitle(input.title, "Untitled workflow")
    const description = normalizeOptionalText(input.description, 10_000)
    const nodes = normalizeWorkflowNodes(input.nodes)
    const nodeKeys = new Set(nodes.map((node) => node.nodeKey))
    const edges = normalizeWorkflowEdges(input.edges, nodeKeys)
    const slug = await buildUniqueWorkflowSlug(input.enterpriseId, title)
    const now = new Date()

    const workflowId = await db.transaction(async (tx) => {
      const [workflow] = await tx
        .insert(platformWorkflows)
        .values({
          enterpriseId: input.enterpriseId,
          ownerUserId: input.ownerUserId,
          title,
          slug,
          status: normalizeStatus(input.status),
          triggerType: normalizeTriggerType(input.triggerType),
          description,
          metadata: input.metadata ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: platformWorkflows.id })

      if (nodes.length > 0) {
        await tx.insert(platformWorkflowNodes).values(
          nodes.map((node) => ({
            workflowId: workflow.id,
            nodeKey: node.nodeKey,
            type: node.type,
            title: node.title,
            positionX: node.positionX,
            positionY: node.positionY,
            config: node.config,
            createdAt: now,
            updatedAt: now,
          })),
        )
      }

      if (edges.length > 0) {
        await tx.insert(platformWorkflowEdges).values(
          edges.map((edge) => ({
            workflowId: workflow.id,
            sourceNodeKey: edge.sourceNodeKey,
            targetNodeKey: edge.targetNodeKey,
            inputName: edge.inputName ?? null,
            createdAt: now,
          })),
        )
      }

      return workflow.id
    })

    const created = await loadWorkflowDefinitionFromDb(workflowId, input.enterpriseId)
    if (!created) throw new Error("workflow_definition_not_found_after_create")
    return created
  },

  async listWorkflowDefinitionsForEnterprise(enterpriseId) {
    await ensureWorkflowTables()

    const workflows = await withWorkflowDbRetry("workflow-store.list-workflows", () =>
      db
        .select()
        .from(platformWorkflows)
        .where(eq(platformWorkflows.enterpriseId, enterpriseId))
        .orderBy(desc(platformWorkflows.updatedAt), desc(platformWorkflows.id)),
    )

    const definitions = await Promise.all(
      workflows.map((workflow) => loadWorkflowDefinitionFromDb(workflow.id, enterpriseId)),
    )

    return definitions.filter((definition): definition is WorkflowDefinition => Boolean(definition))
  },

  async getWorkflowDefinition(workflowId, enterpriseId) {
    await ensureWorkflowTables()
    return loadWorkflowDefinitionFromDb(workflowId, enterpriseId)
  },

  async updateWorkflowDefinition(input) {
    await ensureWorkflowTables()

    const existing = await loadWorkflowDefinitionFromDb(input.workflowId, input.enterpriseId)
    if (!existing) {
      throw new Error("workflow_definition_not_found")
    }

    const title = normalizeTitle(input.title ?? existing.title, existing.title)
    const description =
      input.description !== undefined ? normalizeOptionalText(input.description, 10_000) : existing.description
    const nodes = normalizeWorkflowNodes(input.nodes ?? existing.nodes)
    const nodeKeys = new Set(nodes.map((node) => node.nodeKey))
    const edges = normalizeWorkflowEdges(input.edges ?? existing.edges, nodeKeys)
    const status = normalizeStatus(input.status ?? existing.status)
    const triggerType = normalizeTriggerType(input.triggerType ?? existing.triggerType)
    const metadata = input.metadata !== undefined ? input.metadata : existing.metadata
    const slug =
      title === existing.title ? existing.slug : await buildUniqueWorkflowSlug(input.enterpriseId, title, input.workflowId)
    const now = new Date()

    const existingNodesByKey = new Map(existing.nodes.map((node) => [node.nodeKey, node]))
    const nextNodesByKey = new Map(nodes.map((node) => [node.nodeKey, node]))
    const nodeKeysToDelete = existing.nodes
      .filter((node) => !nextNodesByKey.has(node.nodeKey))
      .map((node) => node.nodeKey)
    const nodesToInsert = nodes.filter((node) => !existingNodesByKey.has(node.nodeKey))
    const nodesToUpdate = nodes.filter((node) => {
      const current = existingNodesByKey.get(node.nodeKey)
      return current ? !areWorkflowNodeDefinitionsEqual(current, node) : false
    })

    const existingEdgeCounts = countWorkflowEdgesBySignature(existing.edges)
    const nextEdgeCounts = countWorkflowEdgesBySignature(edges)
    const edgeSignaturesToRewrite = new Set<string>()

    for (const [signature, count] of existingEdgeCounts.entries()) {
      if (count !== (nextEdgeCounts.get(signature) ?? 0)) {
        edgeSignaturesToRewrite.add(signature)
      }
    }
    for (const [signature, count] of nextEdgeCounts.entries()) {
      if (count !== (existingEdgeCounts.get(signature) ?? 0)) {
        edgeSignaturesToRewrite.add(signature)
      }
    }

    const edgesToInsert = edges.filter((edge) => edgeSignaturesToRewrite.has(getWorkflowEdgeSignature(edge)))
    const definitionChanged =
      title !== existing.title ||
      description !== existing.description ||
      status !== existing.status ||
      triggerType !== existing.triggerType ||
      slug !== existing.slug ||
      JSON.stringify(metadata) !== JSON.stringify(existing.metadata) ||
      nodeKeysToDelete.length > 0 ||
      nodesToInsert.length > 0 ||
      nodesToUpdate.length > 0 ||
      edgeSignaturesToRewrite.size > 0

    if (!definitionChanged) {
      return existing
    }

    await db.transaction(async (tx) => {
      await tx
        .update(platformWorkflows)
        .set({
          title,
          slug,
          status,
          triggerType,
          description,
          metadata,
          updatedAt: now,
        })
        .where(and(eq(platformWorkflows.id, input.workflowId), eq(platformWorkflows.enterpriseId, input.enterpriseId)))

      if (edgeSignaturesToRewrite.size > 0) {
        for (const signature of edgeSignaturesToRewrite) {
          const [sourceNodeKey, targetNodeKey, inputName] = JSON.parse(signature) as [string, string, string | null]
          await tx
            .delete(platformWorkflowEdges)
            .where(
              and(
                eq(platformWorkflowEdges.workflowId, input.workflowId),
                eq(platformWorkflowEdges.sourceNodeKey, sourceNodeKey),
                eq(platformWorkflowEdges.targetNodeKey, targetNodeKey),
                inputName === null ? sql`${platformWorkflowEdges.inputName} IS NULL` : eq(platformWorkflowEdges.inputName, inputName),
              ),
            )
        }
      }

      if (nodeKeysToDelete.length > 0) {
        await tx
          .delete(platformWorkflowNodes)
          .where(and(eq(platformWorkflowNodes.workflowId, input.workflowId), inArray(platformWorkflowNodes.nodeKey, nodeKeysToDelete)))
      }

      for (const node of nodesToUpdate) {
        await tx
          .update(platformWorkflowNodes)
          .set({
            type: node.type,
            title: node.title,
            positionX: node.positionX,
            positionY: node.positionY,
            config: node.config,
            updatedAt: now,
          })
          .where(and(eq(platformWorkflowNodes.workflowId, input.workflowId), eq(platformWorkflowNodes.nodeKey, node.nodeKey)))
      }

      if (nodesToInsert.length > 0) {
        await tx.insert(platformWorkflowNodes).values(
          nodesToInsert.map((node) => ({
            workflowId: input.workflowId,
            nodeKey: node.nodeKey,
            type: node.type,
            title: node.title,
            positionX: node.positionX,
            positionY: node.positionY,
            config: node.config,
            createdAt: now,
            updatedAt: now,
          })),
        )
      }

      if (edgesToInsert.length > 0) {
        await tx.insert(platformWorkflowEdges).values(
          edgesToInsert.map((edge) => ({
            workflowId: input.workflowId,
            sourceNodeKey: edge.sourceNodeKey,
            targetNodeKey: edge.targetNodeKey,
            inputName: edge.inputName ?? null,
            createdAt: now,
          })),
        )
      }
    })

    return {
      ...existing,
      title,
      slug,
      status,
      triggerType,
      description,
      metadata: metadata ?? null,
      updatedAt: now,
      nodes,
      edges,
    }
  },
}

export function createInMemoryWorkflowStore(): WorkflowStore {
  let nextWorkflowId = 1

  const workflows = new Map<number, WorkflowDefinition>()

  return {
    async createWorkflowDefinition(input) {
      const title = normalizeTitle(input.title, "Untitled workflow")
      const nodes = normalizeWorkflowNodes(input.nodes)
      const nodeKeys = new Set(nodes.map((node) => node.nodeKey))
      const edges = normalizeWorkflowEdges(input.edges, nodeKeys)
      const slugBase = normalizeSlug(title)
      let slug = slugBase
      let counter = 2

      while ([...workflows.values()].some((workflow) => workflow.enterpriseId === input.enterpriseId && workflow.slug === slug)) {
        slug = `${slugBase}-${counter}`.slice(0, 160)
        counter += 1
      }

      const now = new Date()
      const workflow: WorkflowDefinition = {
        id: nextWorkflowId,
        enterpriseId: input.enterpriseId,
        ownerUserId: input.ownerUserId,
        title,
        slug,
        status: normalizeStatus(input.status),
        triggerType: normalizeTriggerType(input.triggerType),
        description: normalizeOptionalText(input.description, 10_000),
        metadata: input.metadata ?? null,
        createdAt: now,
        updatedAt: now,
        nodes,
        edges,
      }

      workflows.set(workflow.id, workflow)
      nextWorkflowId += 1
      return {
        ...workflow,
        nodes: workflow.nodes.map((node) => ({ ...node, config: { ...node.config } })),
        edges: workflow.edges.map((edge) => ({ ...edge })),
      }
    },

    async listWorkflowDefinitionsForEnterprise(enterpriseId) {
      return [...workflows.values()]
        .filter((workflow) => workflow.enterpriseId === enterpriseId)
        .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime() || right.id - left.id)
        .map((workflow) => ({
          ...workflow,
          nodes: workflow.nodes.map((node) => ({ ...node, config: { ...node.config } })),
          edges: workflow.edges.map((edge) => ({ ...edge })),
        }))
    },

    async getWorkflowDefinition(workflowId, enterpriseId) {
      const workflow = workflows.get(workflowId)
      if (!workflow || workflow.enterpriseId !== enterpriseId) return null
      return {
        ...workflow,
        nodes: workflow.nodes.map((node) => ({ ...node, config: { ...node.config } })),
        edges: workflow.edges.map((edge) => ({ ...edge })),
      }
    },

    async updateWorkflowDefinition(input) {
      const existing = workflows.get(input.workflowId)
      if (!existing || existing.enterpriseId !== input.enterpriseId) {
        throw new Error("workflow_definition_not_found")
      }

      const title = normalizeTitle(input.title ?? existing.title, existing.title)
      const nodes = normalizeWorkflowNodes(input.nodes ?? existing.nodes)
      const nodeKeys = new Set(nodes.map((node) => node.nodeKey))
      const edges = normalizeWorkflowEdges(input.edges ?? existing.edges, nodeKeys)
      const now = new Date()
      const workflow: WorkflowDefinition = {
        ...existing,
        title,
        slug:
          title === existing.title
            ? existing.slug
            : `${normalizeSlug(title)}-${input.workflowId}`.slice(0, 160),
        status: normalizeStatus(input.status ?? existing.status),
        triggerType: normalizeTriggerType(input.triggerType ?? existing.triggerType),
        description: input.description !== undefined ? normalizeOptionalText(input.description, 10_000) : existing.description,
        metadata: input.metadata !== undefined ? input.metadata : existing.metadata,
        updatedAt: now,
        nodes,
        edges,
      }

      workflows.set(workflow.id, workflow)
      return {
        ...workflow,
        nodes: workflow.nodes.map((node) => ({ ...node, config: { ...node.config } })),
        edges: workflow.edges.map((edge) => ({ ...edge })),
      }
    },
  }
}

export const workflowStore: WorkflowStore = dbWorkflowStore

export async function createWorkflowDefinition(input: CreateWorkflowDefinitionInput, store: WorkflowStore = workflowStore) {
  return store.createWorkflowDefinition(input)
}

export async function listWorkflowDefinitionsForEnterprise(enterpriseId: number, store: WorkflowStore = workflowStore) {
  return store.listWorkflowDefinitionsForEnterprise(enterpriseId)
}

export async function getWorkflowDefinition(workflowId: number, enterpriseId: number, store: WorkflowStore = workflowStore) {
  return store.getWorkflowDefinition(workflowId, enterpriseId)
}

export async function updateWorkflowDefinition(input: UpdateWorkflowDefinitionInput, store: WorkflowStore = workflowStore) {
  return store.updateWorkflowDefinition(input)
}

export function getWorkflowNodeExecutionTable() {
  return platformWorkflowNodeExecutions
}

function buildWorkflowNodeExecutionInsert(input: CreateWorkflowNodeExecutionInput) {
  const now = new Date()

  return {
    runId: input.runId,
    workflowId: input.workflowId,
    nodeKey: normalizeNodeKey(input.nodeKey, 0),
    nodeType: normalizeNodeType(input.nodeType),
    status: normalizeNodeExecutionStatus(input.status),
    providerId: normalizeOptionalText(input.providerId, 80),
    modelId: normalizeOptionalText(input.modelId, 160),
    taskRunId: input.taskRunId ?? null,
    inputPayload: input.inputPayload ?? null,
    outputPayload: input.outputPayload ?? null,
    errorMessage: normalizeOptionalText(input.errorMessage, 4000),
    creditsConsumed: input.creditsConsumed ?? 0,
    startedAt: input.startedAt ?? null,
    finishedAt: input.finishedAt ?? null,
    createdAt: now,
    updatedAt: now,
  }
}

export async function createWorkflowNodeExecutionRecords(
  inputs: CreateWorkflowNodeExecutionInput[],
) {
  await ensureWorkflowTables()
  if (inputs.length === 0) return [] as WorkflowNodeExecutionRecord[]

  return withWorkflowDbRetry("workflow-store.insert-node-executions", async () =>
    db
      .insert(platformWorkflowNodeExecutions)
      .values(inputs.map((input) => buildWorkflowNodeExecutionInsert(input)))
      .returning(),
  )
}

export async function updateWorkflowNodeExecution(input: UpdateWorkflowNodeExecutionInput) {
  await ensureWorkflowTables()

  const nextValues: Partial<typeof platformWorkflowNodeExecutions.$inferInsert> & { updatedAt: Date } = {
    updatedAt: new Date(),
  }

  if (input.status !== undefined) nextValues.status = normalizeNodeExecutionStatus(input.status)
  if (input.providerId !== undefined) nextValues.providerId = normalizeOptionalText(input.providerId, 80)
  if (input.modelId !== undefined) nextValues.modelId = normalizeOptionalText(input.modelId, 160)
  if (input.taskRunId !== undefined) nextValues.taskRunId = input.taskRunId
  if (input.inputPayload !== undefined) nextValues.inputPayload = input.inputPayload
  if (input.outputPayload !== undefined) nextValues.outputPayload = input.outputPayload
  if (input.errorMessage !== undefined) nextValues.errorMessage = normalizeOptionalText(input.errorMessage, 4000)
  if (input.creditsConsumed !== undefined) nextValues.creditsConsumed = input.creditsConsumed
  if (input.startedAt !== undefined) nextValues.startedAt = input.startedAt
  if (input.finishedAt !== undefined) nextValues.finishedAt = input.finishedAt

  const rows = await withWorkflowDbRetry("workflow-store.update-node-execution", () =>
    db
      .update(platformWorkflowNodeExecutions)
      .set(nextValues)
      .where(and(eq(platformWorkflowNodeExecutions.runId, input.runId), eq(platformWorkflowNodeExecutions.nodeKey, input.nodeKey)))
      .returning(),
  )

  return rows[0] ?? null
}

export async function listWorkflowNodeExecutions(runId: number) {
  await ensureWorkflowTables()

  return withWorkflowDbRetry("workflow-store.list-node-executions", () =>
    db
      .select()
      .from(platformWorkflowNodeExecutions)
      .where(eq(platformWorkflowNodeExecutions.runId, runId))
      .orderBy(asc(platformWorkflowNodeExecutions.id)),
  )
}

export async function listWorkflowNodeExecutionStatuses(runId: number) {
  await ensureWorkflowTables()
  return withWorkflowDbRetry("workflow-store.list-workflow-node-execution-statuses", () =>
    db
      .select({
        id: platformWorkflowNodeExecutions.id,
        runId: platformWorkflowNodeExecutions.runId,
        workflowId: platformWorkflowNodeExecutions.workflowId,
        nodeKey: platformWorkflowNodeExecutions.nodeKey,
        nodeType: platformWorkflowNodeExecutions.nodeType,
        status: platformWorkflowNodeExecutions.status,
        providerId: platformWorkflowNodeExecutions.providerId,
        modelId: platformWorkflowNodeExecutions.modelId,
        taskRunId: platformWorkflowNodeExecutions.taskRunId,
        outputPayload: platformWorkflowNodeExecutions.outputPayload,
        errorMessage: platformWorkflowNodeExecutions.errorMessage,
        creditsConsumed: platformWorkflowNodeExecutions.creditsConsumed,
        startedAt: platformWorkflowNodeExecutions.startedAt,
        finishedAt: platformWorkflowNodeExecutions.finishedAt,
        createdAt: platformWorkflowNodeExecutions.createdAt,
        updatedAt: platformWorkflowNodeExecutions.updatedAt,
      })
      .from(platformWorkflowNodeExecutions)
      .where(eq(platformWorkflowNodeExecutions.runId, runId))
      .orderBy(asc(platformWorkflowNodeExecutions.createdAt), asc(platformWorkflowNodeExecutions.id)),
  )
}

export async function resetWorkflowNodeExecutions(runId: number, nodeKeys: string[]) {
  await ensureWorkflowTables()
  const normalizedNodeKeys = [...new Set(nodeKeys.map((nodeKey) => normalizeNodeKey(nodeKey, 0)))]
  if (normalizedNodeKeys.length === 0) return [] as WorkflowNodeExecutionRecord[]

  return withWorkflowDbRetry("workflow-store.reset-node-executions", () =>
    db
      .update(platformWorkflowNodeExecutions)
      .set({
        status: "queued",
        providerId: null,
        modelId: null,
        taskRunId: null,
        inputPayload: null,
        outputPayload: null,
        errorMessage: null,
        creditsConsumed: 0,
        startedAt: null,
        finishedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(platformWorkflowNodeExecutions.runId, runId), inArray(platformWorkflowNodeExecutions.nodeKey, normalizedNodeKeys)))
      .returning(),
  )
}

export async function failRunningWorkflowNodeExecutions(runId: number) {
  await ensureWorkflowTables()
  const now = new Date()

  return withWorkflowDbRetry("workflow-store.fail-running-node-executions", () =>
    db
      .update(platformWorkflowNodeExecutions)
      .set({
        status: "failed",
        errorMessage: "workflow_run_stale",
        finishedAt: now,
        updatedAt: now,
      })
      .where(and(eq(platformWorkflowNodeExecutions.runId, runId), eq(platformWorkflowNodeExecutions.status, "running")))
      .returning(),
  )
}

export async function cancelQueuedWorkflowNodeExecutions(runId: number) {
  await ensureWorkflowTables()
  const now = new Date()

  return withWorkflowDbRetry("workflow-store.cancel-queued-node-executions", () =>
    db
      .update(platformWorkflowNodeExecutions)
      .set({
        status: "cancelled",
        errorMessage: "workflow_run_cancelled",
        finishedAt: now,
        updatedAt: now,
      })
      .where(and(eq(platformWorkflowNodeExecutions.runId, runId), eq(platformWorkflowNodeExecutions.status, "queued")))
      .returning(),
  )
}

export async function getWorkflowRunDetail(runId: number, enterpriseId: number): Promise<WorkflowRunDetail | null> {
  const run = await getPlatformTaskRun(runId)
  if (!run || run.enterpriseId !== enterpriseId) return null

  const workflowId = Number(
    run.inputPayload && typeof run.inputPayload.workflowId === "number"
      ? run.inputPayload.workflowId
      : run.normalizedResult && typeof run.normalizedResult.workflowId === "number"
        ? run.normalizedResult.workflowId
        : NaN,
  )

  if (!Number.isInteger(workflowId) || workflowId <= 0) {
    return null
  }

  const workflow = await getWorkflowDefinition(workflowId, enterpriseId)
  if (!workflow) return null

  const nodeExecutions = await listWorkflowNodeExecutions(runId)
  const runWithNormalizedStatus = normalizeWorkflowRunStatusFromNodeExecutions(run, nodeExecutions)
  return {
    run: runWithNormalizedStatus,
    workflow,
    nodeExecutions: normalizeWorkflowNodeStatusesForRunningRun(runWithNormalizedStatus, nodeExecutions, workflow.edges),
  }
}

export function normalizeWorkflowRunStatusFromNodeExecutions(
  run: WorkflowRunStatusDetail["run"],
  nodeExecutions: WorkflowRunStatusDetail["nodeExecutions"],
) {
  if (nodeExecutions.length === 0) return run

  const hasFailedNode = nodeExecutions.some(
    (execution) => execution.status === "failed" || execution.status === "cancelled",
  )
  const hasSuccessfulNode =
    nodeExecutions.length > 0 && nodeExecutions.every((execution) => execution.status === "succeeded")
  const derivedStatus = hasFailedNode ? "failed" : hasSuccessfulNode ? "succeeded" : "running"
  const startedAtCandidates = nodeExecutions
    .map((execution) => execution.startedAt)
    .filter((value): value is Date => value instanceof Date)
  const finishedAtCandidates = nodeExecutions
    .flatMap((execution) => [execution.finishedAt, execution.updatedAt, execution.startedAt, execution.createdAt])
    .filter((value): value is Date => value instanceof Date)
  const earliestStartedAt =
    startedAtCandidates.length > 0
      ? new Date(Math.min(...startedAtCandidates.map((value) => value.getTime())))
      : null
  const latestFinishedAt =
    finishedAtCandidates.length > 0
      ? new Date(Math.max(...finishedAtCandidates.map((value) => value.getTime())))
      : null

  return {
    ...run,
    status: derivedStatus,
    startedAt: run.startedAt ?? earliestStartedAt,
    finishedAt: derivedStatus === "running" ? null : run.finishedAt ?? latestFinishedAt ?? new Date(),
    updatedAt: latestFinishedAt && latestFinishedAt.getTime() > run.updatedAt.getTime() ? latestFinishedAt : run.updatedAt,
  }
}

export function normalizeWorkflowNodeStatusesForRunningRun<T extends {
  nodeKey: string
  status: string
  startedAt: Date | null
  updatedAt: Date
}>(
  run: { status: string },
  nodeExecutions: T[],
  edges: WorkflowDefinitionEdge[],
): T[] {
  if (run.status !== "running") return nodeExecutions

  const statusByNodeKey = new Map(nodeExecutions.map((execution) => [execution.nodeKey, execution.status]))
  const now = new Date()

  return nodeExecutions.map((execution) => {
    if (execution.status !== "queued") return execution

    const parentNodeKeys = edges
      .filter((edge) => edge.targetNodeKey === execution.nodeKey)
      .map((edge) => edge.sourceNodeKey)
    const parentsSucceeded = parentNodeKeys.every((nodeKey) => statusByNodeKey.get(nodeKey) === "succeeded")
    if (!parentsSucceeded) return execution

    return {
      ...execution,
      status: "running" as const,
      startedAt: execution.startedAt ?? now,
      updatedAt: now,
    } as T
  })
}

export async function getWorkflowRunStatusDetail(
  runId: number,
  enterpriseId: number,
): Promise<WorkflowRunStatusDetail | null> {
  const run = await getPlatformTaskRun(runId)
  if (!run || run.enterpriseId !== enterpriseId) return null

  const nodeExecutions = await listWorkflowNodeExecutionStatuses(runId)
  const workflowId = Number(
    run.inputPayload && typeof run.inputPayload.workflowId === "number"
      ? run.inputPayload.workflowId
      : run.normalizedResult && typeof run.normalizedResult.workflowId === "number"
        ? run.normalizedResult.workflowId
        : NaN,
  )
  const workflow =
    Number.isInteger(workflowId) && workflowId > 0
      ? await getWorkflowDefinition(workflowId, enterpriseId)
      : null
  const runWithNormalizedStatus = normalizeWorkflowRunStatusFromNodeExecutions(run, nodeExecutions)

  return {
    run: runWithNormalizedStatus,
    nodeExecutions: workflow
      ? normalizeWorkflowNodeStatusesForRunningRun(runWithNormalizedStatus, nodeExecutions, workflow.edges)
      : nodeExecutions,
  }
}
