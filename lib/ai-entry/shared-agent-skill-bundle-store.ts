import { HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

import type { SharedSkillSetSelection } from "@/lib/ai-runtime/contracts"
import { buildSharedSkillSetBundle, type SharedSkillSetBundle } from "./shared-agent-skill-bundle"

type BundleStore = {
  readChecksum(key: string): Promise<string | null>
  put(key: string, bundle: SharedSkillSetBundle): Promise<void>
}

/** Vercel env values can arrive with shell-style wrapping quotes. */
export function normalizeQuotedEnvValue(value: string | undefined) {
  const trimmed = value?.trim() || ""
  const quoted = trimmed.match(/^(?:"([\s\S]*)"|'([\s\S]*)')$/u)
  return (quoted?.[1] ?? quoted?.[2] ?? trimmed).trim()
}

export function normalizeR2Endpoint(value: string | undefined) {
  return normalizeQuotedEnvValue(value).replace(/["']/gu, "")
}

function r2Endpoint() {
  const explicitEndpoint = normalizeR2Endpoint(process.env.SHARED_AGENT_SKILL_R2_ENDPOINT || process.env.R2_ENDPOINT)
  if (explicitEndpoint) return explicitEndpoint
  const accountId = normalizeQuotedEnvValue(process.env.R2_ACCOUNT_ID)
  return accountId ? `https://${accountId}.r2.cloudflarestorage.com` : ""
}

function r2Bucket() {
  return normalizeQuotedEnvValue(process.env.SHARED_AGENT_SKILL_R2_BUCKET)
}

function createStore(): BundleStore | null {
  const endpoint = r2Endpoint()
  const accessKeyId = normalizeQuotedEnvValue(process.env.SHARED_AGENT_SKILL_R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY)
  const secretAccessKey = normalizeQuotedEnvValue(process.env.SHARED_AGENT_SKILL_R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_KEY)
  const bucket = r2Bucket()
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) return null
  const client = new S3Client({ region: "auto", endpoint, credentials: { accessKeyId, secretAccessKey } })
  return {
    async readChecksum(key) {
      try {
        const response = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
        return response.Metadata?.checksum || null
      } catch (error) {
        const record = error && typeof error === "object" ? error as { name?: unknown; $metadata?: { httpStatusCode?: unknown } } : {}
        const name = typeof record.name === "string" ? record.name : ""
        if (name === "NotFound" || name === "NoSuchKey" || record.$metadata?.httpStatusCode === 404) return null
        throw error
      }
    },
    async put(key, bundle) {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: JSON.stringify(bundle),
        ContentType: "application/json; charset=utf-8",
        Metadata: { checksum: bundle.checksum, schema: "1" },
      }))
    },
  }
}

export async function upsertSharedSkillSetBundle(input: {
  selection: SharedSkillSetSelection
  agentInstructions: string
  store?: BundleStore | null
}) {
  const bundle = await buildSharedSkillSetBundle(input)
  const store = input.store === undefined ? createStore() : input.store
  if (!store) return { bundle, written: false, configured: false }
  const existingChecksum = await store.readChecksum(input.selection.bundleKey)
  if (existingChecksum === bundle.checksum) return { bundle, written: false, configured: true }
  await store.put(input.selection.bundleKey, bundle)
  return { bundle, written: true, configured: true }
}
