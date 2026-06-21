import { randomUUID } from "crypto"

import { PutObjectCommand } from "@aws-sdk/client-s3"

import { getR2BucketName, getR2Client, getR2PublicUrl, isR2Available } from "@/lib/r2"

function sanitizeFileNameSegment(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
}

function extensionFromMimeType(contentType: string) {
  const normalized = contentType.trim().toLowerCase()
  if (normalized === "text/html" || normalized.startsWith("text/html;")) return "html"
  if (normalized === "text/plain" || normalized.startsWith("text/plain;")) return "txt"
  if (normalized === "text/markdown" || normalized.startsWith("text/markdown;")) return "md"
  if (normalized === "application/pdf") return "pdf"
  if (normalized === "application/json") return "json"
  if (normalized === "application/vnd.openxmlformats-officedocument.presentationml.presentation") return "pptx"
  if (normalized === "application/vnd.ms-powerpoint") return "ppt"
  if (normalized === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx"
  if (normalized === "application/msword") return "doc"
  if (normalized === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return "xlsx"
  if (normalized === "application/vnd.ms-excel") return "xls"
  if (normalized === "video/mp4") return "mp4"
  if (normalized === "video/quicktime") return "mov"
  if (normalized === "video/webm") return "webm"
  if (normalized === "image/png") return "png"
  if (normalized === "image/jpeg") return "jpg"
  if (normalized === "image/webp") return "webp"
  if (normalized === "audio/mpeg") return "mp3"
  if (normalized === "audio/wav") return "wav"
  return "bin"
}

function ensureFileName(input: { title: string; contentType: string; suggestedExtension?: string | null }) {
  const normalizedTitle = input.title.trim() || "artifact"
  const safeTitle = sanitizeFileNameSegment(normalizedTitle.replace(/\s+/g, "-")) || "artifact"
  if (/\.[a-zA-Z0-9]{2,6}$/.test(safeTitle)) return safeTitle
  const extension = sanitizeFileNameSegment(input.suggestedExtension || "") || extensionFromMimeType(input.contentType)
  return `${safeTitle}.${extension}`
}

function ensureExplicitFileName(fileName: string, contentType: string) {
  const trimmed = fileName.trim()
  if (!trimmed) {
    return ensureFileName({
      title: "artifact",
      contentType,
    })
  }

  const normalized = trimmed.replace(/\s+/g, "-")
  const safeName = sanitizeFileNameSegment(normalized) || "artifact"
  if (/\.[a-zA-Z0-9]{2,8}$/.test(safeName)) {
    return safeName
  }

  return `${safeName}.${extensionFromMimeType(contentType)}`
}

function buildPlatformArtifactStorageKey(input: {
  enterpriseId: number
  runId: number
  provider: string
  fileName: string
}) {
  const provider = sanitizeFileNameSegment(input.provider) || "provider"
  const fileName = sanitizeFileNameSegment(input.fileName) || "artifact.bin"
  return `platform-artifacts/${input.enterpriseId}/${input.runId}/${provider}/${Date.now()}-${randomUUID().slice(0, 8)}-${fileName}`
}

export function isPlatformArtifactR2Available() {
  return isR2Available()
}

export async function mirrorPlatformArtifactToR2(input: {
  sourceUrl: string
  enterpriseId: number
  runId: number
  provider: string
  title: string
  contentType?: string | null
  suggestedExtension?: string | null
}) {
  const client = getR2Client()
  if (!client) {
    throw new Error("platform_artifact_r2_config_missing")
  }

  const response = await fetch(input.sourceUrl, {
    cache: "no-store",
  })
  if (!response.ok) {
    throw new Error("platform_artifact_source_fetch_failed")
  }

  const contentType = input.contentType || response.headers.get("content-type") || "application/octet-stream"
  const fileName = ensureFileName({
    title: input.title,
    contentType,
    suggestedExtension: input.suggestedExtension,
  })
  const storageKey = buildPlatformArtifactStorageKey({
    enterpriseId: input.enterpriseId,
    runId: input.runId,
    provider: input.provider,
    fileName,
  })

  await client.send(
    new PutObjectCommand({
      Bucket: getR2BucketName(),
      Key: storageKey,
      Body: Buffer.from(await response.arrayBuffer()),
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  )

  return {
    storageKey,
    publicUrl: getR2PublicUrl(storageKey),
    contentType,
  }
}

export async function uploadPlatformArtifactBufferToR2(input: {
  buffer: Uint8Array | Buffer
  enterpriseId: number
  runId: number
  provider: string
  fileName: string
  contentType: string
}) {
  const client = getR2Client()
  if (!client) {
    throw new Error("platform_artifact_r2_config_missing")
  }

  const normalizedFileName = ensureExplicitFileName(input.fileName, input.contentType)
  const storageKey = buildPlatformArtifactStorageKey({
    enterpriseId: input.enterpriseId,
    runId: input.runId,
    provider: input.provider,
    fileName: normalizedFileName,
  })

  await client.send(
    new PutObjectCommand({
      Bucket: getR2BucketName(),
      Key: storageKey,
      Body: Buffer.from(input.buffer),
      ContentType: input.contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  )

  return {
    storageKey,
    publicUrl: getR2PublicUrl(storageKey),
    contentType: input.contentType,
    fileName: normalizedFileName,
  }
}
