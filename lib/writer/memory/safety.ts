const WRITER_MEMORY_MAX_CONTENT_CHARS = Math.max(
  80,
  Math.min(8000, Number.parseInt(process.env.WRITER_MEMORY_MAX_CONTENT_CHARS || "1500", 10) || 1500),
)
const WRITER_MEMORY_MAX_TITLE_CHARS = 160

const SECRET_PATTERNS: RegExp[] = [
  /(?:api[_-]?key|secret|token|password|passwd|credential)\s*[:=]\s*['"]?[a-z0-9_\-]{8,}/iu,
  /\bsk-[a-z0-9]{20,}\b/iu,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\bghp_[a-z0-9]{20,}\b/iu,
  /-----BEGIN (?:RSA|EC|DSA|OPENSSH) PRIVATE KEY-----/u,
]

function normalizeInput(value: string) {
  return value.trim().replace(/\s+/gu, " ")
}

export function containsWriterMemorySecret(value: string) {
  return SECRET_PATTERNS.some((pattern) => pattern.test(value))
}

export function enforceWriterMemoryTitleSafety(title: string) {
  const normalized = normalizeInput(String(title || ""))
  if (!normalized) {
    throw new Error("writer_memory_title_required")
  }
  if (normalized.length > WRITER_MEMORY_MAX_TITLE_CHARS) {
    throw new Error("writer_memory_title_too_long")
  }
  if (containsWriterMemorySecret(normalized)) {
    throw new Error("writer_memory_contains_secret")
  }
  return normalized
}

export function enforceWriterMemoryContentSafety(content: string) {
  const normalized = normalizeInput(String(content || ""))
  if (!normalized) {
    throw new Error("writer_memory_content_required")
  }
  if (normalized.length > WRITER_MEMORY_MAX_CONTENT_CHARS) {
    throw new Error("writer_memory_content_too_long")
  }
  if (containsWriterMemorySecret(normalized)) {
    throw new Error("writer_memory_contains_secret")
  }
  return normalized
}

