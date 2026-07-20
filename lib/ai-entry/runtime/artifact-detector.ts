import type { RuntimeArtifactPayload, RuntimeArtifactReference } from "@/lib/ai-runtime/contracts"

const MIME_BY_EXTENSION: Record<string, string> = {
  md: "text/markdown",
  markdown: "text/markdown",
  txt: "text/plain",
  json: "application/json",
  csv: "text/csv",
  html: "text/html",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}

export type ArtifactValidationLimits = {
  maxArtifacts: number
  maxArtifactBytes: number
  maxArtifactTotalBytes: number
  allowedExtensions: string[]
}

export type ValidatedRuntimeArtifact = RuntimeArtifactPayload & { fileName: string; extension: string }
export type ValidatedRuntimeArtifactReference = RuntimeArtifactReference & { fileName: string; extension: string; storageKey: string }

function safeFileName(path: string) {
  const normalized = path.replaceAll("\\", "/")
  if (!normalized.startsWith("artifacts/") || normalized.includes("../") || normalized.includes("/./") || normalized.endsWith("/")) return null
  const fileName = normalized.slice("artifacts/".length).split("/").at(-1) || ""
  if (!fileName || fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) return null
  return fileName
}

export function validateRuntimeArtifactPayload(payload: RuntimeArtifactPayload, limits: ArtifactValidationLimits, currentTotalBytes = 0): ValidatedRuntimeArtifact {
  const fileName = safeFileName(payload.path)
  if (!fileName) throw new Error("runtime_artifact_path_invalid")
  const extension = fileName.includes(".") ? fileName.split(".").at(-1)!.toLowerCase() : ""
  const allowedExtensions = new Set(limits.allowedExtensions.map((value) => value.replace(/^\./, "").toLowerCase()))
  if (!allowedExtensions.has(extension)) throw new Error("runtime_artifact_extension_not_allowed")
  if (!Number.isInteger(payload.sizeBytes) || payload.sizeBytes < 0 || payload.sizeBytes > limits.maxArtifactBytes) throw new Error("runtime_artifact_size_exceeded")
  if (currentTotalBytes + payload.sizeBytes > limits.maxArtifactTotalBytes) throw new Error("runtime_artifact_total_size_exceeded")
  if (!Number.isInteger(payload.contentBase64.length) || !/^[A-Za-z0-9+/]*={0,2}$/.test(payload.contentBase64) || payload.contentBase64.length % 4 === 1) throw new Error("runtime_artifact_base64_invalid")
  const buffer = Buffer.from(payload.contentBase64, "base64")
  if (buffer.byteLength !== payload.sizeBytes) throw new Error("runtime_artifact_size_mismatch")
  const mimeType = payload.mimeType?.trim() || MIME_BY_EXTENSION[extension] || "application/octet-stream"
  return {
    ...payload,
    path: `artifacts/${fileName}`,
    title: payload.title.trim().slice(0, 255) || fileName,
    kind: payload.kind.trim().slice(0, 64) || "file",
    mimeType,
    fileName,
    extension,
  }
}

export function validateRuntimeArtifactReference(reference: RuntimeArtifactReference, limits: ArtifactValidationLimits, currentTotalBytes = 0): ValidatedRuntimeArtifactReference {
  const fileName = safeFileName(`artifacts/${reference.fileName}`)
  const storageKey = reference.key?.trim() || ""
  if (reference.provider !== "r2" || !reference.bucket?.trim() || !storageKey.startsWith("artifacts/") || storageKey.includes("../") || storageKey.includes("/./")) {
    throw new Error("runtime_artifact_reference_invalid")
  }
  if (!fileName) throw new Error("runtime_artifact_path_invalid")
  const extension = fileName.includes(".") ? fileName.split(".").at(-1)!.toLowerCase() : ""
  const allowedExtensions = new Set(limits.allowedExtensions.map((value) => value.replace(/^\./, "").toLowerCase()))
  if (!allowedExtensions.has(extension)) throw new Error("runtime_artifact_extension_not_allowed")
  if (!Number.isInteger(reference.sizeBytes) || reference.sizeBytes < 0 || reference.sizeBytes > limits.maxArtifactBytes) throw new Error("runtime_artifact_size_exceeded")
  if (currentTotalBytes + reference.sizeBytes > limits.maxArtifactTotalBytes) throw new Error("runtime_artifact_total_size_exceeded")
  const mimeType = reference.mimeType?.trim() || MIME_BY_EXTENSION[extension] || "application/octet-stream"
  return {
    ...reference,
    title: reference.title.trim().slice(0, 255) || fileName,
    kind: reference.kind.trim().slice(0, 64) || "file",
    mimeType,
    fileName,
    extension,
    storageKey,
  }
}
