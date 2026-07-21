import { DeleteObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3"

let r2Client: S3Client | null = null
let r2ClientSignature = ""

function normalizeR2EnvValue(value: string | undefined) {
  const trimmed = value?.trim() || ""
  const wrapped = trimmed.match(/^(?:"([\s\S]*)"|'([\s\S]*)')$/u)
  return (wrapped?.[1] ?? wrapped?.[2] ?? trimmed).trim()
}

function getR2Endpoint() {
  const explicitEndpoint = normalizeR2EnvValue(process.env.R2_ENDPOINT).replace(/["']/gu, "")
  if (explicitEndpoint) return explicitEndpoint

  const accountId = normalizeR2EnvValue(process.env.R2_ACCOUNT_ID)
  return accountId ? `https://${accountId}.r2.cloudflarestorage.com` : ""
}

function getR2AccessKeyId() {
  return normalizeR2EnvValue(process.env.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY)
}

function getR2SecretAccessKey() {
  return normalizeR2EnvValue(process.env.R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_KEY)
}

function getR2BucketEnv() {
  return normalizeR2EnvValue(process.env.R2_BUCKET_NAME || process.env.R2_BUCKET)
}

function getR2PublicBaseEnv() {
  return normalizeR2EnvValue(process.env.R2_PUBLIC_BASE || process.env.R2_PUBLIC_URL)
}

function getAccountIdFromEndpoint() {
  const configuredAccountId = normalizeR2EnvValue(process.env.R2_ACCOUNT_ID)
  if (configuredAccountId) return configuredAccountId
  const endpoint = getR2Endpoint()
  if (!endpoint) return ""

  try {
    return new URL(endpoint).hostname.split(".")[0] || ""
  } catch {
    return ""
  }
}

export function getR2PublicBase() {
  const publicBase = getR2PublicBaseEnv()
  if (publicBase) return publicBase.replace(/\/$/, "")
  const accountId = getAccountIdFromEndpoint()
  return accountId ? `https://pub-${accountId}.r2.dev` : ""
}

export function getR2Client() {
  const endpoint = getR2Endpoint()
  const accessKeyId = getR2AccessKeyId()
  const secretAccessKey = getR2SecretAccessKey()
  const bucketName = getR2BucketEnv()
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName) {
    r2Client = null
    r2ClientSignature = ""
    return null
  }

  const signature = `${endpoint}::${accessKeyId}::${bucketName}`
  if (!r2Client || r2ClientSignature !== signature) {
    r2Client = new S3Client({
      region: process.env.AWS_REGION || "auto",
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    })
    r2ClientSignature = signature
  }

  return r2Client
}

export function getR2BucketName() {
  return getR2BucketEnv()
}

export function isR2Available() {
  return Boolean(getR2Client() && getR2PublicBase() && getR2BucketName())
}

export function getR2PublicUrl(storageKey: string) {
  const publicBase = getR2PublicBase()
  if (!publicBase) {
    throw new Error("r2_config_missing")
  }

  return `${publicBase}/${storageKey}`
}

export async function getR2Object(storageKey: string, options?: { bucketName?: string }) {
  const client = getR2Client()
  const bucketName = normalizeR2EnvValue(options?.bucketName) || getR2BucketName()
  if (!client || !bucketName || !storageKey) return null

  const object = await client.send(new GetObjectCommand({ Bucket: bucketName, Key: storageKey }))
  if (!object.Body) return null

  return {
    bytes: await object.Body.transformToByteArray(),
    contentType: object.ContentType || null,
  }
}

export async function deleteR2Object(storageKey: string) {
  const client = getR2Client()
  const bucketName = getR2BucketName()
  if (!client || !bucketName || !storageKey) return false

  await client.send(
    new DeleteObjectCommand({
      Bucket: bucketName,
      Key: storageKey,
    }),
  )

  return true
}
