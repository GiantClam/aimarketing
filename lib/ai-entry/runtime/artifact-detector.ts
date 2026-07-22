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

function baseArtifactFileName(value: string) {
  return value.replaceAll("\\", "/").split("/").at(-1) || value
}

/** Removes the numeric prefix used when runtime manifests are merged. */
export function displayRuntimeArtifactFileName(value: string) {
  return baseArtifactFileName(value).replace(/^\d+-/u, "")
}

export function normalizeRuntimeArtifactFileName(value: string) {
  return displayRuntimeArtifactFileName(value).trim().toLowerCase()
}

export function isInternalRuntimeArtifact(value: string) {
  return normalizeRuntimeArtifactFileName(value) === "result.pptx"
}

type RuntimeArtifactSummary = {
  title?: unknown
  fileName?: unknown
  path?: unknown
  summary?: unknown
  kind?: unknown
  mimeType?: unknown
  artifactType?: unknown
  sizeBytes?: unknown
  createdAt?: unknown
}

function artifactFileName<T extends RuntimeArtifactSummary>(item: T) {
  const directName = typeof item.fileName === "string"
    ? item.fileName
    : typeof item.path === "string"
      ? item.path
      : ""
  if (directName.trim()) return directName
  if (typeof item.summary === "string") {
    const summaryFileName = item.summary.match(/^(.+?)\s+\([^)]*\)$/u)?.[1]?.trim()
    if (summaryFileName) return summaryFileName
  }
  return typeof item.title === "string" ? item.title : ""
}

export function dedupeRuntimeArtifacts<T extends RuntimeArtifactSummary>(items: T[]) {
  const hasNamedPptx = items.some((item) => {
    const name = artifactFileName(item)
    return normalizeRuntimeArtifactFileName(name).endsWith(".pptx") && !isInternalRuntimeArtifact(name)
  })
  const selected = new Map<string, T>()
  for (const item of items) {
    const rawName = artifactFileName(item)
    const normalizedName = normalizeRuntimeArtifactFileName(rawName)
    if (!normalizedName) continue
    if (hasNamedPptx && isInternalRuntimeArtifact(rawName)) continue
    const previous = selected.get(normalizedName)
    if (!previous || (typeof (previous.fileName || previous.path || previous.title) === "string" && isInternalRuntimeArtifact(String(previous.fileName || previous.path || previous.title)))) {
      selected.set(normalizedName, item)
    }
  }
  return [...selected.values()]
}

function isPptxArtifact<T extends RuntimeArtifactSummary>(item: T) {
  const name = artifactFileName(item).toLowerCase()
  const kind = typeof item.kind === "string" ? item.kind.toLowerCase() : ""
  const mimeType = typeof item.mimeType === "string" ? item.mimeType.toLowerCase() : ""
  const artifactType = typeof item.artifactType === "string" ? item.artifactType.toLowerCase() : ""
  return name.endsWith(".pptx") || kind === "pptx" || artifactType === "pptx" || mimeType.includes("presentationml.presentation")
}

function finalArtifactScore<T extends RuntimeArtifactSummary>(item: T) {
  const name = normalizeRuntimeArtifactFileName(artifactFileName(item))
  let score = 0
  if (/\b(?:final|output|export|generated|deliverable)\b|最终|成品|定稿|输出/u.test(name)) score += 100
  if (isInternalRuntimeArtifact(name)) score -= 1000
  const sizeBytes = typeof item.sizeBytes === "number" && Number.isFinite(item.sizeBytes) ? item.sizeBytes : 0
  return { score, sizeBytes }
}

/** Keeps one final PPTX when a runtime also reports intermediate artifacts. */
export function selectFinalRuntimeArtifacts<T extends RuntimeArtifactSummary>(items: T[]) {
  const deduped = dedupeRuntimeArtifacts(items)
  const pptx = deduped.filter(isPptxArtifact)
  if (pptx.length === 0) return deduped

  const namedPptx = pptx.filter((item) => !isInternalRuntimeArtifact(artifactFileName(item)))
  const candidates = namedPptx.length > 0 ? namedPptx : pptx
  const selected = candidates.reduce((best, item) => {
    const currentScore = finalArtifactScore(item)
    const bestScore = finalArtifactScore(best)
    if (currentScore.score > bestScore.score) return item
    if (currentScore.score === bestScore.score && currentScore.sizeBytes > bestScore.sizeBytes) return item
    return best
  })
  return [selected]
}

/** Selects the newest deliverable for persisted conversation display. */
export function selectLatestFinalRuntimeArtifacts<T extends RuntimeArtifactSummary>(items: T[]) {
  const deduped = dedupeRuntimeArtifacts(items)
  const pptx = deduped.filter(isPptxArtifact)
  if (pptx.length === 0) return deduped

  const namedPptx = pptx.filter((item) => !isInternalRuntimeArtifact(artifactFileName(item)))
  const candidates = namedPptx.length > 0 ? namedPptx : pptx
  const selected = candidates.reduce((best, item) => {
    const bestCreatedAt = typeof best.createdAt === "number" && Number.isFinite(best.createdAt) ? best.createdAt : null
    const itemCreatedAt = typeof item.createdAt === "number" && Number.isFinite(item.createdAt) ? item.createdAt : null
    if (itemCreatedAt !== null && (bestCreatedAt === null || itemCreatedAt >= bestCreatedAt)) return item
    if (itemCreatedAt === null && bestCreatedAt !== null) return best
    return item
  })
  return [selected]
}

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
  const displayFileName = displayRuntimeArtifactFileName(fileName)
  return {
    ...payload,
    path: `artifacts/${displayFileName}`,
    title: displayRuntimeArtifactFileName(payload.title.trim()).slice(0, 255) || displayFileName,
    kind: payload.kind.trim().slice(0, 64) || "file",
    mimeType,
    fileName: displayFileName,
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
  const displayFileName = displayRuntimeArtifactFileName(fileName)
  return {
    ...reference,
    title: displayRuntimeArtifactFileName(reference.title.trim()).slice(0, 255) || displayFileName,
    kind: reference.kind.trim().slice(0, 64) || "file",
    mimeType,
    fileName: displayFileName,
    extension,
    storageKey,
  }
}
