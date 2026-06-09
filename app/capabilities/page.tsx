import { PublicSiteFooter } from "@/components/seo/public-site-footer"
import { PublicSiteHeader } from "@/components/seo/public-site-header"
import { PublicPlatformDirectory } from "@/components/platform/public-platform-directory"
import { getServerSessionUser } from "@/lib/auth/server-session"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import { getLocalizedPlatformDirectoryEntryBySlug } from "@/lib/platform/directory-registry"
import { listPlatformCapabilityExecutionStates } from "@/lib/platform/execution"
import { listVisiblePlatformRegistryEntries } from "@/lib/platform/directory-resolver"

function getCapabilityExecutionLabel(
  locale: "zh" | "en",
  runtimeStatus: "ready" | "deferred" | "runtime_disabled",
  accessState: "public" | "public_then_login" | "login_required" | "authorized" | "permission_required" | "admin_required",
) {
  const runtimeLabel =
    locale === "zh"
      ? {
          ready: "运行中",
          deferred: "后续实现",
          runtime_disabled: "运行时关闭",
        }[runtimeStatus]
      : {
          ready: "Runtime ready",
          deferred: "Deferred",
          runtime_disabled: "Runtime disabled",
        }[runtimeStatus]

  const accessLabel =
    locale === "zh"
      ? {
          public: "公开可见",
          public_then_login: "先公开后登录",
          login_required: "需登录",
          authorized: "已授权",
          permission_required: "需企业权限",
          admin_required: "需管理员",
        }[accessState]
      : {
          public: "Public",
          public_then_login: "Public then login",
          login_required: "Login required",
          authorized: "Authorized",
          permission_required: "Permission required",
          admin_required: "Admin required",
        }[accessState]

  return `${runtimeLabel} · ${accessLabel}`
}

export default async function CapabilitiesPage() {
  const locale = await getRequestLocale()
  const displayLocale = locale === "zh" ? "zh" : "en"
  const currentUser = await getServerSessionUser().catch(() => null)
  const executionMap = new Map(
    (await listPlatformCapabilityExecutionStates(locale, currentUser)).map((item) => [item.capabilitySlug, item] as const),
  )
  const items = (await listVisiblePlatformRegistryEntries({
    locale,
    itemType: "capability",
    surface: "public",
    enterpriseId: currentUser?.enterpriseId,
  })).map((item) => ({
    ...item,
    availability: getLocalizedPlatformDirectoryEntryBySlug(locale, "capability", item.slug)?.availability,
    launchItemType: "capability" as const,
    detailHref: `/capabilities/${item.slug}`,
    extraLabel: executionMap.has(item.slug)
      ? getCapabilityExecutionLabel(
          displayLocale,
          executionMap.get(item.slug)!.runtimeStatus,
          executionMap.get(item.slug)!.accessState,
        )
      : item.config.bindingTarget.toUpperCase(),
  }))

  const copy =
    locale === "zh"
      ? {
          eyebrow: "Platform Core",
          title: "统一能力中心",
          description:
            "把 AI 对话、AI PPT、AI 绘图、AI 视频和智能体组织进同一套平台注册表，让 public toolsite 与 enterprise workspace 共用同一能力目录。",
        }
      : {
          eyebrow: "Platform Core",
          title: "Unified Capability Directory",
          description:
            "Organize AI chat, AI PPT, AI image, AI video, and agent capabilities through one shared registry that powers both the public toolsite and the enterprise workspace.",
        }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <PublicSiteHeader activeKey="tools" />
      <PublicPlatformDirectory locale={displayLocale} eyebrow={copy.eyebrow} title={copy.title} description={copy.description} items={items} />
      <PublicSiteFooter />
    </main>
  )
}
