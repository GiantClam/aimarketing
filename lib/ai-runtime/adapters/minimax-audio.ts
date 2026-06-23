import {
  executeMiniMaxAudioFeature,
  isMiniMaxAudioConfigured,
  queryMiniMaxAudioTask,
  type MiniMaxNormalizedTask,
} from "@/lib/platform/minimax-audio"

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

function inferFeatureId(model: ModelDefinition) {
  const value = model.providerMetadata?.featureId
  if (value === "voice-clone" || value === "voice-synthesis") return value
  return "ai-music"
}

function toOutputs(task: Pick<MiniMaxNormalizedTask, "results">): CapabilityOutput[] {
  return (task.results || []).map((item) => ({
    kind: "audio",
    url: item.url ?? null,
    text: item.text ?? null,
    title: item.title ?? null,
    mimeType: item.outputType ?? null,
  }))
}

export const minimaxAudioAdapter: ProviderAdapter = {
  provider: "minimax",
  isConfigured(input: ProviderConfigContext) {
    return isMiniMaxAudioConfigured(input.runtimeContext?.minimaxAudioConfig)
  },
  async execute(input: CapabilityExecutionRequest, model: ModelDefinition): Promise<CapabilityExecutionResult> {
    const result = await executeMiniMaxAudioFeature({
      currentUser: input.currentUser,
      featureId: inferFeatureId(model),
      params: {
        ...input.input,
        model: model.providerMetadata?.nativeModel,
        modelId: model.id,
      },
      config: input.runtimeContext?.minimaxAudioConfig,
      defaultModel: String(model.providerMetadata?.nativeModel || ""),
    })
    const outputs = toOutputs(result)
    const normalizedStatus =
      result.status === "SUCCESS" ? "succeeded" : result.status === "FAILED" ? "failed" : result.status === "QUEUED" ? "queued" : "running"
    if (normalizedStatus === "succeeded") {
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
      status: normalizedStatus === "queued" ? "queued" : "running",
      provider: "minimax",
      modelId: model.id,
      outputs,
      payload: result as unknown as Record<string, unknown>,
      task: {
        localRunId: Number(result.taskId) || null,
        provider: result.provider,
        providerTaskId: null,
        detailPath: `/api/platform/media/tasks/${encodeURIComponent(result.taskId)}?target=ai-music`,
      },
      raw: result.raw || undefined,
    }
  },
  async query(input: CapabilityTaskQueryRequest, model: ModelDefinition): Promise<CapabilityTaskQueryResult> {
    if (!input.runId) {
      throw new Error("capability_run_id_required")
    }
    const result = await queryMiniMaxAudioTask({
      currentUser: input.currentUser,
      runId: input.runId,
      config: input.runtimeContext?.minimaxAudioConfig,
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
