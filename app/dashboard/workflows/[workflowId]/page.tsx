import { notFound } from "next/navigation"

import { WorkflowBuilderPage } from "@/components/workflows/workflow-builder-page"
import { getAiEntryAgentCatalog } from "@/lib/ai-entry/agent-catalog"
import { hasFeatureAccessWithFallback } from "@/lib/auth/guards"
import { requireServerSessionUser } from "@/lib/auth/server-session"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import { isMiniMaxAudioConfigured, listMiniMaxVoices } from "@/lib/platform/minimax-audio"
import { listCustomAgentsForUser } from "@/lib/platform/custom-agents"
import { listRecentWorkflowTaskRunsForEnterprise } from "@/lib/platform/task-run-store"
import { serializeWorkflowRunDetail } from "@/lib/workflows/run-detail-serialization"
import { getWorkflowDefinition, getWorkflowRunDetail } from "@/lib/workflows/store"
import { findLatestWorkflowRunRecordForWorkflow } from "@/lib/workflows/manual-resume"
import {
  getGovernedAiEntryModelCatalogForUser,
  resolveGovernedImageAssistantSelectionForUser,
} from "@/lib/platform/model-governance"

function getProviderLabel(providerId: string) {
  if (providerId === "deepseek") return "DeepSeek"
  if (providerId === "pptoken") return "PPTOKEN"
  if (providerId === "openrouter") return "OpenRouter"
  if (providerId === "aiberm") return "Aiberm"
  return "CrazyRouter"
}

async function measureWorkflowBuilderPageStep<T>(
  workflowId: number,
  label: string,
  operation: () => Promise<T>,
) {
  const startedAt = Date.now()
  try {
    return await operation()
  } finally {
    console.info("workflow.builder-page.timing", {
      workflowId,
      label,
      durationMs: Date.now() - startedAt,
    })
  }
}

export default async function WorkflowBuilderRoutePage({
  params,
}: {
  params: Promise<{ workflowId: string }>
}) {
  const requestStartedAt = Date.now()
  const locale = await measureWorkflowBuilderPageStep(0, "request-locale", () => getRequestLocale())
  const displayLocale = locale === "zh" ? "zh" : "en"
  const { workflowId } = await measureWorkflowBuilderPageStep(0, "route-params", () => params)
  const numericWorkflowId = Number(workflowId)
  const currentUser = await measureWorkflowBuilderPageStep(numericWorkflowId, "session-user", () =>
    requireServerSessionUser(`/dashboard/workflows/${workflowId}`),
  )
  if (!currentUser.enterpriseId || !Number.isInteger(numericWorkflowId) || numericWorkflowId <= 0) {
    notFound()
  }
  const enterpriseId = currentUser.enterpriseId

  const [workflow, llmProviderCatalog, workflowImageSelection, recentWorkflowRuns, voiceOptions, customAgents] = await Promise.all([
    measureWorkflowBuilderPageStep(numericWorkflowId, "workflow-definition", () =>
      getWorkflowDefinition(numericWorkflowId, enterpriseId),
    ),
    measureWorkflowBuilderPageStep(numericWorkflowId, "llm-provider-catalog", () =>
      getGovernedAiEntryModelCatalogForUser({
        user: currentUser,
      }).catch(() => null),
    ),
    measureWorkflowBuilderPageStep(numericWorkflowId, "workflow-image-providers", () =>
      resolveGovernedImageAssistantSelectionForUser({ user: currentUser }).catch(() => null),
    ),
    measureWorkflowBuilderPageStep(numericWorkflowId, "recent-workflow-runs", () =>
      listRecentWorkflowTaskRunsForEnterprise(enterpriseId, 40),
    ),
    hasFeatureAccessWithFallback(currentUser, "audio_generation", "video_generation") && isMiniMaxAudioConfigured()
      ? measureWorkflowBuilderPageStep(numericWorkflowId, "voice-options", () =>
          listMiniMaxVoices("all")
            .then((result) =>
              result.voices.map((voice) => ({
                voiceId: voice.voiceId,
                voiceName: voice.voiceName,
                category: voice.category,
                description: voice.description,
              })),
            )
            .catch(() => []),
        )
      : Promise.resolve([]),
    measureWorkflowBuilderPageStep(numericWorkflowId, "custom-agents", () =>
      listCustomAgentsForUser({
        enterpriseId,
        userId: currentUser.id,
        isEnterpriseAdmin: currentUser.enterpriseRole === "admin" && currentUser.enterpriseStatus === "active",
      }).catch(() => []),
    ),
  ])

  if (!workflow) {
    notFound()
  }

  const latestRun = findLatestWorkflowRunRecordForWorkflow(recentWorkflowRuns, numericWorkflowId)
  const latestRunDetail = latestRun
    ? await measureWorkflowBuilderPageStep(numericWorkflowId, "latest-run-detail", () =>
        getWorkflowRunDetail(latestRun.id, enterpriseId),
      )
    : null
  const serializedLatestRunDetail = serializeWorkflowRunDetail(latestRunDetail)
  console.info("workflow.builder-page.timing", {
    workflowId: numericWorkflowId,
    label: "total",
    durationMs: Date.now() - requestStartedAt,
    providerCatalogCount: llmProviderCatalog?.providers.length ?? 0,
    latestRunId: latestRun?.id ?? null,
  })

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
      assets={[]}
      llmModelCatalog={{
        defaultProviderId: llmProviderCatalog?.selectedProviderId || llmProviderCatalog?.providerId || null,
        defaultModelId: llmProviderCatalog?.selectedModelId || llmProviderCatalog?.models[0]?.id || null,
        providers: (llmProviderCatalog?.providers || [])
          .map((provider) => ({
            providerId: provider.id,
            label: provider.label || getProviderLabel(provider.id),
            models: (llmProviderCatalog?.modelGroups.find((group) => group.family === provider.id)?.models || [])
              .map((model) => ({
                modelId: model.id,
                label: model.name || model.id,
              })),
          }))
          .filter((provider) => provider.models.length > 0),
      }}
      workflowImageProviderOptions={
        Object.values(
          (workflowImageSelection?.modelOptions || []).reduce<Record<string, { providerId: string; label: string; models: Array<{ modelId: string; label: string; optionId?: string | null }> }>>(
            (accumulator, option) => {
              const current =
                accumulator[option.providerId] ||
                {
                  providerId: option.providerId,
                  label: option.providerLabel,
                  models: [],
                }
              current.models.push({
                modelId: option.modelId,
                label: option.label,
                optionId: option.id,
              })
              accumulator[option.providerId] = current
              return accumulator
            },
            {},
          ),
        )
      }
      voiceOptions={voiceOptions}
      builtinAgents={getAiEntryAgentCatalog().map((agent) => ({
        id: agent.id,
        category: agent.category,
        name: displayLocale === "zh" ? agent.name.zh : agent.name.en,
        description: displayLocale === "zh" ? agent.description.zh : agent.description.en,
      }))}
      customAgents={customAgents.map((agent) => ({
        id: agent.id,
        name: agent.name,
        summary: agent.summary,
        status: agent.status,
        executionMode: agent.executionMode,
        linkedWorkflowId: agent.linkedWorkflowId,
        linkedWorkflowTitle: agent.linkedWorkflowTitle,
      }))}
      initialLatestRunDetail={
        serializedLatestRunDetail
          ? {
              ...serializedLatestRunDetail,
              detailPath: `/api/workflows/runs/${latestRun!.id}`,
            }
          : null
      }
      initialLatestRunId={latestRun?.id ?? null}
    />
  )
}
