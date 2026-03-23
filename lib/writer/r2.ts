import { PutObjectCommand } from "@aws-sdk/client-s3"

import { getR2BucketName, getR2Client, getR2PublicUrl, isR2Available } from "@/lib/r2"

type WriterUploadResult = {
  url: string
  storageKey: string
  contentType: string
}

export function parseWriterDataUrl(dataUrl: string) {
  const normalized = dataUrl.trim()
  if (!normalized.startsWith("data:")) {
    throw new Error("writer_asset_data_url_invalid")
  }

  const commaIndex = normalized.indexOf(",")
  if (commaIndex <= 5) {
    throw new Error("writer_asset_data_url_invalid")
  }

  const metadata = normalized.slice(5, commaIndex)
  const payload = normalized.slice(commaIndex + 1)
  const metadataParts = metadata
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)

  const contentType = metadataParts[0] || "application/octet-stream"
  const isBase64 = metadataParts.slice(1).some((part) => part.toLowerCase() === "base64")
  if (!isBase64) {
    throw new Error("writer_asset_data_url_invalid")
  }

  const base64 = payload.replace(/\s+/g, "")
  if (!base64) {
    throw new Error("writer_asset_data_url_invalid")
  }

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
  return isR2Available()
}

export async function uploadWriterImageToR2(params: {
  userId: number
  conversationId?: string | null
  assetId: string
  dataUrl: string
}): Promise<WriterUploadResult> {
  const client = getR2Client()

  if (!client) {
    throw new Error("writer_r2_config_missing")
  }

  const { contentType, buffer } = parseWriterDataUrl(params.dataUrl)
  const ext = getFileExtension(contentType)
  const conversationPart = params.conversationId || "draft"
  const storageKey = `writer/${params.userId}/${conversationPart}/${Date.now()}-${params.assetId}.${ext}`

  await client.send(
    new PutObjectCommand({
      Bucket: getR2BucketName(),
      Key: storageKey,
      Body: buffer,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  )

  return {
    url: getR2PublicUrl(storageKey),
    storageKey,
    contentType,
  }
}
