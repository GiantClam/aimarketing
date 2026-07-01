import "./load-env"

import { CopyObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3"
import { sql } from "drizzle-orm"

import { db, pool } from "@/lib/db"
import * as r2Module from "@/lib/r2"

type CandidateRow = {
  storageKey: string
  mimeType: string | null
  title: string
}

type Args = {
  apply: boolean
  storageKey: string | null
  limit: number | null
}

type CandidateSummary = {
  storageKey: string
  title: string
  artifactMimeType: string | null
  objectContentType: string | null
  normalizedContentType: string
  needsUpdate: boolean
}

function parseArgs(argv: string[]): Args {
  let apply = false
  let storageKey: string | null = null
  let limit: number | null = null

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--apply") {
      apply = true
      continue
    }
    if (arg === "--storage-key") {
      storageKey = String(argv[index + 1] || "").trim() || null
      index += 1
      continue
    }
    if (arg === "--limit") {
      const parsed = Number(argv[index + 1])
      if (Number.isInteger(parsed) && parsed > 0) {
        limit = parsed
      }
      index += 1
    }
  }

  return { apply, storageKey, limit }
}

function isTextLikeArtifact(candidate: Pick<CandidateRow, "mimeType" | "title">) {
  const mimeType = candidate.mimeType?.toLowerCase() || ""
  const title = candidate.title.toLowerCase()
  return mimeType.startsWith("text/") || mimeType.includes("json") || /\.(md|markdown|txt|json|csv|log)$/i.test(title)
}

function normalizeTextContentType(contentType: string | null | undefined) {
  const normalized = typeof contentType === "string" ? contentType.trim() : ""
  if (!normalized) return "text/plain; charset=utf-8"

  const lower = normalized.toLowerCase()
  if (lower.includes("charset=")) return normalized
  if (lower.startsWith("text/") || lower === "application/json" || lower.endsWith("+json")) {
    return `${normalized}; charset=utf-8`
  }
  return normalized
}

function encodeCopySource(bucket: string, storageKey: string) {
  return `${bucket}/${storageKey.split("/").map((segment) => encodeURIComponent(segment)).join("/")}`
}

async function fetchCandidates(args: Args) {
  const filters = [sql`storage_key like 'workflow-inputs/%'`]

  if (args.storageKey) {
    filters.push(sql`storage_key = ${args.storageKey}`)
  }

  const limitClause = args.limit ? sql`limit ${args.limit}` : sql``

  const result = await db.execute(sql`
    select distinct on (storage_key)
      storage_key as "storageKey",
      mime_type as "mimeType",
      title
    from "AI_MARKETING_platform_artifacts"
    where ${sql.join(filters, sql` and `)}
    order by storage_key, id desc
    ${limitClause}
  `)

  return (result.rows as CandidateRow[]).filter(isTextLikeArtifact)
}

async function inspectCandidates(candidates: CandidateRow[]) {
  const client = r2Module.getR2Client()
  const bucket = r2Module.getR2BucketName()
  if (!client || !bucket) {
    throw new Error("r2_config_missing")
  }

  const summaries: CandidateSummary[] = []

  for (const candidate of candidates) {
    const head = await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: candidate.storageKey,
      }),
    )
    const objectContentType = head.ContentType ?? null
    const normalizedContentType = normalizeTextContentType(objectContentType || candidate.mimeType)
    summaries.push({
      storageKey: candidate.storageKey,
      title: candidate.title,
      artifactMimeType: candidate.mimeType,
      objectContentType,
      normalizedContentType,
      needsUpdate: objectContentType !== normalizedContentType,
    })
  }

  return { client, bucket, summaries }
}

async function applyUpdates(input: {
  client: NonNullable<ReturnType<typeof r2Module.getR2Client>>
  bucket: string
  summaries: CandidateSummary[]
}) {
  let updated = 0

  for (const item of input.summaries) {
    if (!item.needsUpdate) continue

    const head = await input.client.send(
      new HeadObjectCommand({
        Bucket: input.bucket,
        Key: item.storageKey,
      }),
    )

    await input.client.send(
      new CopyObjectCommand({
        Bucket: input.bucket,
        Key: item.storageKey,
        CopySource: encodeCopySource(input.bucket, item.storageKey),
        MetadataDirective: "REPLACE",
        ContentType: item.normalizedContentType,
        CacheControl: head.CacheControl,
        ContentDisposition: head.ContentDisposition,
        ContentEncoding: head.ContentEncoding,
        ContentLanguage: head.ContentLanguage,
        Metadata: head.Metadata,
      }),
    )

    updated += 1
  }

  return updated
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const candidates = await fetchCandidates(args)
  const inspected = await inspectCandidates(candidates)
  const needsUpdate = inspected.summaries.filter((item) => item.needsUpdate)

  console.info("workflow-inputs.content-type.backfill.summary", {
    mode: args.apply ? "apply" : "dry-run",
    scanned: inspected.summaries.length,
    needsUpdate: needsUpdate.length,
    sample: inspected.summaries.slice(0, 10),
  })

  if (!args.apply || needsUpdate.length === 0) {
    return
  }

  const updated = await applyUpdates(inspected)
  const rechecked = await inspectCandidates(candidates)

  console.info("workflow-inputs.content-type.backfill.applied", {
    updated,
    remaining: rechecked.summaries.filter((item) => item.needsUpdate).length,
  })
}

main()
  .catch((error) => {
    console.error("workflow-inputs.content-type.backfill.failed", {
      message: error instanceof Error ? error.message : String(error),
    })
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end().catch(() => undefined)
  })
