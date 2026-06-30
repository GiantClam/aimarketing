import { canManagePlatformRegistry, type PlatformRegistryItemType } from "@/lib/platform/control-plane"
import { listPlatformRegistryAdminEntries } from "@/lib/platform/directory-resolver"
import { getPlatformRuntimeSnapshot, type PlatformRuntimeSnapshot } from "@/lib/platform/runtime"
import type { AppLocale } from "@/lib/i18n/config"
import { getBillingEntitlementForUser } from "@/lib/billing/entitlements"
import { getLatestBillingSubscription } from "@/lib/billing/subscription-store"
import { getWorkspaceBillingSnapshot } from "@/lib/billing/workspace"
import type { AuthUser } from "@/lib/auth/session"
import { summarizeRegistryCounts, type GovernanceRegistryEntryCounts } from "@/lib/platform/governance-utils"
import { listRecentWorkflowTaskRunsForEnterprise } from "@/lib/platform/task-run-store"
import { summarizePlatformWorkflowGovernance, type PlatformWorkflowGovernanceSummary } from "@/lib/platform/workflow-governance-summary"
import { listWorkflowDefinitionsForEnterprise, listWorkflowNodeExecutionStatuses } from "@/lib/workflows/store"

const GOVERNANCE_REGISTRY_ITEM_TYPES = [
  "capability",
  "agent",
  "plugin",
  "mcp_service",
  "workflow",
] as const satisfies readonly PlatformRegistryItemType[]

export type PlatformGovernanceRegistrySummary = {
  itemType: PlatformRegistryItemType
  counts: GovernanceRegistryEntryCounts
}

export type PlatformGovernanceBillingSummary = {
  availableCredits: number | null
  reservedCredits: number | null
  balanceCredits: number | null
  canSpendCredits: boolean | null
  planCode: string | null
  planName: string | null
  subscriptionStatus: string | null
  nextPlanCode: string | null
  seatLimit: number | null
  activeMemberCount: number | null
  seatsRemaining: number | null
  note: string | null
}

export type PlatformGovernanceSnapshot = {
  generatedAt: string
  canManageRegistry: boolean
  runtime: PlatformRuntimeSnapshot
  registry: PlatformGovernanceRegistrySummary[]
  billing: PlatformGovernanceBillingSummary
  workflows: PlatformWorkflowGovernanceSummary | null
}

function normalizeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "unknown_governance_error"
}

async function getPlatformGovernanceRegistry(
  locale: AppLocale,
  enterpriseId: number | null,
): Promise<PlatformGovernanceRegistrySummary[]> {
  const summaries = await Promise.all(
    GOVERNANCE_REGISTRY_ITEM_TYPES.map(async (itemType) => {
      const entries = await listPlatformRegistryAdminEntries({
        locale,
        itemType,
        enterpriseId,
      })

      return {
        itemType,
        counts: summarizeRegistryCounts(entries),
      }
    }),
  )

  return summaries
}

async function getSafePlatformGovernanceBilling(user: AuthUser): Promise<PlatformGovernanceBillingSummary> {
  try {
    const enterpriseId = user.enterpriseId
    const [entitlement, latestSubscription, workspaceSnapshot] = await Promise.all([
      getBillingEntitlementForUser(user),
      getLatestBillingSubscription(user),
      enterpriseId ? getWorkspaceBillingSnapshot(enterpriseId) : Promise.resolve(null),
    ])

    return {
      availableCredits: entitlement.creditAccount?.availableCredits ?? null,
      reservedCredits: entitlement.creditAccount?.reservedBalance ?? null,
      balanceCredits: entitlement.creditAccount?.balance ?? null,
      canSpendCredits: entitlement.canSpendCredits,
      planCode:
        workspaceSnapshot?.effectivePlan.code ||
        entitlement.plan?.code ||
        latestSubscription?.plan_code ||
        null,
      planName: workspaceSnapshot?.effectivePlan.name || entitlement.plan?.name || null,
      subscriptionStatus: entitlement.subscription?.status || latestSubscription?.status || null,
      nextPlanCode: entitlement.subscription?.nextPlanCode || latestSubscription?.next_plan_code || null,
      seatLimit: workspaceSnapshot?.seatLimit ?? null,
      activeMemberCount: workspaceSnapshot?.activeMemberCount ?? null,
      seatsRemaining: workspaceSnapshot?.seatsRemaining ?? null,
      note: null,
    }
  } catch (error) {
    return {
      availableCredits: null,
      reservedCredits: null,
      balanceCredits: null,
      canSpendCredits: null,
      planCode: null,
      planName: null,
      subscriptionStatus: null,
      nextPlanCode: null,
      seatLimit: null,
      activeMemberCount: null,
      seatsRemaining: null,
      note: normalizeErrorMessage(error),
    }
  }
}

async function getSafePlatformWorkflowGovernanceSummary(input: {
  locale: AppLocale
  currentUser: AuthUser
}): Promise<PlatformWorkflowGovernanceSummary | null> {
  const enterpriseId = input.currentUser.enterpriseId
  if (!enterpriseId) return null

  try {
    const [workflows, recentRuns] = await Promise.all([
      listWorkflowDefinitionsForEnterprise(enterpriseId),
      listRecentWorkflowTaskRunsForEnterprise(enterpriseId, 60),
    ])

    const nodeExecutionsByRunId = new Map(
      await Promise.all(
        recentRuns.map(async (run) => [
          run.id,
          await listWorkflowNodeExecutionStatuses(run.id),
        ] as const),
      ),
    )

    return summarizePlatformWorkflowGovernance({
      locale: input.locale === "zh" ? "zh" : "en",
      workflows,
      recentRuns,
      nodeExecutionsByRunId,
    })
  } catch {
    return null
  }
}

export async function getPlatformGovernanceSnapshot({
  locale,
  currentUser,
}: {
  locale: AppLocale
  currentUser: AuthUser
}): Promise<PlatformGovernanceSnapshot> {
  const [registry, billing, workflows] = await Promise.all([
    getPlatformGovernanceRegistry(locale, currentUser.enterpriseId ?? null),
    getSafePlatformGovernanceBilling(currentUser),
    getSafePlatformWorkflowGovernanceSummary({ locale, currentUser }),
  ])

  return {
    generatedAt: new Date().toISOString(),
    canManageRegistry: canManagePlatformRegistry(currentUser),
    runtime: getPlatformRuntimeSnapshot(),
    registry,
    billing,
    workflows,
  }
}
