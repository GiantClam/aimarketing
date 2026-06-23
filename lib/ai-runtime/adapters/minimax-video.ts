import {
  executeMiniMaxVideoFeature,
  isMiniMaxVideoConfigured,
  queryMiniMaxVideoTask,
  type MiniMaxVideoTask,
} from "@/lib/platform/minimax-video"

import type {
  CapabilityExecutionRequest,
  CapabilityExecutionResult,
  CapabilityOutput,
  CapabilityTaskQueryRequest,
  CapabilityTaskQueryResult,
  ModelDefinition,
  ProviderAdapter,
  ProviderConfigContext,
} from "@/lib/ai-runtime/types"

function toOutputs(task: Pick<MiniMaxVideoTask, "results">): CapabilityOutput[] {
  return (task.results || []).map((item) => ({
    kind: "video",
    url: item.url ?? null,
    text: item.text ?? null,
    title: item.title ?? null,
    mimeType: item.outputType ?? null,
  }))
}

function inferFeatureId(model: ModelDefinition) {
  const value = model.providerMetadata?.featureId
  return value === "image-to-video" ? "image-to-video" : "text-to-video"
}

export const minimaxVideoAdapter: ProviderAdapter = {
  provider: "minimax",
  isConfigured(input: ProviderConfigContext) {
    return isMiniMaxVideoConfigured(input.runtimeContext?.minimaxVideoConfig)
  },
  async execute(input: CapabilityExecutionRequest, model: ModelDefinition): Promise<CapabilityExecutionResult> {
    const result = await executeMiniMaxVideoFeature({
      currentUser: input.currentUser,
      featureId: inferFeatureId(model),
      params: {
        ...input.input,
        model: model.providerMetadata?.nativeModel,
        modelId: model.id,
      },
      config: input.runtimeContext?.minimaxVideoConfig,
      defaultModel: String(model.providerMetadata?.nativeModel || ""),
    })
    const outputs = toOutputs(result)
    if (result.status === "SUCCESS") {
      return {
        mode: "completed",
        status: "succeeded",
        provider: "minimax",
        modelId: model.id,
        outputs,
        payload: result as unknown as Record<string, unknown>,
        raw: result.raw || undefined,
      }
    }
    return {
      mode: "async",
      status: result.status === "FAILED" ? "failed" : result.status === "QUEUED" ? "queued" : "running",
      provider: "minimax",
      modelId: model.id,
      outputs,
      payload: result as unknown as Record<string, unknown>,
      task: {
        localRunId: Number(result.taskId) || null,
        provider: result.provider,
        providerTaskId: null,
        detailPath: `/api/platform/media/tasks/${encodeURIComponent(result.taskId)}?target=ai-video`,
      },
      raw: result.raw || undefined,
    }
  },
  async query(input: CapabilityTaskQueryRequest, model: ModelDefinition): Promise<CapabilityTaskQueryResult> {
    if (!input.runId) {
      throw new Error("capability_run_id_required")
    }

    const result = await queryMiniMaxVideoTask({
      currentUser: input.currentUser,
      runId: input.runId,
      config: input.runtimeContext?.minimaxVideoConfig,
    })

    return {
      status: result.status === "SUCCESS" ? "succeeded" : result.status === "FAILED" ? "failed" : result.status === "QUEUED" ? "queued" : "running",
      provider: "minimax",
      modelId: model.id,
      outputs: toOutputs(result),
      payload: result as unknown as Record<string, unknown>,
      providerStatus: result.status,
      raw: result.raw || undefined,
    }
  },
}
