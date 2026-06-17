import { AiEntryWorkspace } from "@/components/ai-entry/ai-entry-workspace"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import { getLocalizedBusinessAgentConfigById } from "@/lib/platform/business-agents"

const SALES_CLOSE_AGENT_ID = "business-sales-close"

export default async function DashboardSalesCloseExpertPage() {
  const locale = await getRequestLocale()
  const appLocale = locale === "zh" ? "zh" : "en"
  const agent = getLocalizedBusinessAgentConfigById(appLocale, SALES_CLOSE_AGENT_ID)

  return (
    <div className="public-grid-bg h-full overflow-auto bg-transparent">
      <section className="mx-auto flex h-full max-w-7xl flex-col gap-6 px-6 py-8">
        <div className="public-panel rounded-[12px] border border-border bg-card/80 p-6">
          <div className="public-kicker text-muted-foreground">
            {appLocale === "zh" ? "Agent Expert Workbench" : "Agent Expert Workbench"}
          </div>
          <h1 className="mt-3 font-display text-4xl font-extrabold uppercase tracking-[0.02em] text-foreground lg:text-5xl">
            {agent?.name ?? (appLocale === "zh" ? "销售成交 Agent" : "Sales Close Agent")}
          </h1>
          <p className="mt-4 max-w-4xl text-sm leading-7 text-muted-foreground lg:text-base">
            {agent?.summary ??
              (appLocale === "zh"
                ? "围绕成交推进、异议处理、提案说法与会后跟进，直接进入真实 AI 对话 runtime。"
                : "Enter the live AI workspace for close strategy, objections, proposal language, and follow-up actions.")}
          </p>
        </div>

        <div className="min-h-[calc(100svh-220px)] flex-1 overflow-hidden rounded-[12px] border border-border bg-card/80">
          <AiEntryWorkspace
            initialConversationId={null}
            embedded
            forcedAgentId={agent?.agentId ?? SALES_CLOSE_AGENT_ID}
            draftSeed={agent?.samplePrompts[0] ?? ""}
            embeddedPromptButtons={agent?.samplePrompts ?? []}
            embeddedGuideMessage={
              agent
                ? {
                    title: agent.name,
                    body: agent.systemPromptSummary,
                    promptLabel: appLocale === "zh" ? "你可以这样开始" : "Start with one of these",
                    prompts: agent.samplePrompts,
                  }
                : null
            }
          />
        </div>
      </section>
    </div>
  )
}
