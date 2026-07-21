const PLATFORM_ARTIFACT_DOWNLOAD_PATH = /^\/api\/platform\/artifacts\/\d+\/download(?:[/?#]|$)/u

/**
 * Inline media is trusted only when it points at the platform artifact route
 * or a known R2 public/signed host. Container-local paths must stay hidden.
 */
export function isPublishedR2ArtifactUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return false

  let parsed: URL
  try {
    parsed = new URL(trimmed, "https://www.aimarketingsite.com")
  } catch {
    return false
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false
  if (PLATFORM_ARTIFACT_DOWNLOAD_PATH.test(parsed.pathname)) return true

  const host = parsed.hostname.toLowerCase()
  return host === "s.aimarketingsite.com" || host.endsWith(".r2.dev") || host.endsWith(".r2.cloudflarestorage.com")
}
