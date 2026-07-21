import {
  executeBailianVideoFeature,
  getBailianVideoConfig,
  isBailianVideoConfigured,
  queryBailianVideoTask,
} from "@/lib/platform/bailian-video"

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

function toOutputs(results: Array<{ url?: string | null; outputType?: string | null; text?: string | null; title?: string | null }>): CapabilityOutput[] {
  return results.map((item) => ({ kind: "video", url: item.url ?? null, mimeType: item.outputType ?? null, text: item.text ?? null, title: item.title ?? null }))
}

export const bailianVideoAdapter: ProviderAdapter = {
  provider: "bailian",
  capabilities: ["video.text_to_video"],
  isConfigured(input: ProviderConfigContext) {
    return isBailianVideoConfigured(input.runtimeContext?.bailianConfig)
  },
  async execute(input: CapabilityExecutionRequest, model: ModelDefinition): Promise<CapabilityExecutionResult> {
    const result = await executeBailianVideoFeature({
      currentUser: input.currentUser,
      params: {
        ...input.input,
        model: model.providerMetadata?.nativeModel,
      },
      config: input.runtimeContext?.bailianConfig || getBailianVideoConfig(),
      model: String(model.providerMetadata?.nativeModel || "happyhorse-1.1-t2v"),
    })
    const outputs = toOutputs(result.results)
    return {
      mode: "async",
      status: result.status === "FAILED" ? "failed" : result.status === "QUEUED" ? "queued" : "running",
      provider: "bailian",
      modelId: model.id,
      outputs,
      payload: result as unknown as Record<string, unknown>,
      task: {
        localRunId: Number(result.taskId) || null,
        provider: "bailian",
        providerTaskId: result.extra?.providerTaskId ? String(result.extra.providerTaskId) : null,
        detailPath: `/api/platform/media/tasks/${encodeURIComponent(result.taskId)}?target=ai-video`,
      },
      raw: result.raw || undefined,
    }
  },
  async query(input: CapabilityTaskQueryRequest, model: ModelDefinition): Promise<CapabilityTaskQueryResult> {
    if (!input.runId) throw new Error("capability_run_id_required")
    const result = await queryBailianVideoTask({
      currentUser: input.currentUser,
      runId: input.runId,
      config: input.runtimeContext?.bailianConfig || getBailianVideoConfig(),
    })
    return {
      status: result.status === "SUCCESS" ? "succeeded" : result.status === "FAILED" ? "failed" : result.status === "QUEUED" ? "queued" : "running",
      provider: "bailian",
      modelId: model.id,
      outputs: toOutputs(result.results),
      payload: result as unknown as Record<string, unknown>,
      providerStatus: result.status,
      raw: result.raw || undefined,
    }
  },
}
