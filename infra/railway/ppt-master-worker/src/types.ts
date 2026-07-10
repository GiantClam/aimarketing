import { z } from "zod"

import * as pptWorkerCapabilitiesModule from "../../../../lib/lead-tools/ppt-worker-capabilities.js"

const pptWorkerCapabilities = (
  "default" in pptWorkerCapabilitiesModule ? pptWorkerCapabilitiesModule.default : pptWorkerCapabilitiesModule
) as typeof pptWorkerCapabilitiesModule

export const previewRequestSchema = z.object({
  requestId: z.string().min(1),
  prompt: z.string().min(1),
  researchBrief: z
    .union([
      z.string().min(1),
      z.object({
        topic: z.string().min(1),
        keyFacts: z.array(z.string().min(1)),
        numericEvidence: z.array(z.string().min(1)).optional(),
        risks: z.array(z.string().min(1)).optional(),
        implications: z.array(z.string().min(1)).optional(),
        sourceNotes: z.array(z.string().min(1)).optional(),
        rawSummary: z.string().min(1).optional(),
      }),
    ])
    .optional(),
  scenario: z.enum(["marketing-campaign", "product-launch", "sales-deck", "training"]),
  language: z.enum(["zh-CN", "en-US"]),
  model: z
    .enum([
      "MiniMax-M2.7-highspeed",
      "MiniMax-M3",
      "deepseek-v4-pro",
      "gpt-5.4",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "step-3.7-flash",
    ])
    .optional(),
  runtimeSlideModel: z.string().trim().min(1).optional(),
  runtimeSlideProvider: z.string().trim().min(1).optional(),
  preferredProviderId: z.string().trim().min(1).optional(),
  templateMode: z.enum(["auto-4", "single-template"]),
  templateId: z
    .string()
    .trim()
    .refine(pptWorkerCapabilities.isPptWorkerTemplateSupported, "Unknown PPT template")
    .optional(),
  narrativeAngle: z.enum(["executive-brief", "campaign-story", "data-proof", "action-plan"]).optional(),
  pageCount: z.number().int().min(4).max(20).nullable().optional(),
  images: z
    .array(
      z.object({
        url: z.string().min(1),
        title: z.string().min(1).nullable().optional(),
        mimeType: z.string().min(1).nullable().optional(),
        sourceNodeKey: z.string().min(1).nullable().optional(),
        role: z.enum(["cover", "content", "logo", "reference"]).optional(),
      }),
    )
    .optional(),
  allowMockFallback: z.boolean(),
  runtimeProfile: z.enum(["local-dev", "railway-linux"]),
})

export const exportRequestSchema = z.object({
  requestId: z.string().min(1),
  previewSessionId: z.string().min(1),
  selectedVariantKey: z.string().min(1),
})

export type PreviewRequest = z.infer<typeof previewRequestSchema>
export type ExportRequest = z.infer<typeof exportRequestSchema>
