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
import { getLeadToolPptExportRuntime, getLeadToolPptPreviewRuntime } from "@/lib/lead-tools/config"
import { generateLeadToolPptStoryDeck } from "@/lib/lead-tools/generation-ppt-fixed"

function getPreviewRuntime(): LeadToolPptPreviewRuntime {
  const runtimeId = getLeadToolPptPreviewRuntime("ai-ppt-preview")

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
    mode: "ppt-master-project-preview" as const,
  }
}

const pptMasterPreviewEngine: LeadToolPptPreviewEngine = {
  async buildPreview(request, options) {
    const runtime = getPreviewRuntime()
    let deck

    try {
      const storyDeck = await generateLeadToolPptStoryDeck(request)
      deck = await runtime.materializeStoryDeck(storyDeck)
    } catch (error) {
      if (!options.allowMockFallback) {
        throw error
      }

      deck = renderPptPreviewDeckAssets(buildMockPptPreview(request))
    }

    const previewMeta = getPreviewEngineMeta(runtime)

    return {
      previewSessionId: deck.previewSessionId ?? randomUUID(),
      generatedAt: deck.generatedAt,
      deck,
      meta: {
        previewEngine: previewMeta.previewEngine,
        exportEngine: "ppt-master",
        previewRuntime: runtime.id,
        exportRuntime: getLeadToolPptExportRuntime("ai-ppt-preview") as "ppt-master-agent",
        mode:
          deck.previewEngine === "ppt-master-svg"
            ? "ppt-master-svg-preview"
            : deck.previewEngine === "ppt-master-project"
              ? "ppt-master-project-preview"
              : previewMeta.mode,
        mockFallback: deck.source === "mock",
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

    if (action.previewSessionId) {
      const { variant } = await getPptMasterSessionVariant(action.previewSessionId, action.selectedVariant.key)

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

    return {
      jobId: randomUUID(),
      status: "queued",
      message: "完整 PPT 生成任务已创建，当前为可替换的 MVP 占位导出器。",
      requestedBy: options.user?.email,
      exportPlan: {
        title: action.deck.title,
        selectedVariant: action.selectedVariant.name,
        slideCount: action.selectedVariant.slides.length,
        output: "editable-pptx",
        finalModel: options.resolvedModels.finalModel,
      },
    } satisfies LeadToolPptFinalizeResponse
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

    if (action.previewSessionId) {
      const artifact = await exportPptMasterSessionVariant(action.previewSessionId, action.selectedVariant.key)

      return {
        artifact,
        deck: action.deck,
        variant: action.selectedVariant,
      } satisfies LeadToolPptDownloadResponse
    }

    return {
      deck: action.deck,
      variant: action.selectedVariant,
    } satisfies LeadToolPptDownloadResponse
  },
}

export function getPptMasterEngines() {
  return {
    preview: pptMasterPreviewEngine,
    export: pptMasterExportEngine,
  }
}
