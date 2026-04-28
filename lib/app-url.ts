function normalizeBaseUrl(value?: string | null) {
  const trimmed = value?.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/+$/, "")
  }
  return `https://${trimmed.replace(/\/+$/, "")}`
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
