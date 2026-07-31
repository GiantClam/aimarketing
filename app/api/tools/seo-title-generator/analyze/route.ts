import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"

import { requireSessionUser } from "@/lib/auth/guards"
import { allowLeadToolMockFallback } from "@/lib/lead-tools/config"
import {
  generateSeoTitleReportWithFallback,
  type SeoTitleProviderOptions,
} from "@/lib/lead-tools/generation"
import { getEnterpriseTextRuntimeProviderConfigsForUser } from "@/lib/platform/enterprise-runtime-config"
import {
  getConfiguredAiEntryProviderForModel,
} from "@/lib/ai-entry/provider-routing"
import { paidSeoCapabilities, seoTitleInputSchema } from "@/lib/seo-tools/title-report"

export const runtime = "nodejs"
export const maxDuration = 45

const encoder = new TextEncoder()

function encodeEvent(event: string, payload: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
}

function getPublicGenerationError(error: unknown) {
  if (error instanceof ZodError) {
    return "The generated report was incomplete. Please try again."
  }

  return "Unable to generate the SEO title report right now. Please try again."
}

export async function POST(request: NextRequest) {
  let input: ReturnType<typeof seoTitleInputSchema.parse>
  try {
    input = seoTitleInputSchema.parse(await request.json())
  } catch (error) {
    const message = error instanceof ZodError ? error.issues[0]?.message || "Invalid request body" : "Invalid request body"
    return NextResponse.json({ error: message }, { status: 400 })
  }

  let providerOptions: SeoTitleProviderOptions | undefined
  try {
    const auth = await requireSessionUser(request)
    if (!("response" in auth) && auth.user.isDemo) {
      const requestedModel =
        process.env.LEAD_TOOLS_SEO_TITLE_PREVIEW_MODEL?.trim() ||
        process.env.LEAD_TOOLS_SEO_PREVIEW_MODEL?.trim() ||
        "deepseek-v4-flash"
      const isGrokModel = /^grok(?:[-_.]|$)/iu.test(requestedModel)
      if (isGrokModel) {
        const grokProvider = getConfiguredAiEntryProviderForModel("pptoken", requestedModel)
        if (grokProvider) {
          providerOptions = {
            preferredProviderId: "pptoken",
            preferredModel: requestedModel,
            forcePreferredProvider: true,
            disableProviderFailover: true,
            disableSameProviderModelFallback: true,
            providerConfigs: [grokProvider],
          }
        }
      }
      const enterpriseRuntime = await getEnterpriseTextRuntimeProviderConfigsForUser(auth.user)
      if (!providerOptions && enterpriseRuntime?.selectedProviderId && enterpriseRuntime.providerConfigs.length > 0) {
        providerOptions = {
          preferredProviderId: enterpriseRuntime.selectedProviderId,
          preferredModel: requestedModel,
          forcePreferredProvider: true,
          disableProviderFailover: true,
          disableSameProviderModelFallback: true,
          providerConfigs: enterpriseRuntime.providerConfigs,
        }
      }
    }
  } catch {
    // Public SEO generation remains available without a session cookie.
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encodeEvent("stage", { stage: "input_analyzing" }))
        controller.enqueue(encodeEvent("stage", { stage: "titles_generating" }))
        const report = await generateSeoTitleReportWithFallback(
          input,
          allowLeadToolMockFallback(),
          providerOptions,
        )
        controller.enqueue(encodeEvent("insight_completed", { kind: "intent", value: report.intentHypothesis }))
        controller.enqueue(encodeEvent("stage", { stage: "titles_scoring" }))
        for (const [index, title] of report.candidates.entries()) {
          controller.enqueue(encodeEvent("title_completed", { index, title }))
        }
        controller.enqueue(encodeEvent("stage", { stage: "finalizing" }))
        controller.enqueue(encodeEvent("report_completed", { report }))
        controller.enqueue(encodeEvent("paid_capabilities_available", { capabilities: paidSeoCapabilities }))
      } catch (error) {
        console.error("lead-tools.seo-title.generation-failed", {
          message: error instanceof Error ? error.message : String(error),
        })
        controller.enqueue(
          encodeEvent("error", {
            code: "seo_title_generation_failed",
            retryable: true,
            message: getPublicGenerationError(error),
          }),
        )
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
