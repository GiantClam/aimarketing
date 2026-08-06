import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { z } from "zod"

const assetIntent = z.object({
  id: z.string().min(1).max(80),
  kind: z.enum(["cover", "inline"]),
  prompt: z.string().min(1).max(2_000),
  placement: z.string().max(200).default(""),
  aspectRatio: z.string().min(1).max(32),
})

const result = z.object({
  schemaVersion: z.literal(1),
  outcome: z.enum(["needs_clarification", "draft_ready"]),
  operation: z.enum(["create", "revise", "translate", "shorten", "expand", "adapt_platform", "research"]),
  platform: z.string().min(1).max(64),
  userMessage: z.string().min(1).max(8_000),
  draft: z.object({
    title: z.string().max(500),
    content: z.string().min(1).max(100_000),
    baseRevision: z.number().int().nonnegative().nullable(),
  }).nullable().default(null),
  research: z.object({ requested: z.boolean(), completed: z.boolean(), sourceUrls: z.array(z.string().url()).max(20) }),
  assetIntents: z.array(assetIntent).max(12),
})

type WriterResultRecord = Record<string, unknown>

function runtimeDir() {
  let current = process.cwd()
  for (let depth = 0; depth < 5; depth += 1) {
    if (existsSync(join(current, ".runtime", "writer-context.json"))) return join(current, ".runtime")
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return join(process.cwd(), ".runtime")
}

function record(value: unknown): WriterResultRecord | null {
  return value && typeof value === "object" ? value as WriterResultRecord : null
}

function currentRevision() {
  try {
    const context = JSON.parse(readFileSync(join(runtimeDir(), "writer-context.json"), "utf8")) as WriterResultRecord
    return typeof context.activeRevision === "number" && Number.isInteger(context.activeRevision) && context.activeRevision >= 0
      ? context.activeRevision
      : 0
  } catch {
    return 0
  }
}

function normalizeResult(args: unknown) {
  const input = record(args)
  if (!input) return args
  if (input.schemaVersion === 1 && (typeof input.outcome === "string" || input.outcome === undefined) && (typeof input.operation === "string" || input.operation === undefined)) {
    const draft = record(input.draft)
    return {
      ...input,
      schemaVersion: 1,
      outcome: input.outcome === "needs_clarification" ? "needs_clarification" : "draft_ready",
      operation: typeof input.operation === "string" && input.operation ? input.operation : "create",
      platform: typeof input.platform === "string" && input.platform ? input.platform : "公众号",
      userMessage: typeof input.userMessage === "string" && input.userMessage ? input.userMessage : "draft_ready",
      draft: draft
        ? { ...draft, title: typeof draft.title === "string" ? draft.title : "", content: typeof draft.content === "string" ? draft.content : (typeof draft.body === "string" ? draft.body : ""), baseRevision: typeof draft.baseRevision === "number" ? draft.baseRevision : currentRevision() }
        : null,
      research: record(input.research) || { requested: false, completed: false, sourceUrls: [] },
      assetIntents: Array.isArray(input.assetIntents) ? input.assetIntents.map((value, index) => {
        const item = record(value) || {}
        const kind = item.kind === "inline" || item.type === "inline" ? "inline" : "cover"
        return {
          ...item,
          id: typeof item.id === "string" && item.id ? item.id : (typeof item.slot === "string" && item.slot ? item.slot : `${kind}-${index + 1}`),
          kind,
          prompt: typeof item.prompt === "string" ? item.prompt : (typeof item.description === "string" ? item.description : `${kind} image`),
          placement: typeof item.placement === "string" ? item.placement : "",
          aspectRatio: typeof item.aspectRatio === "string" ? item.aspectRatio : (kind === "cover" ? "16:9" : "4:3"),
        }
      }) : [],
    }
  }

  const legacyOperation = record(input.operation)
  const legacyOutcome = record(input.outcome)
  const operationType = typeof legacyOperation?.type === "string" ? legacyOperation.type : "draft"
  const operation = operationType === "draft" ? "create" : operationType
  const outcome = legacyOutcome?.status === "needs_clarification" || legacyOutcome?.needsClarification === true ? "needs_clarification" : "draft_ready"
  const legacyDraft = input.draft
  const draftContent = typeof legacyDraft === "string"
    ? legacyDraft
    : (record(legacyDraft)?.content ?? record(legacyDraft)?.body)
  const draftRecord = record(legacyDraft)
  const titleMatch = typeof draftContent === "string" ? draftContent.match(/^#\s+(.+)$/mu) : null
  const draftBaseRevision = typeof draftRecord?.baseRevision === "number"
    ? draftRecord.baseRevision
    : typeof legacyOperation?.baseRevision === "number"
      ? legacyOperation.baseRevision
      : currentRevision()
  const legacyResearch = record(input.research)
  const legacySources = Array.isArray(legacyResearch?.sources)
    ? legacyResearch.sources.filter((value): value is string => typeof value === "string")
    : []
  const legacyAssets = Array.isArray(input.assetIntents) ? input.assetIntents : []
  return {
    schemaVersion: 1,
    outcome,
    operation,
    platform: typeof input.platform === "string" ? input.platform : "公众号",
    userMessage: typeof input.userMessage === "string" ? input.userMessage : "",
    draft: outcome === "draft_ready" && typeof draftContent === "string"
      ? { title: typeof draftRecord?.title === "string" ? draftRecord.title : (titleMatch?.[1]?.trim() || ""), content: draftContent, baseRevision: draftBaseRevision }
      : null,
    research: {
      requested: legacyResearch?.status === "requested" || legacySources.length > 0,
      completed: legacyResearch?.status === "completed" || legacyResearch?.status === "ready" || legacySources.length > 0,
      sourceUrls: legacySources,
    },
    assetIntents: legacyAssets.map((value, index) => {
      const item = record(value) || {}
      const kind = item.kind === "inline" || item.type === "inline" ? "inline" : "cover"
      return {
        id: typeof item.id === "string" && item.id ? item.id : `${kind}-${index + 1}`,
        kind,
        prompt: typeof item.prompt === "string" ? item.prompt : (typeof item.description === "string" ? item.description : `${kind} image`),
        placement: typeof item.placement === "string" ? item.placement : "",
        aspectRatio: typeof item.aspectRatio === "string" ? item.aspectRatio : (kind === "cover" ? "16:9" : "4:3"),
      }
    }),
  }
}

export default {
  description: "Submit exactly one structured Writer result for application validation and persistence.",
  args: {
    schemaVersion: z.union([z.literal(1), z.string()]).optional(),
    outcome: z.unknown().optional(),
    operation: z.unknown().optional(),
    platform: z.unknown().optional(),
    userMessage: z.string().optional(),
    draft: z.unknown().optional(),
    research: z.unknown().optional(),
    assetIntents: z.array(z.unknown()).optional(),
  },
  async execute(args: unknown) {
    const parsed = result.parse(normalizeResult(args))
    const outputDir = runtimeDir()
    mkdirSync(outputDir, { recursive: true })
    const outputPath = join(outputDir, "writer-submit-result.json")
    if (existsSync(outputPath)) throw new Error("writer_result_already_submitted")
    writeFileSync(outputPath, JSON.stringify(parsed), { encoding: "utf8", mode: 0o600 })
    return JSON.stringify({ accepted: true, outcome: parsed.outcome })
  },
}
