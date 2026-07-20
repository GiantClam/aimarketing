import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

type ApiEnvelope<T> = {
  success?: boolean
  errors?: Array<{ code?: number; message?: string }>
  result?: T
}

type PermissionGroup = { id?: string; name?: string }
type CreatedToken = { id?: string; value?: string }
type VerifiedToken = { id?: string }

const apiBase = "https://api.cloudflare.com/client/v4"
const bootstrapKey = "CLOUDFLARE_BOOTSTRAP_API_TOKEN"
const managedKeys = [
  "SHARED_AGENT_SKILL_R2_ENDPOINT",
  "SHARED_AGENT_SKILL_R2_BUCKET",
  "SHARED_AGENT_SKILL_R2_ACCESS_KEY_ID",
  "SHARED_AGENT_SKILL_R2_SECRET_ACCESS_KEY",
]

function argument(name: string) {
  const position = process.argv.indexOf(name)
  return position >= 0 ? process.argv[position + 1]?.trim() : undefined
}

function required(value: string | undefined, label: string) {
  if (!value) throw new Error(`missing_${label}`)
  return value
}

function envValue(text: string, key: string) {
  const match = text.match(new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=\\s*(.*?)\\s*$`, "m"))
  if (!match) return undefined
  const value = match[1]
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1)
  return value
}

function apiError(body: ApiEnvelope<unknown>, fallback: string) {
  return body.errors?.map((error) => error.message || `cloudflare_${error.code || "error"}`).join(", ") || fallback
}

async function api<T>(token: string, path: string, options?: RequestInit) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
      ...options?.headers,
    },
  })
  const body = await response.json() as ApiEnvelope<T>
  if (!response.ok || body.success !== true) throw new Error(apiError(body, `cloudflare_api_${response.status}`))
  return body.result as T
}

function replaceEnvValues(text: string, values: Record<string, string>, removeBootstrap: boolean) {
  const remaining = text.split(/\r?\n/).filter((line) => !managedKeys.some((key) => new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`).test(line)) && (!removeBootstrap || !new RegExp(`^\\s*(?:export\\s+)?${bootstrapKey}\\s*=`).test(line)))
  while (remaining.length > 0 && !remaining.at(-1)?.trim()) remaining.pop()
  return `${remaining.join("\n")}\n\n# Shared-agent skill bundle R2 (generated locally; do not commit)\n${Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n")}\n`
}

async function bestEffortRevoke(token: string, accountId: string) {
  try {
    const verified = await api<VerifiedToken>(token, `/accounts/${accountId}/tokens/verify`)
    const tokenId = required(verified.id, "bootstrap_token_id")
    await api<unknown>(token, `/accounts/${accountId}/tokens/${tokenId}`, { method: "DELETE" })
    return true
  } catch {
    return false
  }
}

async function main() {
  const envPath = resolve(argument("--env-file") || ".env.local")
  const envText = await readFile(envPath, "utf8")
  const bootstrapToken = required(process.env[bootstrapKey]?.trim() || envValue(envText, bootstrapKey)?.trim(), "cloudflare_bootstrap_api_token")
  const accountId = required(argument("--account-id") || process.env.CLOUDFLARE_ACCOUNT_ID?.trim() || envValue(envText, "CLOUDFLARE_ACCOUNT_ID")?.trim(), "cloudflare_account_id")
  const bucket = argument("--bucket") || process.env.SHARED_AGENT_SKILL_R2_BUCKET?.trim() || envValue(envText, "SHARED_AGENT_SKILL_R2_BUCKET")?.trim() || "aimarketing-shared-agent-runtime"

  const permissionGroups = await api<PermissionGroup[]>(bootstrapToken, `/accounts/${accountId}/tokens/permission_groups`)
  const writeGroup = permissionGroups.find((group) => group.name?.trim() === "Workers R2 Storage Bucket Item Write")
  const permissionGroupId = required(writeGroup?.id, "r2_bucket_item_write_permission_group")
  const bucketResource = `com.cloudflare.edge.r2.bucket.${accountId}_default_${bucket}`
  const created = await api<CreatedToken>(bootstrapToken, `/accounts/${accountId}/tokens`, {
    method: "POST",
    body: JSON.stringify({
      name: `shared-agent-runtime-local-${new Date().toISOString().slice(0, 10)}`,
      policies: [{ effect: "allow", permission_groups: [{ id: permissionGroupId }], resources: { [bucketResource]: "*" } }],
    }),
  })
  const accessKeyId = required(created.id, "r2_access_key_id")
  const tokenValue = required(created.value, "r2_token_value")
  const secretAccessKey = createHash("sha256").update(tokenValue).digest("hex")
  const values = {
    SHARED_AGENT_SKILL_R2_ENDPOINT: `https://${accountId}.r2.cloudflarestorage.com`,
    SHARED_AGENT_SKILL_R2_BUCKET: bucket,
    SHARED_AGENT_SKILL_R2_ACCESS_KEY_ID: accessKeyId,
    SHARED_AGENT_SKILL_R2_SECRET_ACCESS_KEY: secretAccessKey,
  }
  const bootstrapRevoked = await bestEffortRevoke(bootstrapToken, accountId)
  await writeFile(envPath, replaceEnvValues(envText, values, bootstrapRevoked), "utf8")
  console.log(JSON.stringify({ event: "shared_agent_r2_credentials_configured", envFile: envPath, bucket, accountId, bootstrapRevoked }))
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
