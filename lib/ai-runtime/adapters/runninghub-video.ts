import {
  executeRunningHubVideoFeature,
  queryRunningHubVideoTask,
  type RunningHubVideoTask,
} from "@/lib/platform/runninghub-video"
import { isRunningHubConfiguredForTarget } from "@/lib/platform/runninghub"

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
  if (value === "image-to-video" || value === "digital-human" || value === "video-enhance") {
    return value
  }
  return "text-to-video"
}

function toOutputs(task: Pick<RunningHubVideoTask, "results">): CapabilityOutput[] {
  return (task.results || []).map((item) => ({
    kind: "video",
    url: item.url ?? null,
    text: item.text ?? null,
    title: item.title ?? null,
    mimeType: item.outputType ?? null,
  }))
}

export const runninghubVideoAdapter: ProviderAdapter = {
  provider: "runninghub",
  capabilities: ["video.text_to_video", "video.image_to_video", "video.digital_human"],
  isConfigured(input: ProviderConfigContext) {
    return isRunningHubConfiguredForTarget("ai-video", input.runtimeContext?.runningHubConfig)
  },
  async execute(input: CapabilityExecutionRequest, model: ModelDefinition): Promise<CapabilityExecutionResult> {
    const result = await executeRunningHubVideoFeature({
      currentUser: input.currentUser,
      featureId: inferFeatureId(model),
      params: {
        ...input.input,
        model: model.providerMetadata?.nativeModel,
        modelId: model.id,
      },
      config: input.runtimeContext?.runningHubConfig,
    })
    const outputs = toOutputs(result)
    if (result.status === "SUCCESS") {
      return {
        mode: "completed",
        status: "succeeded",
        provider: "runninghub",
        modelId: model.id,
        outputs,
        payload: result as unknown as Record<string, unknown>,
        raw: result.raw || undefined,
      }
    }
    return {
      mode: "async",
      status: result.status === "FAILED" ? "failed" : result.status === "QUEUED" ? "queued" : "running",
      provider: "runninghub",
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
    const result = await queryRunningHubVideoTask({
      currentUser: input.currentUser,
      runId: input.runId,
      config: input.runtimeContext?.runningHubConfig,
    })
    return {
      status: result.status === "SUCCESS" ? "succeeded" : result.status === "FAILED" ? "failed" : result.status === "QUEUED" ? "queued" : "running",
      provider: "runninghub",
      modelId: model.id,
      outputs: toOutputs(result),
      payload: result as unknown as Record<string, unknown>,
      providerStatus: result.status,
      raw: result.raw || undefined,
    }
  },
}
