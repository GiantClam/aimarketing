import { PutObjectCommand } from "@aws-sdk/client-s3"

import { getR2BucketName, getR2Client, getR2PublicUrl, isR2Available } from "@/lib/r2"

type WriterUploadResult = {
  url: string
  storageKey: string
  contentType: string
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

  const { contentType, buffer } = dataUrlToBuffer(params.dataUrl)
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
