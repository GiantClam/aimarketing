import { NextRequest, NextResponse } from "next/server"
import { ZodError } from "zod"

import { allowLeadToolMockFallback } from "@/lib/lead-tools/config"
import { generateSeoTitleReportWithFallback } from "@/lib/lead-tools/generation"
import { paidSeoCapabilities, seoTitleInputSchema } from "@/lib/seo-tools/title-report"

export const runtime = "nodejs"
export const maxDuration = 45

const encoder = new TextEncoder()

function encodeEvent(event: string, payload: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`)
}

export async function POST(request: NextRequest) {
  let input: ReturnType<typeof seoTitleInputSchema.parse>
  try {
    input = seoTitleInputSchema.parse(await request.json())
  } catch (error) {
    const message = error instanceof ZodError ? error.issues[0]?.message || "Invalid request body" : "Invalid request body"
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encodeEvent("stage", { stage: "input_analyzing" }))
        controller.enqueue(encodeEvent("stage", { stage: "titles_generating" }))
        const report = await generateSeoTitleReportWithFallback(input, allowLeadToolMockFallback())
        controller.enqueue(encodeEvent("insight_completed", { kind: "intent", value: report.intentHypothesis }))
        controller.enqueue(encodeEvent("stage", { stage: "titles_scoring" }))
        for (const [index, title] of report.candidates.entries()) {
          controller.enqueue(encodeEvent("title_completed", { index, title }))
        }
        controller.enqueue(encodeEvent("stage", { stage: "finalizing" }))
        controller.enqueue(encodeEvent("report_completed", { report }))
        controller.enqueue(encodeEvent("paid_capabilities_available", { capabilities: paidSeoCapabilities }))
      } catch (error) {
        controller.enqueue(
          encodeEvent("error", {
            code: "seo_title_generation_failed",
            retryable: true,
            message: error instanceof Error ? error.message : "Failed to generate SEO title report",
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
