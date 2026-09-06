import { z } from "zod"
import { validateWriterResultInvariants } from "@coworkany/writer-core"

export const WRITER_RESULT_SCHEMA_VERSION = 1 as const

const assetIntentSchema = z.object({
  id: z.string().min(1).max(80),
  kind: z.enum(["cover", "inline"]),
  prompt: z.string().min(1).max(2_000),
  placement: z.string().max(200).default(""),
  aspectRatio: z.string().min(1).max(32),
})

export const writerSubmitResultSchema = z.object({
  schemaVersion: z.literal(WRITER_RESULT_SCHEMA_VERSION),
  outcome: z.enum(["needs_clarification", "draft_ready"]),
  operation: z.enum(["create", "revise", "translate", "shorten", "expand", "adapt_platform", "research"]),
  platform: z.string().min(1).max(64),
  userMessage: z.string().min(1).max(8_000),
  draft: z.object({
    title: z.string().max(500),
    content: z.string().min(1).max(100_000),
    baseRevision: z.number().int().nonnegative().nullable(),
  }).nullable().default(null),
  research: z.object({
    requested: z.boolean(),
    completed: z.boolean(),
    sourceUrls: z.array(z.string().url()).max(20),
  }),
  assetIntents: z.array(assetIntentSchema).max(12),
})

export type WriterSubmitResult = z.infer<typeof writerSubmitResultSchema>

export function validateWriterSubmitResult(value: unknown) {
  const parsed = writerSubmitResultSchema.safeParse(value)
  if (!parsed.success) throw new Error(`writer_result_invalid:${parsed.error.issues[0]?.path.join(".") || "unknown"}`)
  return validateWriterResultInvariants(parsed.data)
}
