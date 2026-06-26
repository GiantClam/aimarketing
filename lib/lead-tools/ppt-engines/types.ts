import type { AuthUser } from "@/lib/auth/session"
import type {
  PptPreviewDeck,
  PptPreviewRequest,
  PptPreviewVariant,
} from "@/lib/lead-tools/ppt-preview-data-fixed"
import type {
  LeadToolPptExportRuntimeId,
  LeadToolPptPreviewRuntimeId,
} from "@/lib/lead-tools/ppt-engines/preview-runtime-types"

// Remote worker transport types live in `ppt-worker-types.ts`.
// Keep these engine response types stable because they are consumed by the app runtime.
export type LeadToolPptPreviewEngineId = "ppt-master" | "frontend-slides"
export type LeadToolPptExportEngineId = "ppt-master"

export type LeadToolResolvedModels = {
  previewModel: string
  finalModel: string
}

export type LeadToolPptProtectedAction = {
  deck: PptPreviewDeck
  selectedVariant: PptPreviewVariant
  previewSessionId?: string
}

export type LeadToolPptPreviewResponse = {
  previewSessionId: string
  generatedAt: string
  deck: PptPreviewDeck
  meta: {
    previewEngine: LeadToolPptPreviewEngineId
    exportEngine: LeadToolPptExportEngineId
    previewRuntime: LeadToolPptPreviewRuntimeId
    exportRuntime: LeadToolPptExportRuntimeId
    mode: "ppt-master-project-preview" | "ppt-master-svg-preview" | "html-fast-preview"
    mockFallback: boolean
    providerFallback?: string
  }
}

export type LeadToolPptFinalizeResponse = {
  jobId: string
  status: "ready" | "queued"
  message: string
  requestedBy?: string
  exportPlan: {
    title: string
    selectedVariant: string
    slideCount: number
    output: "editable-pptx" | "html-file"
    finalModel: string
  }
}

export type LeadToolPptDownloadResponse = {
  artifact?: {
    buffer: Uint8Array | Buffer
    contentType: string
    fileName: string
  }
  deck: PptPreviewDeck
  variant: PptPreviewVariant
}

export interface LeadToolPptPreviewEngine {
  buildPreview(
    request: PptPreviewRequest,
    options: {
      allowMockFallback: boolean
      resolvedModels: LeadToolResolvedModels
    },
  ): Promise<LeadToolPptPreviewResponse>
}

export interface LeadToolPptExportEngine {
  buildFinalize(
    action: LeadToolPptProtectedAction,
    options: {
      user: AuthUser | null
      resolvedModels: LeadToolResolvedModels
    },
  ): Promise<LeadToolPptFinalizeResponse>
  buildDownload(
    action: LeadToolPptProtectedAction,
    options: {
      user: AuthUser | null
    },
  ): Promise<LeadToolPptDownloadResponse>
}

export type LeadToolPptEngines = {
  preview: LeadToolPptPreviewEngine
  export: LeadToolPptExportEngine
}
