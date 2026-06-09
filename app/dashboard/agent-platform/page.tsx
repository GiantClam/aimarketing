import Link from "next/link"

import { Button } from "@/components/ui/button"
import { getServerSessionUser } from "@/lib/auth/server-session"
import { WorkspaceAgentCardStudio } from "@/components/platform/workspace-agent-card-studio"
import { WorkspacePlatformRegistryAdmin } from "@/components/platform/workspace-platform-registry-admin"
import { WorkspacePlatformPage } from "@/components/platform/workspace-platform-page"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import { getLocalizedPlatformDirectoryEntryBySlug } from "@/lib/platform/directory-registry"
import { listPlatformRegistryAdminEntries } from "@/lib/platform/directory-resolver"
import { listPlatformRegistryAdminExecutionStates, listPlatformRegistryEntryExecutionStates } from "@/lib/platform/registry-entry-execution"
import { buildDashboardBusinessHref } from "@/lib/platform/workspace-business"

export default async function DashboardAgentPlatformPage() {
  const locale = await getRequestLocale()
  const displayLocale = locale === "zh" ? "zh" : "en"
  const currentUser = await getServerSessionUser().catch(() => null)
  const items = (await listPlatformRegistryEntryExecutionStates({
    locale,
    itemType: "agent",
    surface: "workspace",
    enterpriseId: currentUser?.enterpriseId,
    currentUser,
  })).map((item) => ({
    ...item,
    availability: getLocalizedPlatformDirectoryEntryBySlug(locale, "agent", item.slug)?.availability,
    meta: item.label,
    proofPoints: item.notes.slice(0, 4),
  }))

  const copy =
    locale === "zh"
      ? {
          eyebrow: "Enterprise Workspace",
          title: "智能体中台",
          description:
            "按 Registry First 策略先把智能体、入口、绑定关系和可见性组织起来，再逐步衔接插件、MCP 和工作流执行。",
          expertTitle: "专家工作台示例",
          expertDescription:
            "先用一个成交专家页统一角色说明、示例问题、输入区、历史占位和输出动作，再逐步把更多高价值 Agent 接进同一结构。",
          openExpert: "打开成交专家工作台",
          openSalesView: "查看销售成交入口",
        }
      : {
          eyebrow: "Enterprise Workspace",
          title: "Agent Platform",
          description:
            "Organize agents, entry points, bindings, and visibility first, then deepen plugin, MCP, and workflow execution over time.",
          expertTitle: "Expert workbench example",
          expertDescription:
            "Use one closing-expert page to standardize role framing, sample prompts, input, history placeholders, and output actions before more high-value Agents adopt the same structure.",
          openExpert: "Open closing expert workbench",
          openSalesView: "View sales-close lane",
        }

  return (
    <>
      <WorkspacePlatformPage locale={displayLocale} eyebrow={copy.eyebrow} title={copy.title} description={copy.description} items={items} currentUser={Boolean(currentUser)} />
      <section className="public-grid-bg mx-auto max-w-7xl px-6 pb-10">
        <div className="dashboard-panel rounded-[12px] border border-border bg-card/85 p-5">
          <div className="dashboard-kicker text-muted-foreground">{copy.expertTitle}</div>
          <h2 className="mt-3 font-display text-3xl font-extrabold uppercase tracking-[0.02em] text-foreground">
            {locale === "zh" ? "成交专家工作台" : "Closing expert workbench"}
          </h2>
          <p className="mt-4 max-w-4xl text-sm leading-7 text-muted-foreground">{copy.expertDescription}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button className="public-button-primary h-10 px-4" asChild>
              <Link href="/dashboard/agent-platform/sales-close-expert">{copy.openExpert}</Link>
            </Button>
            <Button className="public-button-secondary h-10 px-4" asChild>
              <Link href={buildDashboardBusinessHref("sales-close")}>{copy.openSalesView}</Link>
            </Button>
          </div>
        </div>
      </section>
      <WorkspacePlatformRegistryAdmin
        locale={displayLocale}
        itemType="agent"
        title={locale === "zh" ? "智能体配置与绑定位" : "Agent configuration and bindings"}
        description={
          locale === "zh"
            ? "按 Registry First 策略管理启用状态、展示面和当前绑定目标。企业管理员的修改会进入企业级平台注册表。"
            : "Control enabled state, surfaces, and current bindings through the Registry First control plane. Company-admin changes write back to the enterprise platform registry."
        }
        canManage={false}
        entries={await listPlatformRegistryAdminEntries({
          locale,
          itemType: "agent",
          enterpriseId: currentUser?.enterpriseId,
        })}
        executions={await listPlatformRegistryAdminExecutionStates({
          locale,
          itemType: "agent",
          enterpriseId: currentUser?.enterpriseId,
          currentUser,
        })}
      />
      <WorkspaceAgentCardStudio locale={displayLocale} />
    </>
  )
}
