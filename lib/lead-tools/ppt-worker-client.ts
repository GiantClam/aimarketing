import {
  getPptWorkerBaseUrl,
  getPptWorkerInternalToken,
  getPptWorkerPreviewPollIntervalMs,
  getPptWorkerPreviewTimeoutMs,
  getPptWorkerRuntimeProfile,
} from "@/lib/lead-tools/config"
import type {
  PptWorkerExportRequest,
  PptWorkerModelValue,
  PptWorkerExportResponse,
  PptWorkerPreviewRequest,
  PptWorkerPreviewResponse,
  PptWorkerPreviewStatusResponse,
  PptWorkerPreviewSubmitResponse,
} from "@/lib/lead-tools/ppt-worker-types"

const PPT_WORKER_SUPPORTED_MODELS: PptWorkerModelValue[] = [
  "MiniMax-M2.7-highspeed",
  "MiniMax-M3",
  "step-3.7-flash",
]

function normalizeWorkerBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "")
}

function normalizeWorkerModelValue(value: unknown) {
  if (typeof value !== "string") return ""
  return value.trim()
}

function isSupportedPptWorkerModel(value: string): value is PptWorkerModelValue {
  return PPT_WORKER_SUPPORTED_MODELS.includes(value as PptWorkerModelValue)
}

function resolvePptWorkerFallbackModel() {
  const configuredCandidates = [
    process.env.LEAD_TOOLS_PPT_PREVIEW_MODEL,
    process.env.LEAD_TOOLS_MINIMAX_MODEL,
    "MiniMax-M3",
  ]

  for (const candidate of configuredCandidates) {
    const normalized = normalizeWorkerModelValue(candidate)
    if (isSupportedPptWorkerModel(normalized)) return normalized
  }

  return "MiniMax-M3" as const
}

export function normalizePptWorkerPreviewModel(model: unknown) {
  const normalized = normalizeWorkerModelValue(model)
  if (!normalized) return undefined
  if (isSupportedPptWorkerModel(normalized)) return normalized
  return resolvePptWorkerFallbackModel()
}

function buildWorkerHeaders() {
  const token = getPptWorkerInternalToken()

  return {
    "content-type": "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function requestWorker<T>(path: string, options?: { method?: "GET" | "POST"; body?: unknown }): Promise<T> {
  const baseUrl = normalizeWorkerBaseUrl(getPptWorkerBaseUrl())

  if (!baseUrl) {
    throw new Error("ppt_worker_base_url_missing")
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: options?.method || "POST",
    headers: buildWorkerHeaders(),
    body: options?.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  })

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
        ? payload.message
        : `ppt_worker_http_${response.status}`
    throw new Error(message)
  }

  return payload as T
}

export async function requestPptWorkerPreview(
  input: Omit<PptWorkerPreviewRequest, "runtimeProfile">,
) {
  const submitted = await requestWorker<PptWorkerPreviewSubmitResponse>("/preview", {
    method: "POST",
    body: {
      ...input,
      model: normalizePptWorkerPreviewModel(input.model),
      runtimeProfile: getPptWorkerRuntimeProfile(),
    },
  })

  const deadline = Date.now() + getPptWorkerPreviewTimeoutMs()
  const pollIntervalMs = getPptWorkerPreviewPollIntervalMs()

  while (Date.now() < deadline) {
    const status = await requestWorker<PptWorkerPreviewStatusResponse>(`/preview-jobs/${submitted.jobId}`, {
      method: "GET",
    })

    if (status.status === "completed") {
      const result: PptWorkerPreviewResponse = {
        previewSessionId: status.previewSessionId,
        generatedAt: status.generatedAt,
        deck: status.deck,
      }
      return result
    }

    if (status.status === "failed") {
      throw new Error(status.message || "ppt_worker_preview_failed")
    }

    await sleep(pollIntervalMs)
  }

  throw new Error("ppt_worker_preview_timeout")
}

export async function requestPptWorkerPreviewSubmit(
  input: Omit<PptWorkerPreviewRequest, "runtimeProfile">,
) {
  return requestWorker<PptWorkerPreviewSubmitResponse>("/preview", {
    method: "POST",
    body: {
      ...input,
      runtimeProfile: getPptWorkerRuntimeProfile(),
    },
  })
}

export async function requestPptWorkerPreviewStatus(jobId: string) {
  return requestWorker<PptWorkerPreviewStatusResponse>(`/preview-jobs/${jobId}`, {
    method: "GET",
  })
}

export async function requestPptWorkerExport(input: PptWorkerExportRequest) {
  return requestWorker<PptWorkerExportResponse>("/export", {
    method: "POST",
    body: input,
  })
}
