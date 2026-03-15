import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

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

function getPublicBase() {
  if (R2_PUBLIC_BASE) return R2_PUBLIC_BASE.replace(/\/$/, "")
  const accountId = getAccountIdFromEndpoint()
  return accountId ? `https://pub-${accountId}.r2.dev` : ""
}

function getClient() {
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

function extensionFromMimeType(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg"
  if (mimeType === "image/webp") return "webp"
  if (mimeType === "image/gif") return "gif"
  return "png"
}

export function isImageAssistantR2Available() {
  return Boolean(getClient() && getPublicBase())
}

export function dataUrlToBuffer(dataUrl: string) {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl)
  if (!match) {
    throw new Error("image_assistant_data_url_invalid")
  }

  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  }
}

export async function uploadImageAssistantBuffer(params: {
  userId: number
  sessionId?: string | null
  assetType: string
  mimeType: string
  buffer: Buffer
  suggestedName?: string | null
}) {
  const client = getClient()
  const publicBase = getPublicBase()
  if (!client || !publicBase) {
    throw new Error("image_assistant_r2_config_missing")
  }

  const ext = extensionFromMimeType(params.mimeType)
  const safeName = (params.suggestedName || params.assetType || "asset").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 40)
  const sessionPart = params.sessionId || "draft"
  const storageKey = `image-assistant/${params.userId}/${sessionPart}/${params.assetType}/${Date.now()}-${safeName}.${ext}`

  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: storageKey,
      Body: params.buffer,
      ContentType: params.mimeType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  )

  return {
    storageKey,
    publicUrl: `${publicBase}/${storageKey}`,
  }
}

export async function uploadImageAssistantDataUrl(params: {
  userId: number
  sessionId?: string | null
  assetType: string
  dataUrl: string
  suggestedName?: string | null
}) {
  const parsed = dataUrlToBuffer(params.dataUrl)
  return uploadImageAssistantBuffer({
    userId: params.userId,
    sessionId: params.sessionId,
    assetType: params.assetType,
    mimeType: parsed.mimeType,
    buffer: parsed.buffer,
    suggestedName: params.suggestedName,
  })
}
