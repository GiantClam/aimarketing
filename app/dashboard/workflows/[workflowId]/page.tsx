import { notFound } from "next/navigation"

import { WorkflowBuilderPage } from "@/components/workflows/workflow-builder-page"
import { hasFeatureAccessWithFallback } from "@/lib/auth/guards"
import { getAiEntryModelCatalog } from "@/lib/ai-entry/model-catalog"
import { getConfiguredAiEntryProviders } from "@/lib/ai-entry/provider-routing"
import { requireServerSessionUser } from "@/lib/auth/server-session"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import { listEnterpriseAssetLibraryCandidates } from "@/lib/platform/assets"
import { isMiniMaxAudioConfigured, listMiniMaxVoices } from "@/lib/platform/minimax-audio"
import { listPlatformTaskRunsForEnterprise } from "@/lib/platform/task-run-store"
import { serializePlatformWorkflowRun } from "@/lib/platform/workflow-runner"
import { getWorkflowDefinition, getWorkflowRunDetail } from "@/lib/workflows/store"

function getProviderLabel(providerId: string) {
  if (providerId === "pptoken") return "PPTOKEN"
  if (providerId === "openrouter") return "OpenRouter"
  if (providerId === "aiberm") return "Aiberm"
  return "CrazyRouter"
}

function resolveWorkflowIdFromRun(run: { inputPayload: Record<string, unknown> | null; normalizedResult: Record<string, unknown> | null }) {
  const inputWorkflowId =
    run.inputPayload && typeof run.inputPayload.workflowId === "number" ? run.inputPayload.workflowId : null
  if (inputWorkflowId && Number.isInteger(inputWorkflowId) && inputWorkflowId > 0) return inputWorkflowId

  const resultWorkflowId =
    run.normalizedResult && typeof run.normalizedResult.workflowId === "number" ? run.normalizedResult.workflowId : null
  if (resultWorkflowId && Number.isInteger(resultWorkflowId) && resultWorkflowId > 0) return resultWorkflowId

  return null
}

function serializeWorkflowRunDetail(
  detail: NonNullable<Awaited<ReturnType<typeof getWorkflowRunDetail>>>,
) {
  return {
    run: serializePlatformWorkflowRun(detail.run),
    workflow: {
      ...detail.workflow,
      createdAt: detail.workflow.createdAt.toISOString(),
      updatedAt: detail.workflow.updatedAt.toISOString(),
      edges: detail.workflow.edges.map((edge) => ({
        ...edge,
        inputName: edge.inputName ?? null,
      })),
    },
    nodeExecutions: detail.nodeExecutions.map((execution) => ({
      ...execution,
      startedAt: execution.startedAt ? execution.startedAt.toISOString() : null,
      finishedAt: execution.finishedAt ? execution.finishedAt.toISOString() : null,
      createdAt: execution.createdAt ? execution.createdAt.toISOString() : null,
      updatedAt: execution.updatedAt ? execution.updatedAt.toISOString() : null,
    })),
    detailPath: `/api/workflows/runs/${detail.run.id}`,
    statusPath: `/api/workflows/runs/${detail.run.id}?mode=status`,
  }
}

export default async function WorkflowBuilderRoutePage({
  params,
}: {
  params: Promise<{ workflowId: string }>
}) {
  const locale = await getRequestLocale()
  const displayLocale = locale === "zh" ? "zh" : "en"
  const { workflowId } = await params
  const numericWorkflowId = Number(workflowId)
  const currentUser = await requireServerSessionUser(`/dashboard/workflows/${workflowId}`)
  const configuredProviders = getConfiguredAiEntryProviders()

  if (!currentUser.enterpriseId || !Number.isInteger(numericWorkflowId) || numericWorkflowId <= 0) {
    notFound()
  }

  const [workflow, assets, llmDefaultCatalog, llmProviderCatalogs, taskRuns, voiceOptions] = await Promise.all([
    getWorkflowDefinition(numericWorkflowId, currentUser.enterpriseId),
    listEnterpriseAssetLibraryCandidates(currentUser.enterpriseId),
    getAiEntryModelCatalog().catch(() => null),
    Promise.all(
      configuredProviders.map(async (provider) => ({
        providerId: provider.id,
        catalog: await getAiEntryModelCatalog({ providerId: provider.id }).catch(() => null),
      })),
    ),
    listPlatformTaskRunsForEnterprise(currentUser.enterpriseId),
    hasFeatureAccessWithFallback(currentUser, "audio_generation", "video_generation") && isMiniMaxAudioConfigured()
      ? listMiniMaxVoices("all")
          .then((result) =>
            result.voices.map((voice) => ({
              voiceId: voice.voiceId,
              voiceName: voice.voiceName,
              category: voice.category,
              description: voice.description,
            })),
          )
          .catch(() => [])
      : Promise.resolve([]),
  ])

  if (!workflow) {
    notFound()
  }

  const latestRun =
    taskRuns.find(
      (run) =>
        run.kind === "workflow" &&
        run.itemType === "workflow" &&
        resolveWorkflowIdFromRun(run) === numericWorkflowId,
    ) ?? null
  const latestRunDetail = latestRun ? await getWorkflowRunDetail(latestRun.id, currentUser.enterpriseId) : null

  return (
    <WorkflowBuilderPage
      locale={displayLocale}
      initialWorkflow={{
        ...workflow,
        createdAt: workflow.createdAt.toISOString(),
        updatedAt: workflow.updatedAt.toISOString(),
        edges: workflow.edges.map((edge) => ({
          ...edge,
          inputName: edge.inputName ?? null,
        })),
      }}
      assets={assets}
      llmModelCatalog={{
        defaultProviderId: llmDefaultCatalog?.selectedProviderId || llmDefaultCatalog?.providerId || null,
        defaultModelId: llmDefaultCatalog?.selectedModelId || llmDefaultCatalog?.models[0]?.id || null,
        providers: llmProviderCatalogs
          .map(({ providerId, catalog }) => ({
            providerId,
            label: getProviderLabel(providerId),
            models: (catalog?.models || []).map((model) => ({
              modelId: model.id,
              label: model.name || model.id,
            })),
          }))
          .filter((provider) => provider.models.length > 0),
      }}
      voiceOptions={voiceOptions}
      initialLatestRunDetail={latestRunDetail ? serializeWorkflowRunDetail(latestRunDetail) : null}
    />
  )
}
