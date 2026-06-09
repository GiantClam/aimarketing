import { getServerSessionUser } from "@/lib/auth/server-session"
import { WorkspacePlatformRegistryAdmin } from "@/components/platform/workspace-platform-registry-admin"
import { WorkspacePlatformPage } from "@/components/platform/workspace-platform-page"
import { WorkspaceWorkflowRunner } from "@/components/platform/workspace-workflow-runner"
import { WorkspaceWorkflowTemplateStudio } from "@/components/platform/workspace-workflow-template-studio"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import { getLocalizedPlatformDirectoryEntryBySlug } from "@/lib/platform/directory-registry"
import { listPlatformRegistryAdminEntries } from "@/lib/platform/directory-resolver"
import { listPlatformRegistryAdminExecutionStates, listPlatformRegistryEntryExecutionStates } from "@/lib/platform/registry-entry-execution"

export default async function DashboardWorkflowsPage() {
  const locale = await getRequestLocale()
  const displayLocale = locale === "zh" ? "zh" : "en"
  const currentUser = await getServerSessionUser().catch(() => null)
  const items = (await listPlatformRegistryEntryExecutionStates({
    locale,
    itemType: "workflow",
    surface: "workspace",
    enterpriseId: currentUser?.enterpriseId,
    currentUser,
  })).map((item) => ({
    ...item,
    availability: getLocalizedPlatformDirectoryEntryBySlug(locale, "workflow", item.slug)?.availability,
    meta: item.label,
    proofPoints: item.notes.slice(0, 4),
  }))

  const copy =
    locale === "zh"
      ? {
          eyebrow: "Enterprise Workspace",
          title: "工作流模板",
          description:
            "把 launch、内容复用、视觉广告和舆情响应这些反复出现的任务先沉淀为可配置模板，再逐步接入更深的自动化。",
        }
      : {
          eyebrow: "Enterprise Workspace",
          title: "Workflows",
          description:
            "Capture recurring launch, repurposing, visual ad, and reputation workflows as templates first, then deepen automation later.",
        }

  return (
    <>
      <WorkspacePlatformPage locale={displayLocale} eyebrow={copy.eyebrow} title={copy.title} description={copy.description} items={items} currentUser={Boolean(currentUser)} />
      <WorkspacePlatformRegistryAdmin
        locale={displayLocale}
        itemType="workflow"
        title={locale === "zh" ? "工作流模板配置与展示控制" : "Workflow configuration and visibility"}
        description={
          locale === "zh"
            ? "先把工作流模板的启停、公开/工作台展示面和绑定目标统一管理，再逐步深挖自动化执行。"
            : "Control workflow enablement, public/workspace visibility, and binding targets first, then deepen automation execution over time."
        }
        canManage={false}
        entries={await listPlatformRegistryAdminEntries({
          locale,
          itemType: "workflow",
          enterpriseId: currentUser?.enterpriseId,
        })}
        executions={await listPlatformRegistryAdminExecutionStates({
          locale,
          itemType: "workflow",
          enterpriseId: currentUser?.enterpriseId,
          currentUser,
        })}
      />
      <WorkspaceWorkflowRunner
        locale={displayLocale}
        items={items.map((item) => ({
          slug: item.slug,
          title: item.title,
          summary: item.summary,
          bindingTarget: item.bindingTarget,
          runtimeStatus: item.runtimeStatus,
        }))}
      />
      <WorkspaceWorkflowTemplateStudio locale={displayLocale} />
    </>
  )
}
