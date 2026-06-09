import { PublicSiteFooter } from "@/components/seo/public-site-footer"
import { PublicSiteHeader } from "@/components/seo/public-site-header"
import { PublicPlatformDirectory } from "@/components/platform/public-platform-directory"
import { getServerSessionUser } from "@/lib/auth/server-session"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import { getLocalizedPlatformDirectoryEntryBySlug } from "@/lib/platform/directory-registry"
import { listPlatformRegistryEntryExecutionStates } from "@/lib/platform/registry-entry-execution"

export default async function McpServicesPage() {
  const locale = await getRequestLocale()
  const displayLocale = locale === "zh" ? "zh" : "en"
  const currentUser = await getServerSessionUser().catch(() => null)
  const items = (await listPlatformRegistryEntryExecutionStates({
    locale,
    itemType: "mcp_service",
    surface: "public",
    enterpriseId: currentUser?.enterpriseId,
    currentUser,
  })).map((item) => ({
    ...item,
    availability: getLocalizedPlatformDirectoryEntryBySlug(locale, "mcp_service", item.slug)?.availability,
    launchItemType: "mcp_service" as const,
    detailHref: `/mcp-services/${item.slug}`,
    extraLabel: item.label,
    proofPoints: item.notes.slice(0, 4),
  }))

  const copy =
    locale === "zh"
      ? {
          eyebrow: "MCP Registry",
          title: "MCP 服务目录",
          description:
            "按注册表优先的方式整理搜索、文档、设计和市场数据入口。本阶段先做目录、说明和绑定位，不直接承诺完整外部执行平台。",
        }
      : {
          eyebrow: "MCP Registry",
          title: "MCP Service Directory",
          description:
            "List search, document, design, and market-data bridges through a registry-first MCP directory before building the full external execution platform.",
        }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <PublicSiteHeader activeKey="tools" />
      <PublicPlatformDirectory locale={displayLocale} eyebrow={copy.eyebrow} title={copy.title} description={copy.description} items={items} />
      <PublicSiteFooter />
    </main>
  )
}
