import { S3Client } from "@aws-sdk/client-s3"

const R2_ENDPOINT =
  process.env.R2_ENDPOINT ||
  (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : "")
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY || ""
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_KEY || ""
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || process.env.R2_BUCKET || ""
const R2_PUBLIC_BASE = process.env.R2_PUBLIC_BASE || process.env.R2_PUBLIC_URL || ""

let r2Client: S3Client | null = null

function getAccountIdFromEndpoint() {
  if (process.env.R2_ACCOUNT_ID) return process.env.R2_ACCOUNT_ID
  if (!R2_ENDPOINT) return ""

  try {
    return new URL(R2_ENDPOINT).hostname.split(".")[0] || ""
  } catch {
    return ""
  }
}

export function getR2PublicBase() {
  if (R2_PUBLIC_BASE) return R2_PUBLIC_BASE.replace(/\/$/, "")
  const accountId = getAccountIdFromEndpoint()
  return accountId ? `https://pub-${accountId}.r2.dev` : ""
}

export function getR2Client() {
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    return null
  }

  if (!r2Client) {
    r2Client = new S3Client({
      region: process.env.AWS_REGION || "auto",
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    })
  }

  return r2Client
}

export function getR2BucketName() {
  return R2_BUCKET_NAME
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
