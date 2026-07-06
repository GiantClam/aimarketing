import "server-only"

import { tool, type ToolSet } from "ai"
import { z } from "zod"

import type { AuthUser } from "@/lib/auth/session"
import { buildPptExportFileName } from "@/lib/lead-tools/ppt-export-file-name"
import { preparePptPreviewInput } from "@/lib/ai-entry/ppt-brief"
import type {
  PptPreviewDeck,
  PptPreviewResearchBrief,
  PptPreviewRuntimeValue,
  PptPreviewVariant,
} from "@/lib/lead-tools/ppt-preview-data-fixed"
import {
  buildPptRecommendedTemplateSummaries,
  isKnownPptFrontendTemplateId,
} from "@/lib/lead-tools/ppt-preview-data-fixed"
import { getLeadToolPptExecutionTransport } from "@/lib/lead-tools/config"
import {
  getPptWorkerSupportedTemplateIds,
  isPptWorkerTemplateSupported,
} from "@/lib/lead-tools/ppt-worker-capabilities"
import type {
  LeadToolPptDownloadResponse,
  LeadToolPptPreviewResponse,
} from "@/lib/lead-tools/ppt-engines/types"
import { getPptPreviewSessionDeck } from "@/lib/lead-tools/ppt-preview-session-store"
import { buildLeadToolDownload, buildLeadToolPreview } from "@/lib/lead-tools/runtime"

const PPTX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
const HTML_MIME_TYPE_PREFIX = "text/html"
const FACTUAL_PPT_RESEARCH_REQUIRED_PATTERN =
  /(?:现状|最新|趋势|市场|行业|竞品|政策|法规|关税|融资|财报|业绩|地缘|战争|制裁|供应链|进出口|油价|运价|汇率|\bcompany\b|\bmarket\b|\bindustry\b|\bcompetitor\b|\bpolicy\b|\bregulation\b|\btariff\b|\bearnings\b|\bgeopolitical\b|\bsupply chain\b|\blatest\b|\bcurrent state\b)/iu

const pptScenarioSchema = z.enum([
  "marketing-campaign",
  "product-launch",
  "sales-deck",
  "training",
])

const pptLanguageSchema = z.enum(["zh-CN", "en-US"])

const pptTemplateModeSchema = z.enum(["auto-4", "single-template"])

const pptTemplateIdSchema = z.string().trim().refine(isKnownPptFrontendTemplateId, "Unknown PPT template")
const DEFAULT_SINGLE_TEMPLATE_NARRATIVE_ANGLE = "executive-brief" as const

const previewPptDeckInputSchema = z
  .object({
    prompt: z
      .string()
      .trim()
      .min(1)
      .describe("The complete deck brief, including topic, audience, goal, tone, and any must-include points."),
    audience: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Target audience for the deck. Required before preview when the user asks for a generated PPT."),
    goal: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Presentation goal such as executive review, client proposal, fundraising pitch, or training."),
    researchBrief: z
      .union([
        z.string().trim().min(1),
        z.object({
          topic: z.string().trim().min(1),
          keyFacts: z.array(z.string().trim().min(1)).min(1),
          numericEvidence: z.array(z.string().trim().min(1)).optional(),
          risks: z.array(z.string().trim().min(1)).optional(),
          implications: z.array(z.string().trim().min(1)).optional(),
          sourceNotes: z.array(z.string().trim().min(1)).optional(),
          rawSummary: z.string().trim().min(1).optional(),
        }),
      ])
      .optional()
      .describe("Optional research grounding synthesized from web_search results. Use a structured object when available for fact-based, current-event, market, company, or policy decks."),
    scenario: pptScenarioSchema
      .optional()
      .describe("Best-fit business scenario for the deck."),
    language: pptLanguageSchema
      .optional()
      .describe("Deck language. Use zh-CN for Chinese or en-US for English."),
    templateMode: pptTemplateModeSchema
      .optional()
      .describe("Use auto-4 to compare multiple directions, or single-template when the user wants one template family."),
    templateId: pptTemplateIdSchema
      .optional()
      .describe("Required only when templateMode is single-template."),
    pageCount: z
      .number()
      .int()
      .min(4)
      .max(20)
      .optional()
      .describe("Optional requested slide count."),
    tone: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Tone or style direction for the deck."),
    mustInclude: z
      .array(z.string().trim().min(1))
      .max(12)
      .optional()
      .describe("Must-include sections, facts, or messages that need to appear in the deck."),
  })
  .superRefine((value, context) => {
    if (value.templateMode === "single-template" && !value.templateId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "templateId is required when templateMode is single-template",
        path: ["templateId"],
      })
    }
  })

const exportPptDeckInputSchema = z.object({
  previewSessionId: z
    .string()
    .trim()
    .min(1)
    .describe("Preview session returned by preview_ppt_deck."),
  selectedVariantKey: z
    .string()
    .trim()
    .optional()
    .describe("Variant key chosen from preview_ppt_deck. If omitted, the latest recommended variant is exported when available."),
})

type PreviewPptDeckInput = z.infer<typeof previewPptDeckInputSchema>
type ExportPptDeckInput = z.infer<typeof exportPptDeckInputSchema>

function resolveDefaultPreviewRuntime(agentId: string | null | undefined): PptPreviewRuntimeValue | undefined {
  if (agentId === "executive-ppt") return "ppt-master-agent"
  if (agentId === "executive-presentation-ppt") return "frontend-slides-agent"
  return undefined
}

function buildArtifactDownloadUrl(artifactId: number, download = false) {
  return `/api/platform/artifacts/${artifactId}/download${download ? "?download=1" : ""}`
}

function summarizeVariant(variant: PptPreviewVariant) {
  return {
    key: variant.key,
    name: variant.name,
    summary: variant.summary,
    styleKey: variant.styleKey,
    templateId: variant.templateId ?? null,
    narrativeAngle: variant.narrativeAngle ?? null,
    slideCount: variant.slides.length,
    coverTitle: variant.slides[0]?.title ?? null,
  }
}

function summarizeDeck(deck: PptPreviewDeck) {
  return {
    title: deck.title,
    scenario: deck.scenario,
    language: deck.language,
    pageCount: deck.pageCount ?? null,
    resolvedPageCount: deck.resolvedPageCount ?? null,
    variants: deck.variants.map(summarizeVariant),
  }
}

function buildValidationResult(
  checks: Array<{
    code: string
    ok: boolean
    message: string
  }>,
) {
  return {
    ok: checks.every((check) => check.ok),
    checks,
  }
}

function normalizePptToolError(error: unknown) {
  const message =
    error instanceof Error && error.message
      ? error.message
      : typeof error === "string" && error.trim()
        ? error.trim()
        : "ppt_tool_failed"

  const withRawMessage = <T extends { code: string; message: string }>(value: T) =>
    value.message === message
      ? value
      : {
          ...value,
          rawMessage: message,
        }

  if (
    /ppt_master_repo_missing|ppt_master_script_failed|ppt_master_python_missing|ppt_master_runtime_unavailable/iu.test(
      message,
    )
  ) {
    return withRawMessage({
      code: "ppt_master_runtime_unavailable",
      message: "PPT runtime is currently unavailable. Please try again later.",
    })
  }

  if (
    /ppt_master_quality_check_failed|ppt_master_runtime_slide_quality_check_failed|ppt_master_runtime_slide_validation_failed|xml\.etree\.elementtree\.parseerror|invalid xml:/iu.test(
      message,
    )
  ) {
    return withRawMessage({
      code: "ppt_master_quality_check_failed",
      message:
        "Generated editable PPT slides did not pass ppt-master integrity checks. The deck must be regenerated before preview or export can continue.",
    })
  }

  if (/ppt_variant_not_found|selected variant not found/iu.test(message)) {
    const variantKey = message.includes(":") ? message.split(":").slice(1).join(":") : null
    return withRawMessage({
      code: "ppt_variant_not_found",
      message: variantKey
        ? `Selected variant "${variantKey}" was not found. Use a variant key returned by preview_ppt_deck.`
        : "Selected variant was not found. Use a variant key returned by preview_ppt_deck.",
    })
  }

  if (/missing_preview_session/iu.test(message)) {
    const sessionId = message.includes(":") ? message.split(":").slice(1).join(":") : null
    return withRawMessage({
      code: "missing_preview_session",
      message: sessionId
        ? `Preview session "${sessionId}" is no longer available. Generate the PPT preview again before export.`
        : "Preview session is no longer available. Generate the PPT preview again before export.",
    })
  }

  if (/ppt_research_brief_required/iu.test(message)) {
    return withRawMessage({
      code: "ppt_research_brief_required",
      message:
        "This PPT request needs fresh factual grounding before preview. Call web_search first, then provide the researchBrief to preview_ppt_deck.",
    })
  }

  const unsupportedTemplateMatch = message.match(/ppt_worker_template_unsupported:([^\s]+)/iu)
  if (unsupportedTemplateMatch?.[1]) {
    const templateId = unsupportedTemplateMatch[1].trim()
    return {
      code: "ppt_worker_template_unsupported",
      message: `The current editable PPT worker does not support template "${templateId}". Choose one of: ${getPptWorkerSupportedTemplateIds().join(", ")}.`,
    }
  }

  if (
    /your account quota is insufficient|insufficient_quota|provider_quota_exceeded|quota exceeded|please recharge/iu.test(
      message,
    )
  ) {
    return withRawMessage({
      code: "upstream_provider_quota_exceeded",
      message:
        "The upstream PPT model or remote worker account is out of quota. This is separate from workspace credits. Check the provider or PPT worker account before retrying.",
    })
  }

  const unknownModelMatch = message.match(/unknown model ['"]?([^'"]+)['"]?/iu)
  if (unknownModelMatch?.[1]) {
    return withRawMessage({
      code: "ppt_runtime_model_unsupported",
      message: `The current PPT runtime does not support model "${unknownModelMatch[1].trim()}". Switch to MiniMax-M3, MiniMax-M2.7-highspeed, or step-3.7-flash.`,
    })
  }

  return {
    code: "ppt_tool_failed",
    message,
  }
}

function requiresResearchBrief(prompt: string) {
  return FACTUAL_PPT_RESEARCH_REQUIRED_PATTERN.test(prompt)
}

function hasUsableResearchBrief(value: unknown) {
  if (typeof value === "string") {
    return Boolean(value.trim())
  }

  if (value && typeof value === "object") {
    const record = value as {
      topic?: unknown
      keyFacts?: unknown
      rawSummary?: unknown
    }
    const keyFacts = Array.isArray(record.keyFacts)
      ? record.keyFacts.filter((item) => typeof item === "string" && item.trim())
      : []
    const topic = typeof record.topic === "string" && record.topic.trim()
    const rawSummary = typeof record.rawSummary === "string" && record.rawSummary.trim()
    return Boolean(topic && (keyFacts.length > 0 || rawSummary))
  }

  return false
}

function isNonEmptyBuffer(value: unknown) {
  return value instanceof Uint8Array ? value.byteLength > 0 : false
}

function selectDeckVariant(deck: PptPreviewDeck, selectedVariantKey?: string | null) {
  const normalized = typeof selectedVariantKey === "string" ? selectedVariantKey.trim() : ""
  if (normalized) {
    const matched = deck.variants.find((variant) => variant.key === normalized)
    if (!matched) {
      throw new Error(`ppt_variant_not_found:${normalized}`)
    }
    return matched
  }

  const fallback = deck.variants[0]
  if (!fallback) {
    throw new Error("ppt_variant_not_found:first")
  }
  return fallback
}

function shouldLimitTemplatesToRemotePptWorker(defaultPreviewRuntime: PptPreviewRuntimeValue | undefined) {
  return defaultPreviewRuntime === "ppt-master-agent" && getLeadToolPptExecutionTransport() === "remote-worker"
}

export async function exportAiEntryPptDeckArtifact(input: {
  currentUser: AuthUser
  previewSessionId: string
  selectedVariantKey?: string | null
}): Promise<Record<string, unknown>> {
  const { currentUser, previewSessionId, selectedVariantKey } = input
  try {
    const deck = await getPptPreviewSessionDeck(previewSessionId)
    const selectedVariant = selectDeckVariant(deck, selectedVariantKey)
    const result = (await buildLeadToolDownload(
      "ai-ppt-preview",
      {
        deck,
        selectedVariantKey: selectedVariant.key,
        previewSessionId,
      },
      currentUser,
    )) as LeadToolPptDownloadResponse & {
      meta?: {
        platformRunId?: number
        platformArtifactId?: number
        platformWorkItemId?: number
      }
    }

    const artifactId =
      typeof result.meta?.platformArtifactId === "number"
        ? result.meta.platformArtifactId
        : null
    const workItemId =
      typeof result.meta?.platformWorkItemId === "number"
        ? result.meta.platformWorkItemId
        : null
    const toolRunId =
      typeof result.meta?.platformRunId === "number"
        ? result.meta.platformRunId
        : null
    const fileName =
      result.artifact?.fileName ||
      buildPptExportFileName(
        result.deck,
        result.variant,
        result.deck.previewEngine === "frontend-slides-html" ? "html" : "pptx",
      )
    const contentType = result.artifact?.contentType || null
    const expectsHtmlArtifact = result.deck.previewEngine === "frontend-slides-html"
    const artifactKind = expectsHtmlArtifact ? "html" : "pptx"
    const resolvedContentType = expectsHtmlArtifact
      ? contentType || "text/html; charset=utf-8"
      : contentType || PPTX_MIME_TYPE
    const validation = buildValidationResult([
      {
        code: "buffer_non_empty",
        ok: isNonEmptyBuffer(result.artifact?.buffer),
        message:
          isNonEmptyBuffer(result.artifact?.buffer)
            ? "Exported artifact buffer is non-empty."
            : "Exported artifact buffer is empty.",
      },
      {
        code: expectsHtmlArtifact ? "file_name_html" : "file_name_pptx",
        ok: expectsHtmlArtifact
          ? fileName.trim().toLowerCase().endsWith(".html")
          : fileName.trim().toLowerCase().endsWith(".pptx"),
        message:
          expectsHtmlArtifact
            ? fileName.trim().toLowerCase().endsWith(".html")
              ? "Exported artifact file name ends with .html."
              : "Exported artifact file name must end with .html."
            : fileName.trim().toLowerCase().endsWith(".pptx")
              ? "Exported artifact file name ends with .pptx."
              : "Exported artifact file name must end with .pptx.",
      },
      {
        code: expectsHtmlArtifact ? "mime_is_html" : "mime_is_pptx",
        ok: expectsHtmlArtifact
          ? typeof contentType === "string" && contentType.toLowerCase().startsWith(HTML_MIME_TYPE_PREFIX)
          : contentType === PPTX_MIME_TYPE,
        message:
          expectsHtmlArtifact
            ? typeof contentType === "string" && contentType.toLowerCase().startsWith(HTML_MIME_TYPE_PREFIX)
              ? "Exported artifact MIME type is HTML."
              : "Exported artifact MIME type must be HTML."
            : contentType === PPTX_MIME_TYPE
              ? "Exported artifact MIME type is PPTX."
              : "Exported artifact MIME type must be PPTX.",
      },
    ])

    if (!validation.ok) {
      return {
        ok: false,
        error: {
          code: "ppt_export_validation_failed",
          message: "Exported PPTX artifact did not pass validation checks.",
        },
        validation,
      }
    }

    return {
      ok: true,
      previewSessionId,
      title: result.deck.title,
      selectedVariantKey: result.variant.key,
      selectedVariantName: result.variant.name,
      selectedVariant: {
        key: result.variant.key,
        name: result.variant.name,
      },
      slideCount:
        result.deck.resolvedPageCount ??
        result.deck.pageCount ??
        result.variant.slides.length,
      fileName,
      contentType: resolvedContentType,
      artifactId,
      workItemId,
      toolRunId,
      workLibraryHref: "/dashboard/works",
      previewUrl: artifactId ? buildArtifactDownloadUrl(artifactId) : null,
      downloadUrl: artifactId
        ? buildArtifactDownloadUrl(artifactId, true)
        : null,
      artifact: {
        kind: artifactKind,
        title: result.deck.title,
        fileName,
        mimeType: resolvedContentType,
        artifactId,
        previewUrl: artifactId ? buildArtifactDownloadUrl(artifactId) : null,
        downloadUrl: artifactId
          ? buildArtifactDownloadUrl(artifactId, true)
          : null,
        workItemId,
        toolRunId,
      },
      validation,
      message: artifactId
        ? "Deck artifact generated and saved to the work library."
        : "Deck artifact generated.",
    }
  } catch (error) {
    const normalizedError = normalizePptToolError(error)
    const deck = await getPptPreviewSessionDeck(previewSessionId).catch(() => null)
    return {
      ok: false,
      error: normalizedError,
      ...(normalizedError.code === "missing_preview_session" ? { previewSessionId } : {}),
      availableVariants: deck ? deck.variants.map(summarizeVariant) : [],
    }
  }
}

export function buildAiEntryPptTools(input: {
  currentUser: AuthUser
  agentId?: string | null
}): ToolSet {
  const { currentUser } = input
  const defaultPreviewRuntime = resolveDefaultPreviewRuntime(input.agentId)

  return {
    preview_ppt_deck: tool<unknown, Record<string, unknown>>({
      description:
        "Generate a PPT preview deck from a conversation brief. Use this when the user wants a slide deck, PPT, pitch deck, training deck, or presentation draft.",
      inputSchema: previewPptDeckInputSchema as any,
      execute: async (rawInput: unknown): Promise<Record<string, unknown>> => {
        const {
          prompt,
          audience,
          goal,
          researchBrief,
          scenario = "marketing-campaign",
          language = "zh-CN",
          templateMode = "auto-4",
          templateId,
          pageCount,
          tone,
          mustInclude,
        } = rawInput as PreviewPptDeckInput
        try {
          const prepared = preparePptPreviewInput({
            rawInput: {
              prompt,
              audience,
              goal,
              researchBrief,
              scenario,
              language,
              templateMode,
              templateId,
              pageCount,
              tone,
              mustInclude,
            },
            briefState: null,
          })
          if (!prepared.ok) {
            return {
              ok: false,
              error: prepared.error,
              missingFields: prepared.missingFields,
              suggestedBrief: prepared.suggestedBrief,
            }
          }

          if (requiresResearchBrief(prompt) && !hasUsableResearchBrief(researchBrief)) {
            throw new Error("ppt_research_brief_required")
          }

          const limitTemplatesToRemoteWorker = shouldLimitTemplatesToRemotePptWorker(defaultPreviewRuntime)
          const allowedTemplateIds = limitTemplatesToRemoteWorker ? getPptWorkerSupportedTemplateIds() : undefined
          const recommendedTemplates = buildPptRecommendedTemplateSummaries({
            prompt: prepared.input.prompt,
            researchBrief: prepared.input.researchBrief as string | PptPreviewResearchBrief | undefined,
            scenario: prepared.input.scenario,
            language: prepared.input.language,
            pageCount: prepared.input.pageCount ?? undefined,
          }, allowedTemplateIds ? { allowedTemplateIds } : undefined)
          const effectiveTemplateId = prepared.input.templateId ?? templateId
          const effectiveTemplateMode = effectiveTemplateId
            ? "single-template"
            : prepared.input.templateMode ?? templateMode
          if (
            limitTemplatesToRemoteWorker &&
            effectiveTemplateMode === "single-template" &&
            effectiveTemplateId &&
            !isPptWorkerTemplateSupported(effectiveTemplateId)
          ) {
            throw new Error(`ppt_worker_template_unsupported:${effectiveTemplateId}`)
          }
          const effectiveNarrativeAngle =
            effectiveTemplateMode === "single-template" && effectiveTemplateId
              ? DEFAULT_SINGLE_TEMPLATE_NARRATIVE_ANGLE
              : undefined

          const result = (await buildLeadToolPreview(
            "ai-ppt-preview",
            {
              prompt: prepared.input.prompt,
              researchBrief: prepared.input.researchBrief,
              scenario: prepared.input.scenario,
              language: prepared.input.language,
              previewRuntime: defaultPreviewRuntime,
              templateMode: effectiveTemplateMode,
              templateId: effectiveTemplateId,
              narrativeAngle: effectiveNarrativeAngle,
              pageCount: prepared.input.pageCount,
            },
            currentUser,
          )) as LeadToolPptPreviewResponse & {
            meta?: {
              platformRunId?: number
              platformArtifactId?: number
            }
          }

          const validation = buildValidationResult([
            {
              code: "variants_present",
              ok: Array.isArray(result.deck.variants) && result.deck.variants.length > 0,
              message:
                Array.isArray(result.deck.variants) && result.deck.variants.length > 0
                  ? "Preview deck returned at least one variant."
                  : "Preview deck returned no variants.",
            },
          ])

          if (!validation.ok) {
            return {
              ok: false,
              error: {
                code: "ppt_preview_invalid",
                message: "PPT preview returned no variants. Please retry the preview generation.",
              },
              validation,
            }
          }

          return {
            ok: true,
            previewSessionId: result.previewSessionId,
            generatedAt: result.generatedAt,
            recommendedVariantKey: result.deck.variants[0]?.key ?? null,
            recommendedVariantName: result.deck.variants[0]?.name ?? null,
            recommendedTemplates,
            selectedTemplateId: effectiveTemplateId ?? null,
            ...summarizeDeck(result.deck),
            validation,
            platform: {
              previewRunId:
                typeof result.meta?.platformRunId === "number"
                  ? result.meta.platformRunId
                  : null,
              previewArtifactId:
                typeof result.meta?.platformArtifactId === "number"
                  ? result.meta.platformArtifactId
                  : null,
              toolRunId:
                typeof result.meta?.platformRunId === "number"
                  ? result.meta.platformRunId
                  : null,
            },
            nextStep:
              "Review the recommended variant first, then call export_ppt_deck to save the downloadable deck artifact to the work library.",
          }
        } catch (error) {
          const normalizedError = normalizePptToolError(error)
          return {
            ok: false,
            error: normalizedError,
          }
        }
      },
    }),
    export_ppt_deck: tool<unknown, Record<string, unknown>>({
      description:
        "Export the downloadable deck artifact from a previously generated preview session and selected variant. Use this after preview_ppt_deck when the user wants the actual deliverable file.",
      inputSchema: exportPptDeckInputSchema as any,
      execute: async (rawInput: unknown): Promise<Record<string, unknown>> => {
        const { previewSessionId, selectedVariantKey } = rawInput as ExportPptDeckInput
        return exportAiEntryPptDeckArtifact({
          currentUser,
          previewSessionId,
          selectedVariantKey,
        })
      },
    }),
  } as ToolSet
}
