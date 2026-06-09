import { getServerSessionUser } from "@/lib/auth/server-session"
import { WorkspaceMcpServiceProfileStudio } from "@/components/platform/workspace-mcp-service-profile-studio"
import { WorkspacePlatformRegistryAdmin } from "@/components/platform/workspace-platform-registry-admin"
import { WorkspacePlatformPage } from "@/components/platform/workspace-platform-page"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import { getLocalizedPlatformDirectoryEntryBySlug } from "@/lib/platform/directory-registry"
import { listPlatformRegistryAdminEntries } from "@/lib/platform/directory-resolver"
import { listPlatformRegistryAdminExecutionStates, listPlatformRegistryEntryExecutionStates } from "@/lib/platform/registry-entry-execution"

export default async function DashboardMcpServicesPage() {
  const locale = await getRequestLocale()
  const displayLocale = locale === "zh" ? "zh" : "en"
  const currentUser = await getServerSessionUser().catch(() => null)
  const items = (await listPlatformRegistryEntryExecutionStates({
    locale,
    itemType: "mcp_service",
    surface: "workspace",
    enterpriseId: currentUser?.enterpriseId,
    currentUser,
  })).map((item) => ({
    ...item,
    availability: getLocalizedPlatformDirectoryEntryBySlug(locale, "mcp_service", item.slug)?.availability,
    meta: item.label,
    proofPoints: item.notes.slice(0, 4),
  }))

  const copy =
    locale === "zh"
      ? {
          eyebrow: "Enterprise Workspace",
          title: "MCP 服务",
          description:
            "先把搜索、文档、设计和市场数据能力统一为 MCP 服务目录与配置层，为后续更完整的执行平台留下清晰边界。",
        }
      : {
          eyebrow: "Enterprise Workspace",
          title: "MCP Services",
          description:
            "Start with a shared MCP directory and configuration layer for search, document, design, and market-data services.",
        }

  return (
    <>
      <WorkspacePlatformPage locale={displayLocale} eyebrow={copy.eyebrow} title={copy.title} description={copy.description} items={items} currentUser={Boolean(currentUser)} />
      <WorkspacePlatformRegistryAdmin
        locale={displayLocale}
        itemType="mcp_service"
        title={locale === "zh" ? "MCP 服务配置与绑定位" : "MCP configuration and bindings"}
        description={
          locale === "zh"
            ? "先以目录和配置层管理 MCP 服务的显示面、启停和能力绑定位，再逐步补更完整的执行平台。"
            : "Manage MCP visibility, enablement, and capability bindings through a registry/configuration layer before deeper execution lands."
        }
        canManage={false}
        entries={await listPlatformRegistryAdminEntries({
          locale,
          itemType: "mcp_service",
          enterpriseId: currentUser?.enterpriseId,
        })}
        executions={await listPlatformRegistryAdminExecutionStates({
          locale,
          itemType: "mcp_service",
          enterpriseId: currentUser?.enterpriseId,
          currentUser,
        })}
      />
      <WorkspaceMcpServiceProfileStudio locale={displayLocale} />
    </>
  )
}
