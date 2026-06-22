function normalizeHost(hostname?: string | null) {
  return typeof hostname === "string" ? hostname.trim().toLowerCase() : ""
}

function isLoopbackHost(hostname?: string | null) {
  const normalized = normalizeHost(hostname)
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1"
}

export function shouldShowDemoEntry(hostname?: string | null) {
  if (process.env.NODE_ENV === "development") return true

  const normalizedHost = normalizeHost(hostname)
  if (isLoopbackHost(normalizedHost)) return true
  if (process.env.VERCEL_ENV === "preview") return true
  if (normalizedHost.endsWith(".vercel.app")) return true

  return false
}
