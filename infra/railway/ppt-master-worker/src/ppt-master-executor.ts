import { randomUUID } from "node:crypto"

import * as generationModule from "../../../../lib/lead-tools/generation-ppt-fixed.js"
import * as pptMasterRuntimeModule from "../../../../lib/lead-tools/ppt-master-runtime.js"
import type { PptPreviewRequest } from "../../../../lib/lead-tools/ppt-preview-data-fixed.js"
import * as binaryModule from "../../../../lib/utils/binary.js"

import type { ExportRequest, PreviewRequest } from "./types.js"

const generation = ("default" in generationModule ? generationModule.default : generationModule) as typeof generationModule
const pptMasterRuntime = (
  "default" in pptMasterRuntimeModule ? pptMasterRuntimeModule.default : pptMasterRuntimeModule
) as typeof pptMasterRuntimeModule
const binary = ("default" in binaryModule ? binaryModule.default : binaryModule) as typeof binaryModule

const { generateLeadToolPptPreviewWithFallback } = generation
const { exportPptMasterSessionVariant } = pptMasterRuntime
const { toBase64 } = binary

export type PreviewJobResult = {
  previewSessionId: string
  generatedAt: string
  deck: unknown
}

export type ExportJobResult = {
  fileName: string
  contentType: string
  slideCount: number
  variantName: string
  bufferBase64: string
}

let generateLeadToolPptPreviewWithFallbackImpl = generateLeadToolPptPreviewWithFallback
let exportPptMasterSessionVariantImpl = exportPptMasterSessionVariant

function toPreviewRequest(request: PreviewRequest): PptPreviewRequest {
  return {
    prompt: request.prompt,
    researchBrief: request.researchBrief,
    scenario: request.scenario,
    language: request.language,
    model: request.model,
    runtimeSlideModel: request.runtimeSlideModel,
    runtimeSlideProvider: request.runtimeSlideProvider,
    preferredProviderId: request.preferredProviderId,
    previewRuntime: "ppt-master-agent",
    templateMode: request.templateMode,
    templateId: request.templateId,
    narrativeAngle: request.narrativeAngle,
    pageCount: request.pageCount ?? null,
    images: request.images,
  }
}

export async function runPreviewJob(request: PreviewRequest): Promise<PreviewJobResult> {
  const deck = await generateLeadToolPptPreviewWithFallbackImpl(toPreviewRequest(request), request.allowMockFallback)

  return {
    previewSessionId: deck.previewSessionId ?? randomUUID(),
    generatedAt: deck.generatedAt,
    deck,
  }
}

export async function runExportJob(request: ExportRequest): Promise<ExportJobResult> {
  const artifact = await exportPptMasterSessionVariantImpl(request.previewSessionId, request.selectedVariantKey)

  return {
    fileName: artifact.fileName,
    contentType: artifact.contentType,
    slideCount: artifact.slideCount,
    variantName: artifact.variantName,
    bufferBase64: toBase64(artifact.buffer),
  }
}

export function setPptWorkerExecutorDepsForTests(
  deps:
    | {
        generateLeadToolPptPreviewWithFallback?: typeof generateLeadToolPptPreviewWithFallback
        exportPptMasterSessionVariant?: typeof exportPptMasterSessionVariant
      }
    | null,
) {
  generateLeadToolPptPreviewWithFallbackImpl =
    deps?.generateLeadToolPptPreviewWithFallback ?? generateLeadToolPptPreviewWithFallback
  exportPptMasterSessionVariantImpl =
    deps?.exportPptMasterSessionVariant ?? exportPptMasterSessionVariant
}
