import { randomUUID } from "node:crypto"

import {
  type LeadToolPptDownloadResponse,
  type LeadToolPptExportEngine,
  type LeadToolPptFinalizeResponse,
  type LeadToolPptPreviewEngine,
  type LeadToolPptPreviewResponse,
} from "@/lib/lead-tools/ppt-engines/types"
import { buildMockPptPreview } from "@/lib/lead-tools/ppt-preview-data-fixed"
import { renderPptPreviewDeckAssets } from "@/lib/lead-tools/ppt-master-preview"
import type { LeadToolPptPreviewRuntime } from "@/lib/lead-tools/ppt-engines/preview-runtime-types"
import { pptMasterPreviewRuntime } from "@/lib/lead-tools/ppt-engines/ppt-master-preview-runtime"
import { frontendSlidesPreviewRuntime } from "@/lib/lead-tools/ppt-engines/frontend-slides-preview-runtime"
import { exportPptMasterSessionVariant, getPptMasterSessionVariant } from "@/lib/lead-tools/ppt-master-runtime"
import { storePptPreviewSessionDeck } from "@/lib/lead-tools/ppt-preview-session-store"
import {
  getLeadToolPptExecutionTransport,
  getLeadToolPptExportRuntime,
  getLeadToolPptPreviewRuntime,
} from "@/lib/lead-tools/config"
import { generateLeadToolPptStoryDeck } from "@/lib/lead-tools/generation-ppt-fixed"
import { requestPptWorkerExport, requestPptWorkerPreview } from "@/lib/lead-tools/ppt-worker-client"

let requestPptWorkerPreviewImpl = requestPptWorkerPreview
let requestPptWorkerExportImpl = requestPptWorkerExport
let getPptMasterSessionVariantImpl = getPptMasterSessionVariant
let exportPptMasterSessionVariantImpl = exportPptMasterSessionVariant
let generateLeadToolPptStoryDeckImpl = generateLeadToolPptStoryDeck
let getPreviewRuntimeImpl = getPreviewRuntime
let storePptPreviewSessionDeckImpl = storePptPreviewSessionDeck

function shouldUseRemoteWorkerTransport() {
  return getLeadToolPptExecutionTransport() === "remote-worker"
}

function getPreviewRuntime(requestedRuntimeId?: LeadToolPptPreviewRuntime["id"] | null): LeadToolPptPreviewRuntime {
  const runtimeId = requestedRuntimeId || getLeadToolPptPreviewRuntime("ai-ppt-preview")

  if (runtimeId === "ppt-master-agent") {
    return pptMasterPreviewRuntime
  }

  if (runtimeId === "frontend-slides-agent") {
    return frontendSlidesPreviewRuntime
  }

  throw new Error(`lead_tool_preview_runtime_unknown:${runtimeId}`)
}

function getPreviewEngineMeta(runtime: LeadToolPptPreviewRuntime) {
  if (runtime.id === "frontend-slides-agent") {
    return {
      previewEngine: "frontend-slides" as const,
      mode: "html-fast-preview" as const,
    }
  }

  return {
    previewEngine: "ppt-master" as const,
    mode: "ppt-master-svg-preview" as const,
  }
}

function normalizePptMasterPreviewDeck(deck: LeadToolPptPreviewResponse["deck"]): LeadToolPptPreviewResponse["deck"] {
  if (deck.previewEngine === "ppt-master-project") {
    return {
      ...deck,
      previewEngine: "ppt-master-svg",
    }
  }

  return deck
}

const pptMasterPreviewEngine: LeadToolPptPreviewEngine = {
  async buildPreview(request, options) {
    const runtime = getPreviewRuntimeImpl(request.previewRuntime)
    const previewMeta = getPreviewEngineMeta(runtime)

    if (runtime.id === "ppt-master-agent" && shouldUseRemoteWorkerTransport()) {
      const remote = await requestPptWorkerPreviewImpl({
        requestId: randomUUID(),
        prompt: request.prompt,
        researchBrief: request.researchBrief,
        scenario: request.scenario,
        language: request.language,
        model: request.model,
        templateMode: request.templateMode,
        templateId: request.templateId,
        narrativeAngle: request.narrativeAngle,
        pageCount: request.pageCount ?? null,
        images: request.images,
        allowMockFallback: options.allowMockFallback,
      })
      const remoteDeck = normalizePptMasterPreviewDeck(remote.deck as LeadToolPptPreviewResponse["deck"])
      const storedDeck = await storePptPreviewSessionDeckImpl({
        ...remoteDeck,
        previewSessionId: remote.previewSessionId,
      })

      return {
        previewSessionId: storedDeck.previewSessionId!,
        generatedAt: remote.generatedAt,
        deck: storedDeck as LeadToolPptPreviewResponse["deck"],
        meta: {
          previewEngine: "ppt-master",
          exportEngine: "ppt-master",
          previewRuntime: "ppt-master-agent",
          exportRuntime: getLeadToolPptExportRuntime("ai-ppt-preview") as "ppt-master-agent",
          mode: "ppt-master-svg-preview",
          mockFallback: storedDeck.source === "mock",
        },
      } satisfies LeadToolPptPreviewResponse
    }

    let deck

    try {
      const storyDeck = await generateLeadToolPptStoryDeckImpl(request)
      deck = normalizePptMasterPreviewDeck(await runtime.materializeStoryDeck(storyDeck))
    } catch (error) {
      if (!options.allowMockFallback) {
        throw error
      }

      deck = renderPptPreviewDeckAssets(buildMockPptPreview(request))
    }
    const storedDeck = await storePptPreviewSessionDeckImpl(deck)

    return {
      previewSessionId: storedDeck.previewSessionId!,
      generatedAt: storedDeck.generatedAt,
      deck: storedDeck,
      meta: {
        previewEngine: previewMeta.previewEngine,
        exportEngine: "ppt-master",
        previewRuntime: runtime.id,
        exportRuntime: getLeadToolPptExportRuntime("ai-ppt-preview") as "ppt-master-agent",
        mode:
          storedDeck.previewEngine === "ppt-master-svg"
            ? "ppt-master-svg-preview"
            : storedDeck.previewEngine === "ppt-master-project"
              ? "ppt-master-project-preview"
              : previewMeta.mode,
        mockFallback: storedDeck.source === "mock",
      },
    } satisfies LeadToolPptPreviewResponse
  },
}

const pptMasterExportEngine: LeadToolPptExportEngine = {
  async buildFinalize(action, options) {
    if (action.deck.previewEngine === "frontend-slides-html") {
      const htmlDocument = action.selectedVariant.preview?.htmlDocument
      if (htmlDocument) {
        return {
          jobId: randomUUID(),
          status: "ready",
          message: "frontend-slides HTML 成品已就绪，可直接导出文件。",
          requestedBy: options.user?.email,
          exportPlan: {
            title: action.deck.title,
            selectedVariant: action.selectedVariant.name,
            slideCount: action.selectedVariant.slides.length,
            output: "html-file",
            finalModel: options.resolvedModels.finalModel,
          },
        } satisfies LeadToolPptFinalizeResponse
      }
    }

    if (shouldUseRemoteWorkerTransport() && action.previewSessionId) {
      return {
        jobId: randomUUID(),
        status: "ready",
        message: "远程 ppt-master worker 已生成可导出的项目，可直接导出为 PPTX。",
        requestedBy: options.user?.email,
        exportPlan: {
          title: action.deck.title,
          selectedVariant: action.selectedVariant.name,
          slideCount: action.selectedVariant.slides.length,
          output: "editable-pptx",
          finalModel: options.resolvedModels.finalModel,
        },
      } satisfies LeadToolPptFinalizeResponse
    }

    if (action.previewSessionId) {
      const { variant } = await getPptMasterSessionVariantImpl(action.previewSessionId, action.selectedVariant.key)

      return {
        jobId: randomUUID(),
        status: "ready",
        message: "真实 ppt-master 项目已生成，可直接导出为 PPTX。",
        requestedBy: options.user?.email,
        exportPlan: {
          title: action.deck.title,
          selectedVariant: variant.name,
          slideCount: variant.slideCount,
          output: "editable-pptx",
          finalModel: options.resolvedModels.finalModel,
        },
      } satisfies LeadToolPptFinalizeResponse
    }

    throw new Error("ppt_preview_session_required")
  },

  async buildDownload(action) {
    if (action.deck.previewEngine === "frontend-slides-html") {
      const htmlDocument = action.selectedVariant.preview?.htmlDocument
      if (htmlDocument) {
        return {
          artifact: {
            buffer: Buffer.from(htmlDocument.html, "utf8"),
            contentType: "text/html; charset=utf-8",
            fileName: htmlDocument.fileName,
          },
          deck: action.deck,
          variant: action.selectedVariant,
        } satisfies LeadToolPptDownloadResponse
      }
    }

    if (shouldUseRemoteWorkerTransport() && action.previewSessionId) {
      const artifact = await requestPptWorkerExportImpl({
        requestId: randomUUID(),
        previewSessionId: action.previewSessionId,
        selectedVariantKey: action.selectedVariant.key,
      })

      return {
        artifact: {
          buffer: Buffer.from(artifact.bufferBase64, "base64"),
          contentType: artifact.contentType,
          fileName: artifact.fileName,
        },
        deck: action.deck,
        variant: action.selectedVariant,
      } satisfies LeadToolPptDownloadResponse
    }

    if (action.previewSessionId) {
      const artifact = await exportPptMasterSessionVariantImpl(action.previewSessionId, action.selectedVariant.key)

      return {
        artifact,
        deck: action.deck,
        variant: action.selectedVariant,
      } satisfies LeadToolPptDownloadResponse
    }

    throw new Error("ppt_preview_session_required")
  },
}

export function getPptMasterEngines() {
  return {
    preview: pptMasterPreviewEngine,
    export: pptMasterExportEngine,
  }
}

export function setPptWorkerTransportForTests(
  transport:
    | {
        preview?: typeof requestPptWorkerPreview
        export?: typeof requestPptWorkerExport
      }
    | null,
) {
  requestPptWorkerPreviewImpl = transport?.preview ?? requestPptWorkerPreview
  requestPptWorkerExportImpl = transport?.export ?? requestPptWorkerExport
}

export function setPptMasterEngineLocalDepsForTests(
  deps:
    | {
        getPreviewRuntime?: typeof getPreviewRuntime
        getSessionVariant?: typeof getPptMasterSessionVariant
        exportSessionVariant?: typeof exportPptMasterSessionVariant
        generateStoryDeck?: typeof generateLeadToolPptStoryDeck
        storePreviewSessionDeck?: typeof storePptPreviewSessionDeck
      }
    | null,
) {
  getPreviewRuntimeImpl = deps?.getPreviewRuntime ?? getPreviewRuntime
  getPptMasterSessionVariantImpl = deps?.getSessionVariant ?? getPptMasterSessionVariant
  exportPptMasterSessionVariantImpl = deps?.exportSessionVariant ?? exportPptMasterSessionVariant
  generateLeadToolPptStoryDeckImpl = deps?.generateStoryDeck ?? generateLeadToolPptStoryDeck
  storePptPreviewSessionDeckImpl = deps?.storePreviewSessionDeck ?? storePptPreviewSessionDeck
}
