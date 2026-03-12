import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

type WriterUploadResult = {
  url: string
  storageKey: string
  contentType: string
}

const R2_ENDPOINT =
  process.env.R2_ENDPOINT ||
  (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : "")
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY || ""
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_KEY || ""
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || process.env.R2_BUCKET || ""
const R2_PUBLIC_BASE = process.env.R2_PUBLIC_BASE || process.env.R2_PUBLIC_URL || ""

let r2Client: S3Client | null = null

function getR2Client() {
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

function getAccountIdFromEndpoint() {
  if (process.env.R2_ACCOUNT_ID) return process.env.R2_ACCOUNT_ID
  if (!R2_ENDPOINT) return ""

  try {
    const hostname = new URL(R2_ENDPOINT).hostname
    return hostname.split(".")[0] || ""
  } catch {
    return ""
  }
}

function getPublicBase() {
  if (R2_PUBLIC_BASE) {
    return R2_PUBLIC_BASE.replace(/\/$/, "")
  }

  const accountId = getAccountIdFromEndpoint()
  return accountId ? `https://pub-${accountId}.r2.dev` : ""
}

function dataUrlToBuffer(dataUrl: string) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl)
  if (!match) {
    throw new Error("writer_asset_data_url_invalid")
  }

  const [, contentType, base64] = match
  return {
    contentType,
    buffer: Buffer.from(base64, "base64"),
  }
}

function getFileExtension(contentType: string) {
  if (contentType === "image/jpeg") return "jpg"
  if (contentType === "image/webp") return "webp"
  if (contentType === "image/gif") return "gif"
  return "png"
}

export function isWriterR2Available() {
  return Boolean(getR2Client() && getPublicBase())
}

export async function uploadWriterImageToR2(params: {
  userId: number
  conversationId?: string | null
  assetId: string
  dataUrl: string
}): Promise<WriterUploadResult> {
  const client = getR2Client()
  const publicBase = getPublicBase()

  if (!client || !publicBase) {
    throw new Error("writer_r2_config_missing")
  }

  const { contentType, buffer } = dataUrlToBuffer(params.dataUrl)
  const ext = getFileExtension(contentType)
  const conversationPart = params.conversationId || "draft"
  const storageKey = `writer/${params.userId}/${conversationPart}/${Date.now()}-${params.assetId}.${ext}`

  await client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: storageKey,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  )

  return {
    url: `${publicBase}/${storageKey}`,
    storageKey,
    contentType,
  }
}
