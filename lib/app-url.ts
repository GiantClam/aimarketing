const PREFERRED_PUBLIC_HOSTS: Record<string, string> = {
  "aimarketingsite.com": "www.aimarketingsite.com",
}

function normalizeBaseUrl(value?: string | null) {
  const trimmed = value?.trim()
  if (!trimmed) return null

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  try {
    const normalized = new URL(withProtocol)
    const preferredHost = PREFERRED_PUBLIC_HOSTS[normalized.hostname.toLowerCase()]
    if (preferredHost) {
      normalized.hostname = preferredHost
    }
    return normalized.toString().replace(/\/+$/, "")
  } catch {
    return withProtocol.replace(/\/+$/, "")
  }
}

export function getAppBaseUrl(fallback?: string | null) {
  return (
    normalizeBaseUrl(process.env.APP_URL) ||
    normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL) ||
    normalizeBaseUrl(fallback) ||
    "http://localhost:3000"
  )
}

export function buildAppUrl(path: string, fallback?: string | null) {
  return new URL(path, getAppBaseUrl(fallback)).toString()
}
