import type { AppLocale } from "@/lib/i18n/config"

type PublicRuntimeStatus = "ready" | "deferred" | "runtime_disabled" | null
type PublicAccessState = "public" | "public_then_login" | "login_required" | "authorized" | "permission_required" | "admin_required" | null

export function getPublicRegistryEntryLabel(
  locale: AppLocale,
  runtimeStatus: PublicRuntimeStatus,
  accessState: PublicAccessState,
) {
  if (runtimeStatus === "deferred" || runtimeStatus === "runtime_disabled") {
    return locale === "zh" ? "即将开放" : "Coming soon"
  }
  if (accessState === "permission_required" || accessState === "admin_required") {
    return locale === "zh" ? "需要企业权限" : "Enterprise access"
  }
  if (accessState === "login_required" || accessState === "authorized" || accessState === "public_then_login") {
    return locale === "zh" ? "登录后使用" : "Login required"
  }
  if (runtimeStatus === "ready" || accessState === "public") {
    return locale === "zh" ? "已开放" : "Available"
  }
  return locale === "zh" ? "查看详情" : "View details"
}

const INTERNAL_PUBLIC_TOKENS = /\b(?:runtime|entitlement|accessmodel|binding|provider|enterprise_permission|copywriting_generation)\b/i

export function getPublicProofPoints(
  locale: AppLocale,
  notes: string[] | null | undefined,
  fallback: string[] = [],
) {
  const safeNotes = [...(notes || []), ...fallback]
    .map((note) => note.trim())
    .filter((note) => note && !INTERNAL_PUBLIC_TOKENS.test(note))

  return safeNotes.length > 0
    ? [...new Set(safeNotes)].slice(0, 4)
    : [locale === "zh" ? "查看公开说明与当前可用入口" : "See the public entry and current availability"]
}
