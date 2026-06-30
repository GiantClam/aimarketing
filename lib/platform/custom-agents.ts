import { and, asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { createRetryableDbErrorMatcher, withDbRetry } from "@/lib/db/retry"
import {
  enterpriseKnowledgeDatasets,
  enterprisePlatformCustomAgentBusinessBindings,
  enterprisePlatformCustomAgentWorkflowBindings,
  enterprisePlatformCustomAgents,
  platformWorkflows,
  userKnowledgeDatasets,
} from "@/lib/db/schema"
import type { AuthUserPayload } from "@/lib/enterprise/server"
import { ensureEnterpriseAuthTables } from "@/lib/enterprise/server"
import { deleteEnterpriseAgentCardBySlug, upsertEnterpriseAgentCardBySlug } from "@/lib/platform/agent-cards"
import { buildCustomAgentProjectionConfig } from "@/lib/platform/custom-agent-projection"

export type CustomAgentStatus = "draft" | "published" | "disabled" | "archived"
export type CustomAgentVisibility = "private" | "shared"
export type CustomAgentExecutionMode = "direct_agent" | "workflow_backed"
export type CustomAgentRetrievalMode = "semantic" | "keyword" | "hybrid"

export type CustomAgentBusinessBinding = {
  id: number
  businessSlug: string
  displayPriority: number
  enabled: boolean
}

export type CustomAgentWorkflowBinding = {
  id: number
  workflowId: number
  workflowTitle: string | null
  workflowSlug: string | null
  nodeRole: string
  inputSchema: Record<string, unknown> | null
  outputSchema: Record<string, unknown> | null
  knowledgeSourceIds: number[]
  retrievalMode: CustomAgentRetrievalMode | null
  enabled: boolean
}

export type CustomAgentView = {
  id: number
  enterpriseId: number
  ownerUserId: number
  sourceAgentId: string | null
  linkedWorkflowId: number | null
  linkedWorkflowTitle: string | null
  linkedWorkflowSlug: string | null
  name: string
  slug: string
  category: "custom"
  summary: string
  systemPrompt: string
  systemPromptSummary: string | null
  goal: string | null
  scope: string | null
  guardrails: string | null
  defaultOutputType: string
  runtimeModelOptions: Record<string, unknown> | null
  knowledgeBindings: number[]
  knowledgeBindingDetails: Array<{ id: number; name: string }>
  enterpriseKnowledgeDatasetIds: number[]
  enterpriseKnowledgeBindingDetails: Array<{ id: number; name: string; category: string }>
  knowledgeRetrievalPolicy: Record<string, unknown> | null
  toolBindings: Record<string, unknown> | null
  skillBindings: Record<string, unknown> | null
  mcpBindings: Record<string, unknown> | null
  artifactKinds: string[]
  visibility: CustomAgentVisibility
  status: CustomAgentStatus
  metadata: Record<string, unknown> | null
  publishedAt: Date | null
  archivedAt: Date | null
  createdAt: Date
  updatedAt: Date
  executionMode: CustomAgentExecutionMode
  businessBindings: CustomAgentBusinessBinding[]
  workflowBindings: CustomAgentWorkflowBinding[]
  canEdit: boolean
  canManageLifecycle: boolean
}

export type CreateCustomAgentInput = {
  enterpriseId: number
  ownerUserId: number
  sourceAgentId?: string | null
  linkedWorkflowId?: number | null
  name: string
  summary?: string | null
  systemPrompt?: string | null
  systemPromptSummary?: string | null
  goal?: string | null
  scope?: string | null
  guardrails?: string | null
  defaultOutputType?: string | null
  runtimeModelOptions?: Record<string, unknown> | null
  knowledgeBindings?: number[] | null
  knowledgeRetrievalPolicy?: Record<string, unknown> | null
  toolBindings?: Record<string, unknown> | null
  skillBindings?: Record<string, unknown> | null
  mcpBindings?: Record<string, unknown> | null
  artifactKinds?: string[] | null
  visibility?: CustomAgentVisibility | null
  status?: CustomAgentStatus | null
  metadata?: Record<string, unknown> | null
}

export type UpdateCustomAgentInput = {
  agentId: number
  enterpriseId: number
  actorUserId: number
  isEnterpriseAdmin: boolean
  linkedWorkflowId?: number | null
  name?: string | null
  summary?: string | null
  systemPrompt?: string | null
  systemPromptSummary?: string | null
  goal?: string | null
  scope?: string | null
  guardrails?: string | null
  defaultOutputType?: string | null
  runtimeModelOptions?: Record<string, unknown> | null
  knowledgeBindings?: number[] | null
  knowledgeRetrievalPolicy?: Record<string, unknown> | null
  toolBindings?: Record<string, unknown> | null
  skillBindings?: Record<string, unknown> | null
  mcpBindings?: Record<string, unknown> | null
  artifactKinds?: string[] | null
  visibility?: CustomAgentVisibility | null
  metadata?: Record<string, unknown> | null
}

export type CustomAgentBusinessBindingInput = {
  businessSlug: string
  displayPriority?: number | null
  enabled?: boolean | null
}

export type CustomAgentWorkflowBindingInput = {
  workflowId: number
  nodeRole?: string | null
  inputSchema?: Record<string, unknown> | null
  outputSchema?: Record<string, unknown> | null
  knowledgeSourceIds?: number[] | null
  retrievalMode?: CustomAgentRetrievalMode | null
  enabled?: boolean | null
}

const RETRY_DELAYS_MS = [250, 750] as const
const isRetryable = createRetryableDbErrorMatcher(["timeout exceeded"])

async function withCustomAgentDbRetry<T>(label: string, operation: () => Promise<T>) {
  return withDbRetry(label, operation, {
    retryDelaysMs: RETRY_DELAYS_MS,
    isRetryable,
    logPrefix: "platform.custom-agents.db.retry",
    exhaustedErrorPrefix: "platform_custom_agents_db_retry_exhausted",
  })
}

type GlobalWithCustomAgentEnsureState = typeof globalThis & {
  __aimarketingEnsureCustomAgentTablesPromise__?: Promise<void> | null
}

const ensureState = globalThis as GlobalWithCustomAgentEnsureState
let ensureTablesPromise = ensureState.__aimarketingEnsureCustomAgentTablesPromise__ ?? null

export async function ensureCustomAgentTables() {
  if (!ensureTablesPromise) {
    ensureTablesPromise = (async () => {
      await ensureEnterpriseAuthTables()

      await withCustomAgentDbRetry("ensure-custom-agents-table", () =>
        db.execute(sql`
          CREATE TABLE IF NOT EXISTS "AI_MARKETING_enterprise_platform_custom_agents" (
            id SERIAL PRIMARY KEY,
            enterprise_id INTEGER NOT NULL REFERENCES "AI_MARKETING_enterprises"(id) ON DELETE CASCADE,
            owner_user_id INTEGER NOT NULL REFERENCES "AI_MARKETING_users"(id) ON DELETE CASCADE,
            source_agent_id VARCHAR(128),
            linked_workflow_id INTEGER REFERENCES "AI_MARKETING_platform_workflows"(id) ON DELETE SET NULL,
            name VARCHAR(160) NOT NULL,
            slug VARCHAR(128) NOT NULL,
            category VARCHAR(24) NOT NULL DEFAULT 'custom',
            summary TEXT NOT NULL,
            system_prompt TEXT NOT NULL,
            system_prompt_summary TEXT,
            goal TEXT,
            scope TEXT,
            guardrails TEXT,
            default_output_type VARCHAR(32) NOT NULL DEFAULT 'text',
            runtime_model_options JSONB,
            knowledge_bindings JSONB,
            knowledge_retrieval_policy JSONB,
            tool_bindings JSONB,
            skill_bindings JSONB,
            mcp_bindings JSONB,
            artifact_kinds JSONB,
            visibility VARCHAR(16) NOT NULL DEFAULT 'private',
            status VARCHAR(24) NOT NULL DEFAULT 'draft',
            metadata JSONB,
            published_at TIMESTAMP,
            archived_at TIMESTAMP,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `),
      )

      await withCustomAgentDbRetry("ensure-custom-agent-business-bindings-table", () =>
        db.execute(sql`
          CREATE TABLE IF NOT EXISTS "AI_MARKETING_enterprise_platform_custom_agent_business_bindings" (
            id SERIAL PRIMARY KEY,
            agent_id INTEGER NOT NULL REFERENCES "AI_MARKETING_enterprise_platform_custom_agents"(id) ON DELETE CASCADE,
            business_slug VARCHAR(64) NOT NULL,
            display_priority INTEGER NOT NULL DEFAULT 100,
            enabled BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `),
      )

      await withCustomAgentDbRetry("ensure-custom-agent-workflow-bindings-table", () =>
        db.execute(sql`
          CREATE TABLE IF NOT EXISTS "AI_MARKETING_enterprise_platform_custom_agent_workflow_bindings" (
            id SERIAL PRIMARY KEY,
            agent_id INTEGER NOT NULL REFERENCES "AI_MARKETING_enterprise_platform_custom_agents"(id) ON DELETE CASCADE,
            workflow_id INTEGER NOT NULL REFERENCES "AI_MARKETING_platform_workflows"(id) ON DELETE CASCADE,
            node_role VARCHAR(64) NOT NULL DEFAULT 'agent',
            input_schema JSONB,
            output_schema JSONB,
            knowledge_source_ids JSONB,
            retrieval_mode VARCHAR(24),
            enabled BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
        `),
      )

      await withCustomAgentDbRetry("ensure-custom-agent-enterprise-slug-index", () =>
        db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_enterprise_platform_custom_agents_enterprise_slug_idx"
          ON "AI_MARKETING_enterprise_platform_custom_agents"(enterprise_id, slug)
        `),
      )
      await withCustomAgentDbRetry("ensure-custom-agent-enterprise-owner-status-index", () =>
        db.execute(sql`
          CREATE INDEX IF NOT EXISTS "AI_MARKETING_enterprise_platform_custom_agents_enterprise_owner_status_idx"
          ON "AI_MARKETING_enterprise_platform_custom_agents"(enterprise_id, owner_user_id, status)
        `),
      )
      await withCustomAgentDbRetry("ensure-custom-agent-enterprise-updated-index", () =>
        db.execute(sql`
          CREATE INDEX IF NOT EXISTS "AI_MARKETING_enterprise_platform_custom_agents_enterprise_updated_idx"
          ON "AI_MARKETING_enterprise_platform_custom_agents"(enterprise_id, updated_at DESC)
        `),
      )
      await withCustomAgentDbRetry("ensure-custom-agent-linked-workflow-index", () =>
        db.execute(sql`
          CREATE INDEX IF NOT EXISTS "AI_MARKETING_enterprise_platform_custom_agents_linked_workflow_idx"
          ON "AI_MARKETING_enterprise_platform_custom_agents"(linked_workflow_id)
        `),
      )
      await withCustomAgentDbRetry("ensure-custom-agent-business-unique-index", () =>
        db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_enterprise_platform_custom_agent_business_bindings_agent_business_idx"
          ON "AI_MARKETING_enterprise_platform_custom_agent_business_bindings"(agent_id, business_slug)
        `),
      )
      await withCustomAgentDbRetry("ensure-custom-agent-workflow-unique-index", () =>
        db.execute(sql`
          CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_enterprise_platform_custom_agent_workflow_bindings_agent_workflow_idx"
          ON "AI_MARKETING_enterprise_platform_custom_agent_workflow_bindings"(agent_id, workflow_id)
        `),
      )
    })().catch((error) => {
      ensureTablesPromise = null
      ensureState.__aimarketingEnsureCustomAgentTablesPromise__ = null
      throw error
    })
    ensureState.__aimarketingEnsureCustomAgentTablesPromise__ = ensureTablesPromise
  }

  await ensureTablesPromise
}

function normalizeText(value: string | null | undefined, maxLength: number, fallback = "") {
  if (typeof value !== "string") return fallback
  const normalized = value.trim()
  return normalized ? normalized.slice(0, maxLength) : fallback
}

function normalizeOptionalText(value: string | null | undefined, maxLength: number) {
  const normalized = normalizeText(value, maxLength)
  return normalized || null
}

function normalizeSlug(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return (normalized || "custom-agent").slice(0, 128)
}

function normalizeVisibility(value: unknown): CustomAgentVisibility {
  return value === "shared" ? "shared" : "private"
}

function normalizeStatus(value: unknown): CustomAgentStatus {
  if (value === "published" || value === "disabled" || value === "archived") return value
  return "draft"
}

function normalizeOutputType(value: unknown) {
  return normalizeText(typeof value === "string" ? value : "text", 32, "text")
}

function normalizeArtifactKinds(value: unknown) {
  if (!Array.isArray(value)) return [] as string[]
  return [...new Set(value.map((item) => normalizeText(typeof item === "string" ? item : "", 64)).filter(Boolean))].slice(0, 24)
}

function normalizeKnowledgeBindings(value: unknown) {
  if (!Array.isArray(value)) return [] as number[]
  return [...new Set(value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0))].slice(0, 32)
}

function normalizeObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function readEnterpriseKnowledgeDatasetIds(value: unknown) {
  const record = normalizeObject(value)
  return normalizeKnowledgeBindings(record?.enterpriseDatasetIds)
}

function withEnterpriseKnowledgeDatasetIds(
  value: Record<string, unknown> | null,
  enterpriseDatasetIds: number[],
) {
  if (!value && enterpriseDatasetIds.length === 0) return null
  return {
    ...(value ?? {}),
    enterpriseDatasetIds,
  } satisfies Record<string, unknown>
}

function normalizeBusinessBindings(value: CustomAgentBusinessBindingInput[]) {
  const seen = new Set<string>()
  return value
    .map((binding, index) => {
      const businessSlug = normalizeText(binding.businessSlug, 64)
      if (!businessSlug || seen.has(businessSlug)) return null
      seen.add(businessSlug)
      const displayPriority =
        typeof binding.displayPriority === "number" && Number.isFinite(binding.displayPriority)
          ? Math.max(0, Math.trunc(binding.displayPriority))
          : index * 10
      return {
        businessSlug,
        displayPriority,
        enabled: binding.enabled !== false,
      }
    })
    .filter((binding): binding is { businessSlug: string; displayPriority: number; enabled: boolean } => Boolean(binding))
}

function normalizeRetrievalMode(value: unknown): CustomAgentRetrievalMode | null {
  if (value === "semantic" || value === "keyword" || value === "hybrid") return value
  return null
}

function normalizeWorkflowBindings(value: CustomAgentWorkflowBindingInput[]) {
  const seen = new Set<number>()
  return value
    .map((binding) => {
      const workflowId = Number(binding.workflowId)
      if (!Number.isInteger(workflowId) || workflowId <= 0 || seen.has(workflowId)) return null
      seen.add(workflowId)
      return {
        workflowId,
        nodeRole: normalizeText(binding.nodeRole, 64, "agent"),
        inputSchema: normalizeObject(binding.inputSchema),
        outputSchema: normalizeObject(binding.outputSchema),
        knowledgeSourceIds: normalizeKnowledgeBindings(binding.knowledgeSourceIds),
        retrievalMode: normalizeRetrievalMode(binding.retrievalMode),
        enabled: binding.enabled !== false,
      }
    })
    .filter(
      (
        binding,
      ): binding is {
        workflowId: number
        nodeRole: string
        inputSchema: Record<string, unknown> | null
        outputSchema: Record<string, unknown> | null
        knowledgeSourceIds: number[]
        retrievalMode: CustomAgentRetrievalMode | null
        enabled: boolean
      } => Boolean(binding),
    )
}

function isEnterpriseAdmin(user: { enterpriseRole?: string | null; enterpriseStatus?: string | null } | null | undefined) {
  return user?.enterpriseRole === "admin" && user.enterpriseStatus === "active"
}

function canEditAgentRecord(actor: { id: number; isEnterpriseAdmin: boolean }, ownerUserId: number) {
  return actor.isEnterpriseAdmin || actor.id === ownerUserId
}

function inferProjectedAgentCardStatus(status: CustomAgentStatus) {
  if (status === "published") return "live" as const
  if (status === "disabled") return "beta" as const
  return "planned" as const
}

async function syncCustomAgentCardProjection(agent: CustomAgentView) {
  const projection = buildCustomAgentProjectionConfig({
    metadata: agent.metadata,
    linkedWorkflowSlug: agent.linkedWorkflowSlug,
  })

  if (agent.status === "draft" || agent.status === "archived" || !projection.menuExposure) {
    await deleteEnterpriseAgentCardBySlug({
      enterpriseId: agent.enterpriseId,
      slug: agent.slug,
    })
    return
  }

  await upsertEnterpriseAgentCardBySlug({
    enterpriseId: agent.enterpriseId,
    slug: agent.slug,
    title: agent.name,
    summary: agent.summary,
    focus: agent.goal || agent.scope || agent.systemPromptSummary || agent.summary,
    status: inferProjectedAgentCardStatus(agent.status),
    publicVisible: projection.publicVisible,
    workspaceVisible: projection.workspaceVisible,
    bindingTarget: projection.bindingTarget,
    bindingMode: projection.bindingMode,
    notes: agent.systemPromptSummary || agent.guardrails || "",
  })
}

async function buildUniqueAgentSlug(enterpriseId: number, name: string, excludeAgentId?: number) {
  const baseSlug = normalizeSlug(name)
  for (let counter = 0; counter < 200; counter += 1) {
    const candidate = counter === 0 ? baseSlug : `${baseSlug}-${counter + 1}`.slice(0, 128)
    const rows = await withCustomAgentDbRetry("custom-agent.slug-check", () =>
      db
        .select({ id: enterprisePlatformCustomAgents.id })
        .from(enterprisePlatformCustomAgents)
        .where(
          excludeAgentId
            ? and(
                eq(enterprisePlatformCustomAgents.enterpriseId, enterpriseId),
                eq(enterprisePlatformCustomAgents.slug, candidate),
                ne(enterprisePlatformCustomAgents.id, excludeAgentId),
              )
            : and(
                eq(enterprisePlatformCustomAgents.enterpriseId, enterpriseId),
                eq(enterprisePlatformCustomAgents.slug, candidate),
              ),
        )
        .limit(1),
    )
    if (rows.length === 0) return candidate
  }
  throw new Error("custom_agent_slug_generation_failed")
}

async function assertWorkflowBelongsToEnterprise(workflowId: number | null | undefined, enterpriseId: number) {
  if (!workflowId) return null
  const rows = await withCustomAgentDbRetry("custom-agent.workflow.lookup", () =>
    db
      .select({
        id: platformWorkflows.id,
        title: platformWorkflows.title,
        slug: platformWorkflows.slug,
        status: platformWorkflows.status,
      })
      .from(platformWorkflows)
      .where(and(eq(platformWorkflows.id, workflowId), eq(platformWorkflows.enterpriseId, enterpriseId)))
      .limit(1),
  )
  const workflow = rows[0]
  if (!workflow) throw new Error("workflow_definition_not_found")
  return workflow
}

async function assertKnowledgeDatasetsBelongToUserScope(params: {
  knowledgeBindings: number[]
  userId: number
  enterpriseId: number
}) {
  if (params.knowledgeBindings.length === 0) return
  const rows = await withCustomAgentDbRetry("custom-agent.knowledge-bindings.lookup", () =>
    db
      .select({
        id: userKnowledgeDatasets.id,
      })
      .from(userKnowledgeDatasets)
      .where(
        and(
          eq(userKnowledgeDatasets.userId, params.userId),
          inArray(userKnowledgeDatasets.id, params.knowledgeBindings),
        ),
      ),
  )
  const foundIds = new Set(rows.map((row) => row.id))
  if (params.knowledgeBindings.some((id) => !foundIds.has(id))) {
    throw new Error("invalid_personal_knowledge_binding")
  }
}

async function assertEnterpriseKnowledgeDatasetsBelongToEnterprise(params: {
  enterpriseKnowledgeDatasetIds: number[]
  enterpriseId: number
}) {
  if (params.enterpriseKnowledgeDatasetIds.length === 0) return
  const rows = await withCustomAgentDbRetry("custom-agent.enterprise-knowledge-bindings.lookup", () =>
    db
      .select({
        id: enterpriseKnowledgeDatasets.id,
      })
      .from(enterpriseKnowledgeDatasets)
      .where(
        and(
          eq(enterpriseKnowledgeDatasets.enterpriseId, params.enterpriseId),
          inArray(enterpriseKnowledgeDatasets.id, params.enterpriseKnowledgeDatasetIds),
        ),
      ),
  )
  const foundIds = new Set(rows.map((row) => row.id))
  if (params.enterpriseKnowledgeDatasetIds.some((id) => !foundIds.has(id))) {
    throw new Error("invalid_enterprise_knowledge_binding")
  }
}

async function loadAgentRow(agentId: number, enterpriseId: number) {
  const rows = await withCustomAgentDbRetry("custom-agent.select-one", () =>
    db
      .select({
        id: enterprisePlatformCustomAgents.id,
        enterpriseId: enterprisePlatformCustomAgents.enterpriseId,
        ownerUserId: enterprisePlatformCustomAgents.ownerUserId,
        sourceAgentId: enterprisePlatformCustomAgents.sourceAgentId,
        linkedWorkflowId: enterprisePlatformCustomAgents.linkedWorkflowId,
        name: enterprisePlatformCustomAgents.name,
        slug: enterprisePlatformCustomAgents.slug,
        category: enterprisePlatformCustomAgents.category,
        summary: enterprisePlatformCustomAgents.summary,
        systemPrompt: enterprisePlatformCustomAgents.systemPrompt,
        systemPromptSummary: enterprisePlatformCustomAgents.systemPromptSummary,
        goal: enterprisePlatformCustomAgents.goal,
        scope: enterprisePlatformCustomAgents.scope,
        guardrails: enterprisePlatformCustomAgents.guardrails,
        defaultOutputType: enterprisePlatformCustomAgents.defaultOutputType,
        runtimeModelOptions: enterprisePlatformCustomAgents.runtimeModelOptions,
        knowledgeBindings: enterprisePlatformCustomAgents.knowledgeBindings,
        knowledgeRetrievalPolicy: enterprisePlatformCustomAgents.knowledgeRetrievalPolicy,
        toolBindings: enterprisePlatformCustomAgents.toolBindings,
        skillBindings: enterprisePlatformCustomAgents.skillBindings,
        mcpBindings: enterprisePlatformCustomAgents.mcpBindings,
        artifactKinds: enterprisePlatformCustomAgents.artifactKinds,
        visibility: enterprisePlatformCustomAgents.visibility,
        status: enterprisePlatformCustomAgents.status,
        metadata: enterprisePlatformCustomAgents.metadata,
        publishedAt: enterprisePlatformCustomAgents.publishedAt,
        archivedAt: enterprisePlatformCustomAgents.archivedAt,
        createdAt: enterprisePlatformCustomAgents.createdAt,
        updatedAt: enterprisePlatformCustomAgents.updatedAt,
      })
      .from(enterprisePlatformCustomAgents)
      .where(and(eq(enterprisePlatformCustomAgents.id, agentId), eq(enterprisePlatformCustomAgents.enterpriseId, enterpriseId)))
      .limit(1),
  )
  return rows[0] ?? null
}

async function hydrateCustomAgents(
  rows: Array<Awaited<ReturnType<typeof loadAgentRow>> extends infer T ? Exclude<T, null> : never>,
  viewer: { userId: number; isEnterpriseAdmin: boolean },
) {
  const agentIds = rows.map((row) => row.id)
  const linkedWorkflowIds = [
    ...new Set(
      rows
        .map((row) => row.linkedWorkflowId)
        .filter((id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0),
    ),
  ]
  const knowledgeIds = [...new Set(rows.flatMap((row) => normalizeKnowledgeBindings(row.knowledgeBindings)))]
  const enterpriseKnowledgeIds = [
    ...new Set(rows.flatMap((row) => readEnterpriseKnowledgeDatasetIds(row.knowledgeRetrievalPolicy))),
  ]

  const [businessBindings, workflowBindings, linkedWorkflows, knowledgeRows, enterpriseKnowledgeRows] = await Promise.all([
    agentIds.length === 0
      ? Promise.resolve([] as Array<typeof enterprisePlatformCustomAgentBusinessBindings.$inferSelect>)
      : withCustomAgentDbRetry("custom-agent.business-bindings", () =>
          db
            .select()
            .from(enterprisePlatformCustomAgentBusinessBindings)
            .where(inArray(enterprisePlatformCustomAgentBusinessBindings.agentId, agentIds))
            .orderBy(
              asc(enterprisePlatformCustomAgentBusinessBindings.displayPriority),
              asc(enterprisePlatformCustomAgentBusinessBindings.id),
            ),
        ),
    agentIds.length === 0
      ? Promise.resolve([] as Array<{ id: number; agentId: number; workflowId: number; nodeRole: string; inputSchema: Record<string, unknown> | null; outputSchema: Record<string, unknown> | null; knowledgeSourceIds: number[] | null; retrievalMode: string | null; enabled: boolean; workflowTitle: string | null; workflowSlug: string | null }>)
      : withCustomAgentDbRetry("custom-agent.workflow-bindings", () =>
          db
            .select({
              id: enterprisePlatformCustomAgentWorkflowBindings.id,
              agentId: enterprisePlatformCustomAgentWorkflowBindings.agentId,
              workflowId: enterprisePlatformCustomAgentWorkflowBindings.workflowId,
              nodeRole: enterprisePlatformCustomAgentWorkflowBindings.nodeRole,
              inputSchema: enterprisePlatformCustomAgentWorkflowBindings.inputSchema,
              outputSchema: enterprisePlatformCustomAgentWorkflowBindings.outputSchema,
              knowledgeSourceIds: enterprisePlatformCustomAgentWorkflowBindings.knowledgeSourceIds,
              retrievalMode: enterprisePlatformCustomAgentWorkflowBindings.retrievalMode,
              enabled: enterprisePlatformCustomAgentWorkflowBindings.enabled,
              workflowTitle: platformWorkflows.title,
              workflowSlug: platformWorkflows.slug,
            })
            .from(enterprisePlatformCustomAgentWorkflowBindings)
            .leftJoin(platformWorkflows, eq(enterprisePlatformCustomAgentWorkflowBindings.workflowId, platformWorkflows.id))
            .where(inArray(enterprisePlatformCustomAgentWorkflowBindings.agentId, agentIds))
            .orderBy(
              asc(enterprisePlatformCustomAgentWorkflowBindings.agentId),
              asc(enterprisePlatformCustomAgentWorkflowBindings.workflowId),
            ),
        ),
    linkedWorkflowIds.length === 0
      ? Promise.resolve([] as Array<{ id: number; title: string; slug: string }>)
      : withCustomAgentDbRetry("custom-agent.linked-workflows", () =>
          db
            .select({
              id: platformWorkflows.id,
              title: platformWorkflows.title,
              slug: platformWorkflows.slug,
            })
            .from(platformWorkflows)
            .where(inArray(platformWorkflows.id, linkedWorkflowIds)),
        ),
    knowledgeIds.length === 0
      ? Promise.resolve([] as Array<{ id: number; name: string }>)
      : withCustomAgentDbRetry("custom-agent.knowledge-datasets", () =>
          db
            .select({
              id: userKnowledgeDatasets.id,
              name: userKnowledgeDatasets.name,
            })
            .from(userKnowledgeDatasets)
            .where(inArray(userKnowledgeDatasets.id, knowledgeIds)),
        ),
    enterpriseKnowledgeIds.length === 0
      ? Promise.resolve([] as Array<{ id: number; name: string; category: string }>)
      : withCustomAgentDbRetry("custom-agent.enterprise-knowledge-datasets", () =>
          db
            .select({
              id: enterpriseKnowledgeDatasets.id,
              name: enterpriseKnowledgeDatasets.name,
              category: enterpriseKnowledgeDatasets.category,
            })
            .from(enterpriseKnowledgeDatasets)
            .where(inArray(enterpriseKnowledgeDatasets.id, enterpriseKnowledgeIds)),
        ),
  ])

  const businessBindingsByAgentId = new Map<number, CustomAgentBusinessBinding[]>()
  for (const binding of businessBindings) {
    const bucket = businessBindingsByAgentId.get(binding.agentId) || []
    bucket.push({
      id: binding.id,
      businessSlug: binding.businessSlug,
      displayPriority: binding.displayPriority,
      enabled: Boolean(binding.enabled),
    })
    businessBindingsByAgentId.set(binding.agentId, bucket)
  }

  const workflowBindingsByAgentId = new Map<number, CustomAgentWorkflowBinding[]>()
  for (const binding of workflowBindings) {
    const bucket = workflowBindingsByAgentId.get(binding.agentId) || []
    bucket.push({
      id: binding.id,
      workflowId: binding.workflowId,
      workflowTitle: binding.workflowTitle ?? null,
      workflowSlug: binding.workflowSlug ?? null,
      nodeRole: binding.nodeRole,
      inputSchema: binding.inputSchema ?? null,
      outputSchema: binding.outputSchema ?? null,
      knowledgeSourceIds: normalizeKnowledgeBindings(binding.knowledgeSourceIds),
      retrievalMode: normalizeRetrievalMode(binding.retrievalMode),
      enabled: Boolean(binding.enabled),
    })
    workflowBindingsByAgentId.set(binding.agentId, bucket)
  }

  const linkedWorkflowById = new Map(linkedWorkflows.map((workflow) => [workflow.id, workflow] as const))
  const knowledgeById = new Map(knowledgeRows.map((row) => [row.id, row.name] as const))
  const enterpriseKnowledgeById = new Map(
    enterpriseKnowledgeRows.map((row) => [row.id, { name: row.name, category: row.category }] as const),
  )

  return rows.map<CustomAgentView>((row) => {
    const linkedWorkflow = row.linkedWorkflowId ? linkedWorkflowById.get(row.linkedWorkflowId) : null
    const knowledgeBindings = normalizeKnowledgeBindings(row.knowledgeBindings)
    const enterpriseKnowledgeDatasetIds = readEnterpriseKnowledgeDatasetIds(row.knowledgeRetrievalPolicy)
    return {
      id: row.id,
      enterpriseId: row.enterpriseId,
      ownerUserId: row.ownerUserId,
      sourceAgentId: row.sourceAgentId ?? null,
      linkedWorkflowId: row.linkedWorkflowId ?? null,
      linkedWorkflowTitle: linkedWorkflow?.title ?? null,
      linkedWorkflowSlug: linkedWorkflow?.slug ?? null,
      name: row.name,
      slug: row.slug,
      category: "custom",
      summary: row.summary,
      systemPrompt: row.systemPrompt,
      systemPromptSummary: row.systemPromptSummary ?? null,
      goal: row.goal ?? null,
      scope: row.scope ?? null,
      guardrails: row.guardrails ?? null,
      defaultOutputType: row.defaultOutputType,
      runtimeModelOptions: row.runtimeModelOptions ?? null,
      knowledgeBindings,
      knowledgeBindingDetails: knowledgeBindings
        .map((id) => {
          const name = knowledgeById.get(id)
          return name ? { id, name } : null
        })
        .filter((item): item is { id: number; name: string } => Boolean(item)),
      enterpriseKnowledgeDatasetIds,
      enterpriseKnowledgeBindingDetails: enterpriseKnowledgeDatasetIds
        .map((id) => {
          const detail = enterpriseKnowledgeById.get(id)
          return detail ? { id, name: detail.name, category: detail.category } : null
        })
        .filter((item): item is { id: number; name: string; category: string } => Boolean(item)),
      knowledgeRetrievalPolicy: row.knowledgeRetrievalPolicy ?? null,
      toolBindings: row.toolBindings ?? null,
      skillBindings: row.skillBindings ?? null,
      mcpBindings: row.mcpBindings ?? null,
      artifactKinds: normalizeArtifactKinds(row.artifactKinds),
      visibility: normalizeVisibility(row.visibility),
      status: normalizeStatus(row.status),
      metadata: row.metadata ?? null,
      publishedAt: row.publishedAt ?? null,
      archivedAt: row.archivedAt ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      executionMode: row.linkedWorkflowId ? "workflow_backed" : "direct_agent",
      businessBindings: businessBindingsByAgentId.get(row.id) || [],
      workflowBindings: workflowBindingsByAgentId.get(row.id) || [],
      canEdit: canEditAgentRecord({ id: viewer.userId, isEnterpriseAdmin: viewer.isEnterpriseAdmin }, row.ownerUserId),
      canManageLifecycle: canEditAgentRecord(
        { id: viewer.userId, isEnterpriseAdmin: viewer.isEnterpriseAdmin },
        row.ownerUserId,
      ),
    }
  })
}

async function requireEditableAgent(params: {
  agentId: number
  enterpriseId: number
  actorUserId: number
  isEnterpriseAdmin: boolean
}) {
  const row = await loadAgentRow(params.agentId, params.enterpriseId)
  if (!row) throw new Error("custom_agent_not_found")
  if (!canEditAgentRecord({ id: params.actorUserId, isEnterpriseAdmin: params.isEnterpriseAdmin }, row.ownerUserId)) {
    throw new Error("forbidden")
  }
  return row
}

export async function listCustomAgentsForUser(params: {
  enterpriseId: number
  userId: number
  isEnterpriseAdmin: boolean
}) {
  await ensureCustomAgentTables()

  const rows = await withCustomAgentDbRetry("custom-agent.list", () =>
    db
      .select({
        id: enterprisePlatformCustomAgents.id,
        enterpriseId: enterprisePlatformCustomAgents.enterpriseId,
        ownerUserId: enterprisePlatformCustomAgents.ownerUserId,
        sourceAgentId: enterprisePlatformCustomAgents.sourceAgentId,
        linkedWorkflowId: enterprisePlatformCustomAgents.linkedWorkflowId,
        name: enterprisePlatformCustomAgents.name,
        slug: enterprisePlatformCustomAgents.slug,
        category: enterprisePlatformCustomAgents.category,
        summary: enterprisePlatformCustomAgents.summary,
        systemPrompt: enterprisePlatformCustomAgents.systemPrompt,
        systemPromptSummary: enterprisePlatformCustomAgents.systemPromptSummary,
        goal: enterprisePlatformCustomAgents.goal,
        scope: enterprisePlatformCustomAgents.scope,
        guardrails: enterprisePlatformCustomAgents.guardrails,
        defaultOutputType: enterprisePlatformCustomAgents.defaultOutputType,
        runtimeModelOptions: enterprisePlatformCustomAgents.runtimeModelOptions,
        knowledgeBindings: enterprisePlatformCustomAgents.knowledgeBindings,
        knowledgeRetrievalPolicy: enterprisePlatformCustomAgents.knowledgeRetrievalPolicy,
        toolBindings: enterprisePlatformCustomAgents.toolBindings,
        skillBindings: enterprisePlatformCustomAgents.skillBindings,
        mcpBindings: enterprisePlatformCustomAgents.mcpBindings,
        artifactKinds: enterprisePlatformCustomAgents.artifactKinds,
        visibility: enterprisePlatformCustomAgents.visibility,
        status: enterprisePlatformCustomAgents.status,
        metadata: enterprisePlatformCustomAgents.metadata,
        publishedAt: enterprisePlatformCustomAgents.publishedAt,
        archivedAt: enterprisePlatformCustomAgents.archivedAt,
        createdAt: enterprisePlatformCustomAgents.createdAt,
        updatedAt: enterprisePlatformCustomAgents.updatedAt,
      })
      .from(enterprisePlatformCustomAgents)
      .where(
        and(
          eq(enterprisePlatformCustomAgents.enterpriseId, params.enterpriseId),
          params.isEnterpriseAdmin
            ? undefined
            : or(
                eq(enterprisePlatformCustomAgents.ownerUserId, params.userId),
                and(
                  eq(enterprisePlatformCustomAgents.visibility, "shared"),
                  eq(enterprisePlatformCustomAgents.status, "published"),
                ),
              ),
        ),
      )
      .orderBy(desc(enterprisePlatformCustomAgents.updatedAt), desc(enterprisePlatformCustomAgents.id)),
  )

  return hydrateCustomAgents(rows, {
    userId: params.userId,
    isEnterpriseAdmin: params.isEnterpriseAdmin,
  })
}

export async function getCustomAgentForUser(params: {
  agentId: number
  enterpriseId: number
  userId: number
  isEnterpriseAdmin: boolean
}) {
  await ensureCustomAgentTables()
  const row = await loadAgentRow(params.agentId, params.enterpriseId)
  if (!row) return null
  const canAccess =
    params.isEnterpriseAdmin ||
    row.ownerUserId === params.userId ||
    (row.visibility === "shared" && row.status === "published")
  if (!canAccess) return null
  const [agent] = await hydrateCustomAgents([row], {
    userId: params.userId,
    isEnterpriseAdmin: params.isEnterpriseAdmin,
  })
  return agent ?? null
}

export async function createCustomAgent(input: CreateCustomAgentInput) {
  await ensureCustomAgentTables()

  const name = normalizeText(input.name, 160)
  if (!name) throw new Error("custom_agent_name_required")
  const linkedWorkflow = await assertWorkflowBelongsToEnterprise(input.linkedWorkflowId ?? null, input.enterpriseId)
  const knowledgeBindings = normalizeKnowledgeBindings(input.knowledgeBindings)
  const normalizedKnowledgeRetrievalPolicy = normalizeObject(input.knowledgeRetrievalPolicy)
  const enterpriseKnowledgeDatasetIds = readEnterpriseKnowledgeDatasetIds(normalizedKnowledgeRetrievalPolicy)
  await assertKnowledgeDatasetsBelongToUserScope({
    knowledgeBindings,
    userId: input.ownerUserId,
    enterpriseId: input.enterpriseId,
  })
  await assertEnterpriseKnowledgeDatasetsBelongToEnterprise({
    enterpriseKnowledgeDatasetIds,
    enterpriseId: input.enterpriseId,
  })

  const slug = await buildUniqueAgentSlug(input.enterpriseId, name)
  const now = new Date()

  const [created] = await withCustomAgentDbRetry("custom-agent.create", () =>
    db
      .insert(enterprisePlatformCustomAgents)
      .values({
        enterpriseId: input.enterpriseId,
        ownerUserId: input.ownerUserId,
        sourceAgentId: normalizeOptionalText(input.sourceAgentId, 128),
        linkedWorkflowId: linkedWorkflow?.id ?? null,
        name,
        slug,
        category: "custom",
        summary: normalizeText(input.summary, 5000),
        systemPrompt: normalizeText(input.systemPrompt, 20_000),
        systemPromptSummary: normalizeOptionalText(input.systemPromptSummary, 5000),
        goal: normalizeOptionalText(input.goal, 5000),
        scope: normalizeOptionalText(input.scope, 5000),
        guardrails: normalizeOptionalText(input.guardrails, 5000),
        defaultOutputType: normalizeOutputType(input.defaultOutputType),
        runtimeModelOptions: normalizeObject(input.runtimeModelOptions),
        knowledgeBindings,
        knowledgeRetrievalPolicy: withEnterpriseKnowledgeDatasetIds(
          normalizedKnowledgeRetrievalPolicy,
          enterpriseKnowledgeDatasetIds,
        ),
        toolBindings: normalizeObject(input.toolBindings),
        skillBindings: normalizeObject(input.skillBindings),
        mcpBindings: normalizeObject(input.mcpBindings),
        artifactKinds: normalizeArtifactKinds(input.artifactKinds),
        visibility: normalizeVisibility(input.visibility),
        status: normalizeStatus(input.status),
        metadata: normalizeObject(input.metadata),
        publishedAt: normalizeStatus(input.status) === "published" ? now : null,
        archivedAt: normalizeStatus(input.status) === "archived" ? now : null,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: enterprisePlatformCustomAgents.id }),
  )

  if (linkedWorkflow?.id) {
    await setCustomAgentWorkflowBindings({
      agentId: created.id,
      enterpriseId: input.enterpriseId,
      actorUserId: input.ownerUserId,
      isEnterpriseAdmin: false,
      bindings: [
        {
          workflowId: linkedWorkflow.id,
          nodeRole: "primary_workflow",
          enabled: true,
        },
      ],
    })
  }

  const detail = await getCustomAgentForUser({
    agentId: created.id,
    enterpriseId: input.enterpriseId,
    userId: input.ownerUserId,
    isEnterpriseAdmin: true,
  })
  if (!detail) throw new Error("custom_agent_not_found_after_create")
  await syncCustomAgentCardProjection(detail)
  return detail
}

export async function updateCustomAgent(input: UpdateCustomAgentInput) {
  await ensureCustomAgentTables()
  const existing = await requireEditableAgent(input)

  const name = normalizeText(input.name ?? existing.name, 160, existing.name)
  const status = normalizeStatus(existing.status)
  const linkedWorkflow = await assertWorkflowBelongsToEnterprise(
    input.linkedWorkflowId === undefined ? existing.linkedWorkflowId : input.linkedWorkflowId,
    input.enterpriseId,
  )
  const normalizedKnowledgeRetrievalPolicy =
    input.knowledgeRetrievalPolicy === undefined
      ? normalizeObject(existing.knowledgeRetrievalPolicy)
      : normalizeObject(input.knowledgeRetrievalPolicy)
  const knowledgeBindings =
    input.knowledgeBindings === undefined
      ? normalizeKnowledgeBindings(existing.knowledgeBindings)
      : normalizeKnowledgeBindings(input.knowledgeBindings)
  const enterpriseKnowledgeDatasetIds = readEnterpriseKnowledgeDatasetIds(normalizedKnowledgeRetrievalPolicy)
  await assertKnowledgeDatasetsBelongToUserScope({
    knowledgeBindings,
    userId: existing.ownerUserId,
    enterpriseId: input.enterpriseId,
  })
  await assertEnterpriseKnowledgeDatasetsBelongToEnterprise({
    enterpriseKnowledgeDatasetIds,
    enterpriseId: input.enterpriseId,
  })

  const slug = name === existing.name ? existing.slug : await buildUniqueAgentSlug(input.enterpriseId, name, existing.id)
  const now = new Date()

  await withCustomAgentDbRetry("custom-agent.update", () =>
    db
      .update(enterprisePlatformCustomAgents)
      .set({
        linkedWorkflowId: linkedWorkflow?.id ?? null,
        name,
        slug,
        summary:
          input.summary === undefined ? existing.summary : normalizeText(input.summary, 5000),
        systemPrompt:
          input.systemPrompt === undefined ? existing.systemPrompt : normalizeText(input.systemPrompt, 20_000),
        systemPromptSummary:
          input.systemPromptSummary === undefined
            ? existing.systemPromptSummary
            : normalizeOptionalText(input.systemPromptSummary, 5000),
        goal: input.goal === undefined ? existing.goal : normalizeOptionalText(input.goal, 5000),
        scope: input.scope === undefined ? existing.scope : normalizeOptionalText(input.scope, 5000),
        guardrails:
          input.guardrails === undefined ? existing.guardrails : normalizeOptionalText(input.guardrails, 5000),
        defaultOutputType:
          input.defaultOutputType === undefined
            ? existing.defaultOutputType
            : normalizeOutputType(input.defaultOutputType),
        runtimeModelOptions:
          input.runtimeModelOptions === undefined
            ? existing.runtimeModelOptions
            : normalizeObject(input.runtimeModelOptions),
        knowledgeBindings,
        knowledgeRetrievalPolicy:
          input.knowledgeRetrievalPolicy === undefined
            ? existing.knowledgeRetrievalPolicy
            : withEnterpriseKnowledgeDatasetIds(normalizedKnowledgeRetrievalPolicy, enterpriseKnowledgeDatasetIds),
        toolBindings: input.toolBindings === undefined ? existing.toolBindings : normalizeObject(input.toolBindings),
        skillBindings: input.skillBindings === undefined ? existing.skillBindings : normalizeObject(input.skillBindings),
        mcpBindings: input.mcpBindings === undefined ? existing.mcpBindings : normalizeObject(input.mcpBindings),
        artifactKinds:
          input.artifactKinds === undefined ? existing.artifactKinds : normalizeArtifactKinds(input.artifactKinds),
        visibility:
          input.visibility === undefined ? existing.visibility : normalizeVisibility(input.visibility),
        metadata: input.metadata === undefined ? existing.metadata : normalizeObject(input.metadata),
        updatedAt: now,
      })
      .where(eq(enterprisePlatformCustomAgents.id, existing.id)),
  )

  if (linkedWorkflow?.id) {
    const currentBindings = await listCustomAgentWorkflowBindingRows(existing.id)
    if (!currentBindings.some((binding) => binding.workflowId === linkedWorkflow.id)) {
      await setCustomAgentWorkflowBindings({
        agentId: existing.id,
        enterpriseId: input.enterpriseId,
        actorUserId: input.actorUserId,
        isEnterpriseAdmin: input.isEnterpriseAdmin,
        bindings: [
          ...currentBindings.map((binding) => ({
            workflowId: binding.workflowId,
            nodeRole: binding.nodeRole,
            inputSchema: binding.inputSchema ?? null,
            outputSchema: binding.outputSchema ?? null,
            knowledgeSourceIds: normalizeKnowledgeBindings(binding.knowledgeSourceIds),
            retrievalMode: normalizeRetrievalMode(binding.retrievalMode),
            enabled: Boolean(binding.enabled),
          })),
          {
            workflowId: linkedWorkflow.id,
            nodeRole: "primary_workflow",
            enabled: true,
          },
        ],
      })
    }
  }

  const detail = await getCustomAgentForUser({
    agentId: existing.id,
    enterpriseId: input.enterpriseId,
    userId: input.actorUserId,
    isEnterpriseAdmin: input.isEnterpriseAdmin,
  })
  if (!detail) throw new Error("custom_agent_not_found_after_update")
  await syncCustomAgentCardProjection(detail)
  if (status === "archived") return detail
  return detail
}

async function updateCustomAgentLifecycle(params: {
  agentId: number
  enterpriseId: number
  actorUserId: number
  isEnterpriseAdmin: boolean
  status: CustomAgentStatus
}) {
  await ensureCustomAgentTables()
  const existing = await requireEditableAgent(params)
  const now = new Date()
  await withCustomAgentDbRetry("custom-agent.lifecycle", () =>
    db
      .update(enterprisePlatformCustomAgents)
      .set({
        status: params.status,
        publishedAt:
          params.status === "published" ? existing.publishedAt ?? now : params.status === "draft" ? null : existing.publishedAt,
        archivedAt: params.status === "archived" ? now : null,
        updatedAt: now,
      })
      .where(eq(enterprisePlatformCustomAgents.id, existing.id)),
  )

  const detail = await getCustomAgentForUser({
    agentId: existing.id,
    enterpriseId: params.enterpriseId,
    userId: params.actorUserId,
    isEnterpriseAdmin: params.isEnterpriseAdmin,
  })
  if (!detail) throw new Error("custom_agent_not_found_after_lifecycle_update")
  await syncCustomAgentCardProjection(detail)
  return detail
}

export async function publishCustomAgent(params: {
  agentId: number
  enterpriseId: number
  actorUserId: number
  isEnterpriseAdmin: boolean
}) {
  return updateCustomAgentLifecycle({ ...params, status: "published" })
}

export async function disableCustomAgent(params: {
  agentId: number
  enterpriseId: number
  actorUserId: number
  isEnterpriseAdmin: boolean
}) {
  return updateCustomAgentLifecycle({ ...params, status: "disabled" })
}

export async function archiveCustomAgent(params: {
  agentId: number
  enterpriseId: number
  actorUserId: number
  isEnterpriseAdmin: boolean
}) {
  return updateCustomAgentLifecycle({ ...params, status: "archived" })
}

async function listCustomAgentWorkflowBindingRows(agentId: number) {
  return withCustomAgentDbRetry("custom-agent.workflow-bindings.list-rows", () =>
    db
      .select()
      .from(enterprisePlatformCustomAgentWorkflowBindings)
      .where(eq(enterprisePlatformCustomAgentWorkflowBindings.agentId, agentId))
      .orderBy(asc(enterprisePlatformCustomAgentWorkflowBindings.workflowId)),
  )
}

export async function setCustomAgentBusinessBindings(params: {
  agentId: number
  enterpriseId: number
  actorUserId: number
  isEnterpriseAdmin: boolean
  bindings: CustomAgentBusinessBindingInput[]
}) {
  await ensureCustomAgentTables()
  await requireEditableAgent(params)
  const bindings = normalizeBusinessBindings(params.bindings)
  const now = new Date()

  await db.transaction(async (tx) => {
    await tx
      .delete(enterprisePlatformCustomAgentBusinessBindings)
      .where(eq(enterprisePlatformCustomAgentBusinessBindings.agentId, params.agentId))
    if (bindings.length > 0) {
      await tx.insert(enterprisePlatformCustomAgentBusinessBindings).values(
        bindings.map((binding) => ({
          agentId: params.agentId,
          businessSlug: binding.businessSlug,
          displayPriority: binding.displayPriority,
          enabled: binding.enabled,
          createdAt: now,
          updatedAt: now,
        })),
      )
    }
  })

  const detail = await getCustomAgentForUser({
    agentId: params.agentId,
    enterpriseId: params.enterpriseId,
    userId: params.actorUserId,
    isEnterpriseAdmin: params.isEnterpriseAdmin,
  })
  if (!detail) throw new Error("custom_agent_not_found_after_business_binding_update")
  await syncCustomAgentCardProjection(detail)
  return detail
}

export async function setCustomAgentWorkflowBindings(params: {
  agentId: number
  enterpriseId: number
  actorUserId: number
  isEnterpriseAdmin: boolean
  bindings: CustomAgentWorkflowBindingInput[]
}) {
  await ensureCustomAgentTables()
  const agent = await requireEditableAgent(params)
  const bindings = normalizeWorkflowBindings(params.bindings)
  if (bindings.length > 0) {
    const workflowIds = bindings.map((binding) => binding.workflowId)
    const rows = await withCustomAgentDbRetry("custom-agent.workflow-bindings.validate-workflows", () =>
      db
        .select({ id: platformWorkflows.id })
        .from(platformWorkflows)
        .where(and(eq(platformWorkflows.enterpriseId, params.enterpriseId), inArray(platformWorkflows.id, workflowIds))),
    )
    const validIds = new Set(rows.map((row) => row.id))
    if (workflowIds.some((id) => !validIds.has(id))) {
      throw new Error("workflow_definition_not_found")
    }
  }

  const now = new Date()
  await db.transaction(async (tx) => {
    await tx
      .delete(enterprisePlatformCustomAgentWorkflowBindings)
      .where(eq(enterprisePlatformCustomAgentWorkflowBindings.agentId, params.agentId))
    if (bindings.length > 0) {
      await tx.insert(enterprisePlatformCustomAgentWorkflowBindings).values(
        bindings.map((binding) => ({
          agentId: params.agentId,
          workflowId: binding.workflowId,
          nodeRole: binding.nodeRole,
          inputSchema: binding.inputSchema,
          outputSchema: binding.outputSchema,
          knowledgeSourceIds: binding.knowledgeSourceIds,
          retrievalMode: binding.retrievalMode,
          enabled: binding.enabled,
          createdAt: now,
          updatedAt: now,
        })),
      )
    }

    const nextLinkedWorkflowId =
      agent.linkedWorkflowId && bindings.some((binding) => binding.workflowId === agent.linkedWorkflowId)
        ? agent.linkedWorkflowId
        : bindings[0]?.workflowId ?? null

    await tx
      .update(enterprisePlatformCustomAgents)
      .set({
        linkedWorkflowId: nextLinkedWorkflowId,
        updatedAt: now,
      })
      .where(eq(enterprisePlatformCustomAgents.id, params.agentId))
  })

  const detail = await getCustomAgentForUser({
    agentId: params.agentId,
    enterpriseId: params.enterpriseId,
    userId: params.actorUserId,
    isEnterpriseAdmin: params.isEnterpriseAdmin,
  })
  if (!detail) throw new Error("custom_agent_not_found_after_workflow_binding_update")
  await syncCustomAgentCardProjection(detail)
  return detail
}

export async function duplicateCustomAgent(params: {
  agentId: number
  enterpriseId: number
  actorUserId: number
  isEnterpriseAdmin: boolean
}) {
  await ensureCustomAgentTables()
  const source = await getCustomAgentForUser({
    agentId: params.agentId,
    enterpriseId: params.enterpriseId,
    userId: params.actorUserId,
    isEnterpriseAdmin: params.isEnterpriseAdmin,
  })
  if (!source) throw new Error("custom_agent_not_found")

  const duplicated = await createCustomAgent({
    enterpriseId: params.enterpriseId,
    ownerUserId: params.actorUserId,
    sourceAgentId: String(source.id),
    linkedWorkflowId: source.linkedWorkflowId,
    name: `${source.name} Copy`,
    summary: source.summary,
    systemPrompt: source.systemPrompt,
    systemPromptSummary: source.systemPromptSummary,
    goal: source.goal,
    scope: source.scope,
    guardrails: source.guardrails,
    defaultOutputType: source.defaultOutputType,
    runtimeModelOptions: source.runtimeModelOptions,
    knowledgeBindings: source.knowledgeBindings,
    knowledgeRetrievalPolicy: source.knowledgeRetrievalPolicy,
    toolBindings: source.toolBindings,
    skillBindings: source.skillBindings,
    mcpBindings: source.mcpBindings,
    artifactKinds: source.artifactKinds,
    visibility: "private",
    status: "draft",
    metadata: {
      ...(source.metadata || {}),
      source: "agent_duplicate",
      sourceAgentId: source.id,
    },
  })

  await setCustomAgentBusinessBindings({
    agentId: duplicated.id,
    enterpriseId: params.enterpriseId,
    actorUserId: params.actorUserId,
    isEnterpriseAdmin: params.isEnterpriseAdmin,
    bindings: source.businessBindings.map((binding) => ({
      businessSlug: binding.businessSlug,
      displayPriority: binding.displayPriority,
      enabled: binding.enabled,
    })),
  })

  await setCustomAgentWorkflowBindings({
    agentId: duplicated.id,
    enterpriseId: params.enterpriseId,
    actorUserId: params.actorUserId,
    isEnterpriseAdmin: params.isEnterpriseAdmin,
    bindings: source.workflowBindings.map((binding) => ({
      workflowId: binding.workflowId,
      nodeRole: binding.nodeRole,
      inputSchema: binding.inputSchema,
      outputSchema: binding.outputSchema,
      knowledgeSourceIds: binding.knowledgeSourceIds,
      retrievalMode: binding.retrievalMode,
      enabled: binding.enabled,
    })),
  })

  const detail = await getCustomAgentForUser({
    agentId: duplicated.id,
    enterpriseId: params.enterpriseId,
    userId: params.actorUserId,
    isEnterpriseAdmin: params.isEnterpriseAdmin,
  })
  if (!detail) throw new Error("custom_agent_not_found_after_duplicate")
  return detail
}

export async function publishWorkflowAsCustomAgent(params: {
  workflowId: number
  enterpriseId: number
  ownerUserId: number
  name: string
  summary?: string | null
  systemPrompt?: string | null
  visibility?: CustomAgentVisibility | null
}) {
  await ensureCustomAgentTables()
  const workflow = await assertWorkflowBelongsToEnterprise(params.workflowId, params.enterpriseId)
  if (!workflow) throw new Error("workflow_definition_not_found")

  const agent = await createCustomAgent({
    enterpriseId: params.enterpriseId,
    ownerUserId: params.ownerUserId,
    linkedWorkflowId: workflow.id,
    name: params.name,
    summary: params.summary ?? workflow.title,
    systemPrompt: params.systemPrompt ?? `Use workflow ${workflow.title} as the execution skeleton.`,
    visibility: params.visibility ?? "private",
    status: "draft",
    metadata: {
      source: "workflow_publish",
      linkedWorkflowId: workflow.id,
    },
  })

  return setCustomAgentWorkflowBindings({
    agentId: agent.id,
    enterpriseId: params.enterpriseId,
    actorUserId: params.ownerUserId,
    isEnterpriseAdmin: false,
    bindings: [
      {
        workflowId: workflow.id,
        nodeRole: "primary_workflow",
        enabled: true,
      },
    ],
  })
}

export async function disableCustomAgentsLinkedToWorkflow(params: { workflowId: number; enterpriseId: number }) {
  await ensureCustomAgentTables()
  const now = new Date()
  const linkedAgents = await withCustomAgentDbRetry("custom-agent.disable-linked-workflow.select", () =>
    db
      .select({
        id: enterprisePlatformCustomAgents.id,
        ownerUserId: enterprisePlatformCustomAgents.ownerUserId,
        metadata: enterprisePlatformCustomAgents.metadata,
      })
      .from(enterprisePlatformCustomAgents)
      .where(
        and(
          eq(enterprisePlatformCustomAgents.enterpriseId, params.enterpriseId),
          eq(enterprisePlatformCustomAgents.linkedWorkflowId, params.workflowId),
          ne(enterprisePlatformCustomAgents.status, "archived"),
        ),
      ),
  )

  for (const agent of linkedAgents) {
    await withCustomAgentDbRetry("custom-agent.disable-linked-workflow.update", () =>
      db
        .update(enterprisePlatformCustomAgents)
        .set({
          status: "disabled",
          updatedAt: now,
          metadata: {
            ...((agent.metadata && typeof agent.metadata === "object" && !Array.isArray(agent.metadata)
              ? agent.metadata
              : {}) as Record<string, unknown>),
            workflowArchived: true,
            workflowArchivedAt: now.toISOString(),
          },
        })
        .where(eq(enterprisePlatformCustomAgents.id, agent.id)),
    )

    const detail = await getCustomAgentForUser({
      agentId: agent.id,
      enterpriseId: params.enterpriseId,
      userId: agent.ownerUserId,
      isEnterpriseAdmin: false,
    })
    if (detail) {
      await syncCustomAgentCardProjection(detail)
    }
  }

  return linkedAgents.length
}

export function canManageCustomAgents(user: AuthUserPayload | null | undefined) {
  return Boolean(user?.enterpriseId)
}

export function isCustomAgentEditableByUser(user: AuthUserPayload | null | undefined, agent: { ownerUserId: number }) {
  if (!user) return false
  return isEnterpriseAdmin(user) || user.id === agent.ownerUserId
}
