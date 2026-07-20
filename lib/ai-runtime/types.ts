import type { MiniMaxAudioConfig } from "@/lib/platform/minimax-audio"
import type { MiniMaxVideoConfig } from "@/lib/platform/minimax-video"
import type { RunningHubConfig } from "@/lib/platform/runninghub"

import type { ModelCapability } from "@/lib/ai-runtime/capabilities"

export type ModelProviderId =
  | "google_official"
  | "minimax"
  | "openai_compatible"
  | "openai_official"
  | "runninghub"

export type ModelParameterType =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "boolean"
  | "file"
  | "image"
  | "audio"
  | "video"
  | "url"

export type ModelParameterDefinition = {
  id: string
  label: string
  type: ModelParameterType
  required?: boolean
  defaultValue?: unknown
  options?: Array<{ label: string; value: string }>
  min?: number
  max?: number
  step?: number
  placeholder?: string
  helperText?: string
  visibleWhen?: Record<string, unknown>
  providerField?: string
}

export type ModelDefinition = {
  id: string
  provider: ModelProviderId
  capability: ModelCapability
  label: string
  description?: string
  async: boolean
  outputKind: "text" | "image" | "video" | "audio" | "file"
  defaultTimeoutMs?: number
  parameterSchema: ModelParameterDefinition[]
  providerMetadata?: Record<string, unknown>
}

export type CapabilityOutput = {
  kind: "text" | "image" | "video" | "audio" | "file"
  url?: string | null
  text?: string | null
  title?: string | null
  mimeType?: string | null
  metadata?: Record<string, unknown>
}

export type CapabilityTaskStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"

export type CapabilityRuntimeUser = {
  id: number
  enterpriseId: number | null
}

export type CapabilityRuntimeContext = {
  minimaxAudioConfig?: MiniMaxAudioConfig
  minimaxVideoConfig?: MiniMaxVideoConfig
  runningHubConfig?: RunningHubConfig
}

export type CapabilityExecutionSource =
  | "capabilities"
  | "workflow"
  | "chat_tool"
  | "agent"
  | "api"

export type CapabilityExecutionRequest = {
  currentUser: CapabilityRuntimeUser
  capability: ModelCapability
  modelId: string
  input: Record<string, unknown>
  source: CapabilityExecutionSource
  requestId?: string
  /** Provider-level idempotency key. Adapters must forward it when supported. */
  idempotencyKey?: string
  /** Cancels local provider I/O; it does not imply upstream task cancellation. */
  signal?: AbortSignal
  runtimeContext?: CapabilityRuntimeContext
}

/**
 * Incremental runtime contract used by workflow attempts. Kept as an alias so
 * existing capability callers can continue using CapabilityExecutionRequest.
 */
export type CapabilityExecutionRequestV2 = CapabilityExecutionRequest & {
  idempotencyKey?: string
  signal?: AbortSignal
}

export type CapabilityTaskQueryRequest = {
  currentUser: CapabilityRuntimeUser
  capability?: ModelCapability | null
  modelId: string
  runId?: number
  taskId?: string
  runtimeContext?: CapabilityRuntimeContext
}

export type CapabilityExecutionResult =
  | {
      mode: "completed"
      status: "succeeded"
      provider: ModelProviderId
      modelId: string
      outputs: CapabilityOutput[]
      payload: Record<string, unknown>
      raw?: Record<string, unknown>
    }
  | {
      mode: "async"
      status: "queued" | "running" | "failed"
      provider: ModelProviderId
      modelId: string
      outputs: CapabilityOutput[]
      payload: Record<string, unknown>
      task: {
        localRunId: number | null
        provider: string
        providerTaskId: string | null
        detailPath: string | null
      }
      raw?: Record<string, unknown>
    }

export type CapabilityTaskQueryResult = {
  status: CapabilityTaskStatus
  provider: ModelProviderId
  modelId: string
  outputs: CapabilityOutput[]
  payload: Record<string, unknown>
  providerStatus?: string | null
  raw?: Record<string, unknown>
}

export type ProviderConfigContext = {
  runtimeContext?: CapabilityRuntimeContext
}

export type ProviderAdapter = {
  provider: ModelProviderId
  capabilities?: readonly ModelCapability[]
  isConfigured(input: ProviderConfigContext): boolean
  execute(input: CapabilityExecutionRequest, model: ModelDefinition): Promise<CapabilityExecutionResult>
  query?(input: CapabilityTaskQueryRequest, model: ModelDefinition): Promise<CapabilityTaskQueryResult>
  cancel?(input: CapabilityTaskCancelRequest, model: ModelDefinition): Promise<CapabilityTaskCancelResult>
  upstreamCancelSupported?: boolean
}

export type CapabilityTaskCancelRequest = CapabilityTaskQueryRequest & {
  providerTaskId: string
  reason: "user_cancelled" | "fail_fast" | "timeout"
}

export type CapabilityTaskCancelResult = {
  status: "cancel_requested" | "cancelled" | "already_terminal" | "not_supported"
  providerRequestId?: string | null
}

export type ProviderAdapterV2 = ProviderAdapter & {
  execute(input: CapabilityExecutionRequestV2, model: ModelDefinition): Promise<CapabilityExecutionResult>
}
