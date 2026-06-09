import { getServerSessionUser } from "@/lib/auth/server-session"
import { WorkspacePlatformRegistryAdmin } from "@/components/platform/workspace-platform-registry-admin"
import { WorkspacePluginSlotStudio } from "@/components/platform/workspace-plugin-slot-studio"
import { WorkspacePlatformPage } from "@/components/platform/workspace-platform-page"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import { getLocalizedPlatformDirectoryEntryBySlug } from "@/lib/platform/directory-registry"
import { listPlatformRegistryAdminEntries } from "@/lib/platform/directory-resolver"
import { listPlatformRegistryAdminExecutionStates, listPlatformRegistryEntryExecutionStates } from "@/lib/platform/registry-entry-execution"

export default async function DashboardPluginsPage() {
  const locale = await getRequestLocale()
  const displayLocale = locale === "zh" ? "zh" : "en"
  const currentUser = await getServerSessionUser().catch(() => null)
  const items = (await listPlatformRegistryEntryExecutionStates({
    locale,
    itemType: "plugin",
    surface: "workspace",
    enterpriseId: currentUser?.enterpriseId,
    currentUser,
  })).map((item) => ({
    ...item,
    availability: getLocalizedPlatformDirectoryEntryBySlug(locale, "plugin", item.slug)?.availability,
    meta: item.label,
    proofPoints: item.notes.slice(0, 4),
  }))

  const copy =
    locale === "zh"
      ? {
          eyebrow: "Enterprise Workspace",
          title: "插件目录",
          description:
            "将 writer、图片、搜索、素材和媒体扩展纳入统一插件层，先做目录、配置和绑定位，再逐步收敛到平台级执行能力。",
        }
      : {
          eyebrow: "Enterprise Workspace",
          title: "Plugins",
          description:
            "Bring writer, image, search, asset, and media extensions into a shared plugin layer before deepening execution over time.",
        }

  return (
    <>
      <WorkspacePlatformPage locale={displayLocale} eyebrow={copy.eyebrow} title={copy.title} description={copy.description} items={items} currentUser={Boolean(currentUser)} />
      <WorkspacePlatformRegistryAdmin
        locale={displayLocale}
        itemType="plugin"
        title={locale === "zh" ? "插件配置与展示控制" : "Plugin configuration and visibility"}
        description={
          locale === "zh"
            ? "在不重写现有 runtime 的前提下，先把插件启停、可见性和绑定目标统一到平台中台。"
            : "Bring plugin enablement, visibility, and binding targets into the shared platform control plane without rewriting the existing runtimes."
        }
        canManage={false}
        entries={await listPlatformRegistryAdminEntries({
          locale,
          itemType: "plugin",
          enterpriseId: currentUser?.enterpriseId,
        })}
        executions={await listPlatformRegistryAdminExecutionStates({
          locale,
          itemType: "plugin",
          enterpriseId: currentUser?.enterpriseId,
          currentUser,
        })}
      />
      <WorkspacePluginSlotStudio locale={displayLocale} />
    </>
  )
}
