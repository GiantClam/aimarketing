import type { AuthUser } from "@/lib/auth/session"
import type { PptPreviewDeck, PptPreviewVariant } from "@/lib/lead-tools/ppt-preview-data-fixed"
import type { LeadToolPptDownloadResponse, LeadToolPptFinalizeResponse } from "@/lib/lead-tools/ppt-engines/types"
import { inferWorkItemTypeFromArtifact } from "@/lib/platform/artifact-actions"
import {
  platformTaskRunStore,
  type PlatformArtifactRecord,
  type PlatformTaskRunRecord,
  type PlatformTaskRunStore,
  type PlatformWorkItemRecord,
} from "@/lib/platform/task-run-store"

type EnterpriseLeadToolUser = AuthUser & { id: number; enterpriseId: number }

type LeadToolPersistenceStore = Pick<
  PlatformTaskRunStore,
  "createPlatformTaskRun" | "savePlatformArtifact" | "promotePlatformArtifactToWorkItem"
>

type LeadToolPlatformRunAction = "preview" | "download" | "finalize"

type CreateLeadToolPlatformRunInput = {
  currentUser: AuthUser | null | undefined
  toolSlug: string
  action: LeadToolPlatformRunAction
  inputPayload?: Record<string, unknown> | null
  normalizedResult?: Record<string, unknown> | null
  store?: LeadToolPersistenceStore
}

type SaveLeadToolPreviewArtifactInput = {
  currentUser: AuthUser | null | undefined
  toolSlug: string
  run: PlatformTaskRunRecord | null
  deck: PptPreviewDeck
  previewSessionId?: string
  store?: LeadToolPersistenceStore
}

type SaveLeadToolSelectedArtifactInput = {
  currentUser: AuthUser | null | undefined
  toolSlug: string
  run: PlatformTaskRunRecord | null
  deck: PptPreviewDeck
  selectedVariant: PptPreviewVariant
  previewSessionId?: string
  action: Exclude<LeadToolPlatformRunAction, "preview">
  finalizeResult?: LeadToolPptFinalizeResponse
  downloadResult?: LeadToolPptDownloadResponse
  store?: LeadToolPersistenceStore
}

type PromoteLeadToolArtifactToWorkInput = {
  currentUser: AuthUser | null | undefined
  artifact: PlatformArtifactRecord | null
  title?: string
  summary?: string | null
  metadata?: Record<string, unknown> | null
  store?: LeadToolPersistenceStore
}

function getEnterpriseLeadToolUser(currentUser: AuthUser | null | undefined): EnterpriseLeadToolUser | null {
  if (!currentUser) return null
  const userId = currentUser.id
  const enterpriseId = currentUser.enterpriseId

  if (typeof userId !== "number" || !Number.isInteger(userId) || userId <= 0) return null
  if (typeof enterpriseId !== "number" || !Number.isInteger(enterpriseId) || enterpriseId <= 0) return null

  return currentUser as EnterpriseLeadToolUser
}

function summarizeDeckForArtifact(deck: PptPreviewDeck) {
  return {
    title: deck.title,
    scenario: deck.scenario,
    language: deck.language,
    generatedAt: deck.generatedAt,
    outline: deck.outline,
    previewEngine: deck.previewEngine,
    previewSessionId: deck.previewSessionId,
    provider: deck.provider,
    previewModel: deck.previewModel,
    source: deck.source,
    templateMode: deck.templateMode,
    selectedTemplateId: deck.selectedTemplateId,
    pageCount: deck.pageCount,
    resolvedPageCount: deck.resolvedPageCount,
    variants: deck.variants.map((variant) => ({
      key: variant.key,
      styleKey: variant.styleKey,
      templateId: variant.templateId,
      narrativeAngle: variant.narrativeAngle,
      slotLabel: variant.slotLabel,
      name: variant.name,
      summary: variant.summary,
      stylePrompt: variant.stylePrompt,
      outline: variant.outline,
      palette: variant.palette,
      strengths: variant.strengths,
      slides: variant.slides,
      preview: variant.preview
        ? {
            format: variant.preview.format,
            themeId: variant.preview.themeId,
            cover: {
              mimeType: variant.preview.cover.mimeType,
              width: variant.preview.cover.width,
              height: variant.preview.cover.height,
              hasDataUrl: Boolean(variant.preview.cover.dataUrl),
            },
            slides: variant.preview.slides.map((slide) => ({
              mimeType: slide.mimeType,
              width: slide.width,
              height: slide.height,
              hasDataUrl: Boolean(slide.dataUrl),
            })),
            htmlDocument: variant.preview.htmlDocument
              ? {
                  fileName: variant.preview.htmlDocument.fileName,
                  hasHtml: Boolean(variant.preview.htmlDocument.html),
                }
              : undefined,
          }
        : undefined,
    })),
  }
}

function buildLeadToolPreviewArtifactTitle(toolSlug: string, deck: PptPreviewDeck) {
  return `${deck.title || "Untitled"} ${toolSlug} preview deck`
}

function buildLeadToolSelectedArtifactTitle(action: Exclude<LeadToolPlatformRunAction, "preview">, deck: PptPreviewDeck, variant: PptPreviewVariant) {
  const actionLabel = action === "download" ? "download export" : "finalize export"
  return `${deck.title || "Untitled"} ${variant.name} ${actionLabel}`
}

export async function createLeadToolPlatformRun(input: CreateLeadToolPlatformRunInput): Promise<PlatformTaskRunRecord | null> {
  const actor = getEnterpriseLeadToolUser(input.currentUser)
  if (!actor) return null

  const store = input.store ?? platformTaskRunStore

  return store.createPlatformTaskRun({
    enterpriseId: actor.enterpriseId,
    userId: actor.id,
    kind: "tool",
    itemType: `lead_tool_${input.action}`,
    itemSlug: input.toolSlug,
    status: "succeeded",
    inputPayload: input.inputPayload ?? null,
    normalizedResult: input.normalizedResult ?? null,
    startedAt: new Date(),
    finishedAt: new Date(),
  })
}

export async function saveLeadToolPreviewArtifact(input: SaveLeadToolPreviewArtifactInput): Promise<PlatformArtifactRecord | null> {
  const actor = getEnterpriseLeadToolUser(input.currentUser)
  if (!actor || !input.run) return null

  const store = input.store ?? platformTaskRunStore

  return store.savePlatformArtifact({
    runId: input.run.id,
    enterpriseId: actor.enterpriseId,
    ownerUserId: actor.id,
    kind: "json",
    title: buildLeadToolPreviewArtifactTitle(input.toolSlug, input.deck),
    mimeType: "application/json",
    payload: {
      toolSlug: input.toolSlug,
      artifactType: "lead_tool_preview_deck",
      previewSessionId: input.previewSessionId ?? input.deck.previewSessionId ?? null,
      deck: summarizeDeckForArtifact(input.deck),
    },
  })
}

export async function saveLeadToolSelectedArtifact(
  input: SaveLeadToolSelectedArtifactInput,
): Promise<PlatformArtifactRecord | null> {
  const actor = getEnterpriseLeadToolUser(input.currentUser)
  if (!actor || !input.run) return null

  const store = input.store ?? platformTaskRunStore

  return store.savePlatformArtifact({
    runId: input.run.id,
    enterpriseId: actor.enterpriseId,
    ownerUserId: actor.id,
    kind: "json",
    title: buildLeadToolSelectedArtifactTitle(input.action, input.deck, input.selectedVariant),
    mimeType: "application/json",
    payload: {
      toolSlug: input.toolSlug,
      artifactType: `lead_tool_${input.action}_selection`,
      previewSessionId: input.previewSessionId ?? input.deck.previewSessionId ?? null,
      deckTitle: input.deck.title,
      pageCount: input.deck.pageCount ?? null,
      resolvedPageCount: input.deck.resolvedPageCount ?? input.selectedVariant.slides.length,
      selectedVariant: {
        key: input.selectedVariant.key,
        styleKey: input.selectedVariant.styleKey,
        templateId: input.selectedVariant.templateId,
        narrativeAngle: input.selectedVariant.narrativeAngle,
        slotLabel: input.selectedVariant.slotLabel,
        name: input.selectedVariant.name,
        summary: input.selectedVariant.summary,
        slideCount: input.selectedVariant.slides.length,
      },
      finalizeResult: input.finalizeResult
        ? {
            jobId: input.finalizeResult.jobId,
            status: input.finalizeResult.status,
            message: input.finalizeResult.message,
            requestedBy: input.finalizeResult.requestedBy ?? null,
            exportPlan: input.finalizeResult.exportPlan,
          }
        : null,
      downloadResult: input.downloadResult
        ? {
            fileName: input.downloadResult.artifact?.fileName ?? null,
            contentType: input.downloadResult.artifact?.contentType ?? null,
          }
        : null,
    },
  })
}

export async function promoteLeadToolArtifactToWork(
  input: PromoteLeadToolArtifactToWorkInput,
): Promise<PlatformWorkItemRecord | null> {
  const actor = getEnterpriseLeadToolUser(input.currentUser)
  if (!actor || !input.artifact) return null

  const store = input.store ?? platformTaskRunStore

  return store.promotePlatformArtifactToWorkItem({
    enterpriseId: actor.enterpriseId,
    ownerUserId: actor.id,
    sourceArtifactId: input.artifact.id,
    type: inferWorkItemTypeFromArtifact(input.artifact),
    title: input.title ?? input.artifact.title,
    summary: input.summary ?? null,
    metadata: input.metadata ?? null,
  })
}
