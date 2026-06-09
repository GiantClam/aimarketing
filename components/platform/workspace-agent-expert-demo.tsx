"use client"

import { useState } from "react"
import Link from "next/link"
import { Bot, Clock3, MessageSquareText, Sparkles, Target, Users2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  WorkspaceComposerPanel,
  WorkspacePromptChips,
} from "@/components/workspace/workspace-primitives"
import { WorkspaceOutputActions } from "@/components/workspace/workspace-output-actions"
import { buildDashboardBusinessHref } from "@/lib/platform/workspace-business"

type HistoryItem = {
  id: string
  title: string
  status: string
  updatedAt: string
}

function buildCopy(locale: "zh" | "en") {
  if (locale === "zh") {
    return {
      eyebrow: "Agent Expert Workbench",
      title: "成交专家工作台示例",
      description:
        "这是一个前端安全占位的专家工作台示例页，用来验证角色说明、示例问题、能力标签、输入区、历史区和统一输出动作的企业交互结构。",
      roleTitle: "角色身份",
      roleBody: "擅长销售沟通、客户异议处理、提案策略和下一步成交动作设计。",
      resultTitle: "业务结果",
      resultBody: "帮助销售和咨询团队更快形成提案说法、异议回应、会后跟进与内部复盘要点。",
      promptLabel: "示例问题",
      capabilityLabel: "能力标签",
      capabilities: ["客户洞察", "成交策略", "异议处理", "跟进摘要", "提案说法"],
      prompts: [
        "帮我准备一场面向连锁教育客户的首次销售沟通提纲。",
        "客户说预算不足但对 AI 内容生产感兴趣，怎么回应更容易推进下一步？",
        "根据这次会议纪要，整理一个成交风险和跟进动作清单。",
        "把当前提案改成更适合 CFO 审阅的版本。",
      ],
      inputLabel: "输入区",
      inputPlaceholder: "输入客户背景、提案目标、异议点或会议纪要，然后生成一版安全占位的专家建议。",
      run: "生成专家建议",
      helper: "该按钮只生成前端示例输出，不调用真实 Agent 后端。",
      outputLabel: "示例输出",
      outputTitle: "成交推进建议草案",
      outputSummary:
        "先用业务价值和落地节奏回应客户预算顾虑，再把试点范围收缩到一个能在 2 周内验证 ROI 的最小场景。",
      outputChecklist: [
        "先确认客户目前最贵的人工内容环节，优先锚定节省成本。",
        "把试点范围收窄到单一产品线，降低采购决策阻力。",
        "会后 24 小时内发送一页纸跟进摘要，明确下一步和责任人。",
      ],
      historyLabel: "历史占位",
      historyTitle: "最近会话与任务",
      rolePanelTitle: "角色说明",
      rolePanelBody:
        "该示例页先演示专家工作台结构，不接真实成交 Agent runtime。后续只需替换输入提交和历史数据源即可复用这套 UI。",
      backToPlatform: "返回智能体中台",
      openSalesView: "打开销售成交入口",
      placeholderSuccess: "已生成前端示例输出，没有调用真实 Agent 后端。",
      placeholderError: "请先输入一个问题或需求背景。",
    }
  }

  return {
    eyebrow: "Agent Expert Workbench",
    title: "Closing expert workbench example",
    description:
      "This is a safe front-end expert-workbench example that validates the enterprise pattern for role framing, sample prompts, capability tags, input, history, and standardized output actions.",
    roleTitle: "Role identity",
    roleBody: "Focused on sales communication, objection handling, pitch strategy, and next-step close design.",
    resultTitle: "Business result",
    resultBody: "Helps sales and consulting teams produce pitch language, objection responses, follow-up notes, and internal review points faster.",
    promptLabel: "Sample prompts",
    capabilityLabel: "Capability tags",
    capabilities: ["Customer insight", "Close strategy", "Objection handling", "Follow-up summary", "Pitch messaging"],
    prompts: [
      "Prepare a first-call outline for an education chain evaluating AI marketing workflows.",
      "The customer says budget is tight but they are interested in AI content production. How should I respond?",
      "Turn this meeting summary into a close-risk checklist and follow-up plan.",
      "Rewrite the current proposal so it is easier for a CFO to review.",
    ],
    inputLabel: "Input area",
    inputPlaceholder: "Enter account context, pitch goals, objections, or meeting notes to generate a safe front-end expert draft.",
    run: "Generate expert draft",
    helper: "This button produces a local example output only. It does not call a live Agent backend.",
    outputLabel: "Example output",
    outputTitle: "Closing strategy draft",
    outputSummary:
      "Lead with business value and rollout pacing to address budget friction, then shrink the pilot scope to the smallest scenario that can prove ROI within two weeks.",
    outputChecklist: [
      "Anchor the proposal to the customer’s most expensive manual content workflow first.",
      "Reduce the pilot to one product line so procurement sees lower delivery risk.",
      "Send a one-page follow-up summary within 24 hours with owners and next steps.",
    ],
    historyLabel: "History placeholder",
    historyTitle: "Recent sessions and tasks",
    rolePanelTitle: "Role note",
    rolePanelBody:
      "This page demonstrates the expert-workbench structure first and does not connect a real closing-agent runtime yet. The UI can be reused later by swapping in live submission and history sources.",
    backToPlatform: "Back to agent platform",
    openSalesView: "Open sales-close view",
    placeholderSuccess: "Local example output created. No live Agent backend was called.",
    placeholderError: "Enter a question or account context first.",
  }
}

export function WorkspaceAgentExpertDemo({ locale }: { locale: "zh" | "en" }) {
  const copy = buildCopy(locale)
  const [draft, setDraft] = useState(copy.prompts[0])
  const [history, setHistory] = useState<HistoryItem[]>([
    {
      id: "history-1",
      title: locale === "zh" ? "教育行业首次沟通准备" : "Education first-call prep",
      status: locale === "zh" ? "已归档" : "Archived",
      updatedAt: locale === "zh" ? "今天 09:20" : "Today 09:20",
    },
    {
      id: "history-2",
      title: locale === "zh" ? "异议处理要点草案" : "Objection-handling draft",
      status: locale === "zh" ? "待跟进" : "Pending follow-up",
      updatedAt: locale === "zh" ? "昨天 18:10" : "Yesterday 18:10",
    },
    {
      id: "history-3",
      title: locale === "zh" ? "会后跟进摘要占位" : "Post-call follow-up placeholder",
      status: locale === "zh" ? "示例占位" : "Placeholder",
      updatedAt: locale === "zh" ? "本周" : "This week",
    },
  ])
  const [output, setOutput] = useState({
    title: copy.outputTitle,
    summary: copy.outputSummary,
    checklist: copy.outputChecklist,
  })

  const submit = () => {
    const nextPrompt = draft.trim()
    if (!nextPrompt) {
      toast.error(copy.placeholderError)
      return
    }

    setOutput({
      title: copy.outputTitle,
      summary:
        locale === "zh"
          ? `围绕“${nextPrompt.slice(0, 24)}”先确认客户决策人、试点范围和业务价值，再组织下一轮成交推进动作。`
          : `For "${nextPrompt.slice(0, 32)}", confirm the buyer, pilot scope, and business value first, then structure the next close-driving steps.`,
      checklist: [
        locale === "zh"
          ? "把客户现阶段最在意的预算、风险和上线周期拆成可逐条回应的节点。"
          : "Break the customer’s current budget, risk, and rollout concerns into response-ready checkpoints.",
        locale === "zh"
          ? "会后同步一页纸摘要，明确负责人、时间点和下一次决策动作。"
          : "Send a one-page follow-up summary with owners, timing, and the next decision action.",
        locale === "zh"
          ? "把这次输出同步到素材库和知识库入口的统一动作条中，方便团队复用。"
          : "Push the output into the shared action bar so the team can later reuse it through asset and knowledge flows.",
      ],
    })

    setHistory((current) => [
      {
        id: `history-${Date.now()}`,
        title: nextPrompt.slice(0, 32),
        status: locale === "zh" ? "刚刚生成" : "Generated now",
        updatedAt: locale === "zh" ? "刚刚" : "Just now",
      },
      ...current.slice(0, 3),
    ])

    toast.success(copy.placeholderSuccess)
  }

  return (
    <div className="h-full overflow-auto bg-transparent">
      <section className="public-grid-bg mx-auto max-w-7xl px-6 py-10">
        <div className="space-y-8">
          <div className="public-panel rounded-[12px] border border-border bg-card/80 p-6 lg:p-8">
            <div className="public-kicker text-muted-foreground">{copy.eyebrow}</div>
            <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-4xl">
                <h1 className="font-display text-4xl font-extrabold uppercase tracking-[0.02em] text-foreground lg:text-5xl">
                  {copy.title}
                </h1>
                <p className="mt-4 text-sm leading-7 text-muted-foreground lg:text-base">{copy.description}</p>
              </div>
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[8px] border border-primary/30 bg-primary/95">
                <Bot className="h-6 w-6 text-primary-foreground" />
              </div>
            </div>

            <div className="mt-6 grid gap-3 lg:grid-cols-3">
              <div className="dashboard-chip rounded-[8px] px-4 py-4 text-sm text-foreground/85">
                <div className="dashboard-kicker text-muted-foreground">{copy.roleTitle}</div>
                <p className="mt-2 leading-6">{copy.roleBody}</p>
              </div>
              <div className="dashboard-chip rounded-[8px] px-4 py-4 text-sm text-foreground/85">
                <div className="dashboard-kicker text-muted-foreground">{copy.resultTitle}</div>
                <p className="mt-2 leading-6">{copy.resultBody}</p>
              </div>
              <div className="dashboard-chip rounded-[8px] px-4 py-4 text-sm text-foreground/85">
                <div className="dashboard-kicker text-muted-foreground">{copy.capabilityLabel}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {copy.capabilities.map((tag) => (
                    <span key={tag} className="rounded-[4px] border border-border bg-background px-3 py-1.5 text-xs text-foreground">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button className="public-button-secondary h-10 px-4" asChild>
                <Link href="/dashboard/agent-platform">{copy.backToPlatform}</Link>
              </Button>
              <Button className="public-button-primary h-10 px-4" asChild>
                <Link href={buildDashboardBusinessHref("sales-close")}>{copy.openSalesView}</Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="space-y-6">
              <div className="dashboard-panel rounded-[12px] border border-border bg-card/85 p-5">
                <div className="dashboard-kicker text-muted-foreground">{copy.promptLabel}</div>
                <WorkspacePromptChips prompts={copy.prompts} onSelect={setDraft} className="mt-4" />
              </div>

              <WorkspaceComposerPanel
                toolbar={
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="dashboard-chip rounded-[4px] px-3 py-1.5 text-xs text-foreground/85">
                      <MessageSquareText className="mr-2 inline h-4 w-4" />
                      {copy.inputLabel}
                    </span>
                    <span className="dashboard-chip rounded-[4px] px-3 py-1.5 text-xs text-foreground/85">
                      <Sparkles className="mr-2 inline h-4 w-4" />
                      {copy.helper}
                    </span>
                  </div>
                }
                bodyClassName="p-4"
                footer={
                  <>
                    <div className="text-xs leading-6 text-muted-foreground">{copy.helper}</div>
                    <Button type="button" className="public-button-primary h-10 px-4" onClick={submit}>
                      {copy.run}
                    </Button>
                  </>
                }
              >
                <Textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={copy.inputPlaceholder}
                  className="min-h-40 border-0 bg-transparent p-0 text-sm leading-7 shadow-none focus-visible:ring-0"
                />
              </WorkspaceComposerPanel>

              <article className="dashboard-panel rounded-[12px] border border-border bg-card/85 p-5">
                <div className="dashboard-kicker text-muted-foreground">{copy.outputLabel}</div>
                <h2 className="mt-3 font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                  {output.title}
                </h2>
                <p className="mt-4 text-sm leading-7 text-muted-foreground">{output.summary}</p>
                <div className="mt-5 space-y-2">
                  {output.checklist.map((item) => (
                    <div key={item} className="dashboard-chip rounded-[8px] px-4 py-3 text-sm text-foreground/85">
                      {item}
                    </div>
                  ))}
                </div>
              </article>

              <WorkspaceOutputActions locale={locale} artifactLabel={output.title} />
            </div>

            <div className="space-y-6">
              <article className="dashboard-panel rounded-[12px] border border-border bg-card/85 p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[6px] border border-primary/30 bg-primary/95">
                    <Target className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div className="space-y-3">
                    <div className="dashboard-kicker text-muted-foreground">{copy.rolePanelTitle}</div>
                    <p className="text-sm leading-7 text-muted-foreground">{copy.rolePanelBody}</p>
                  </div>
                </div>
              </article>

              <article className="dashboard-panel rounded-[12px] border border-border bg-card/85 p-5">
                <div className="dashboard-kicker text-muted-foreground">{copy.historyLabel}</div>
                <h2 className="mt-3 font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                  {copy.historyTitle}
                </h2>
                <div className="mt-5 space-y-3">
                  {history.map((item) => (
                    <div key={item.id} className="rounded-[8px] border border-border bg-background px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-foreground">{item.title}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{item.status}</div>
                        </div>
                        <div className="dashboard-chip rounded-[4px] px-3 py-1.5 text-xs text-foreground/85">
                          <Clock3 className="mr-2 inline h-3.5 w-3.5" />
                          {item.updatedAt}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="dashboard-panel rounded-[12px] border border-border bg-card/85 p-5">
                <div className="dashboard-kicker text-muted-foreground">
                  {locale === "zh" ? "相关协作占位" : "Related collaboration placeholders"}
                </div>
                <div className="mt-5 grid gap-3">
                  <div className="dashboard-chip rounded-[8px] px-4 py-3 text-sm text-foreground/85">
                    <Users2 className="mr-2 inline h-4 w-4" />
                    {locale === "zh" ? "可连接销售负责人、方案顾问和品牌侧同事的会话历史。" : "Can later connect conversation history for sales leads, consultants, and brand teammates."}
                  </div>
                  <div className="dashboard-chip rounded-[8px] px-4 py-3 text-sm text-foreground/85">
                    <Sparkles className="mr-2 inline h-4 w-4" />
                    {locale === "zh" ? "输出动作统一进入下载、分享、素材库、知识库四类占位动作。" : "Outputs already share one placeholder action bar for download, share, asset-library, and knowledge-base flows."}
                  </div>
                </div>
              </article>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
