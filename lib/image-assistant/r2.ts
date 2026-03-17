import { randomUUID } from "crypto"

import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

import { getR2BucketName, getR2Client, getR2PublicUrl, isR2Available } from "@/lib/r2"

function extensionFromMimeType(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg"
  if (mimeType === "image/webp") return "webp"
  if (mimeType === "image/gif") return "gif"
  return "png"
}

function buildImageAssistantStorageKey(params: {
  userId: number
  sessionId?: string | null
  assetType: string
  mimeType: string
  suggestedName?: string | null
}) {
  const ext = extensionFromMimeType(params.mimeType)
  const safeName = (params.suggestedName || params.assetType || "asset").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 40)
  const sessionPart = params.sessionId || "draft"
  return `image-assistant/${params.userId}/${sessionPart}/${params.assetType}/${Date.now()}-${randomUUID().slice(0, 8)}-${safeName}.${ext}`
}

export function isImageAssistantR2Available() {
  return isR2Available()
}

export function getImageAssistantPublicUrl(storageKey: string) {
  try {
    return getR2PublicUrl(storageKey)
  } catch {
    throw new Error("image_assistant_r2_config_missing")
  }
}

export function isImageAssistantStorageKeyOwnedByUser(userId: number, storageKey: string) {
  return storageKey.startsWith(`image-assistant/${userId}/`)
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

export async function createImageAssistantUploadUrl(params: {
  userId: number
  sessionId?: string | null
  assetType: string
  mimeType: string
  suggestedName?: string | null
  expiresInSeconds?: number
}) {
  const client = getR2Client()
  if (!client) {
    throw new Error("image_assistant_r2_config_missing")
  }

  const storageKey = buildImageAssistantStorageKey(params)
  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: getR2BucketName(),
      Key: storageKey,
      ContentType: params.mimeType,
    }),
    { expiresIn: Math.max(60, Math.min(params.expiresInSeconds || 900, 3600)) },
  )

  return {
    uploadUrl,
    storageKey,
    publicUrl: getImageAssistantPublicUrl(storageKey),
    headers: {
      "Content-Type": params.mimeType,
    },
  }
}

export async function headImageAssistantObject(storageKey: string) {
  const client = getR2Client()
  if (!client) {
    throw new Error("image_assistant_r2_config_missing")
  }

  try {
    const result = await client.send(
      new HeadObjectCommand({
        Bucket: getR2BucketName(),
        Key: storageKey,
      }),
    )

    return {
      contentType: result.ContentType || "application/octet-stream",
      fileSize: Number(result.ContentLength || 0),
      publicUrl: getImageAssistantPublicUrl(storageKey),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/not[\s_-]?found|no such key|unknownerror/i.test(message)) {
      return null
    }
    throw error
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
  const client = getR2Client()
  if (!client) {
    throw new Error("image_assistant_r2_config_missing")
  }

  const storageKey = buildImageAssistantStorageKey(params)

  await client.send(
    new PutObjectCommand({
      Bucket: getR2BucketName(),
      Key: storageKey,
      Body: params.buffer,
      ContentType: params.mimeType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  )

  return {
    storageKey,
    publicUrl: getImageAssistantPublicUrl(storageKey),
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
