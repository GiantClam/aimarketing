"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  Bot,
  Building2,
  CheckCircle2,
  LineChart,
  MessageSquareText,
  PanelsTopLeft,
  PenTool,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Users2,
  Workflow,
  Zap,
} from "lucide-react"

import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"

const capabilityCards = [
  {
    title: "战略与增长顾问",
    description: "品牌定位、增长策略、活动方向和投放思路，直接由专家 Agent 提供结构化建议。",
    icon: LineChart,
  },
  {
    title: "文案与内容专家",
    description: "从品牌叙事到平台文案，一次生成可直接进入业务评审和二次修改的内容草稿。",
    icon: PenTool,
  },
  {
    title: "网站与视频生成",
    description: "把营销思路继续推进为可展示的网站页面和视频脚本，减少跨团队来回传递。",
    icon: PanelsTopLeft,
  },
]

const workflowSteps = [
  {
    title: "输入企业背景",
    description: "录入企业、品牌、目标市场和业务场景，让 Agent 先理解上下文。",
  },
  {
    title: "按角色调用专家",
    description: "根据任务选择战略顾问、增长顾问、文案专家、网站专家或视频专家。",
  },
  {
    title: "输出可落地资产",
    description: "得到结构化建议、文案素材、网站页面和视频内容，并继续在多会话中迭代。",
  },
]

const roleHighlights = [
  {
    title: "品牌负责人",
    description: "快速形成定位、市场洞察和传播主张，不再从空白文档开始。",
    icon: Sparkles,
  },
  {
    title: "增长与投放团队",
    description: "把策略、文案、页面和视频串成一条增长生产线，提升执行速度。",
    icon: Zap,
  },
  {
    title: "企业管理员",
    description: "统一管理企业成员、功能权限和协作入口，降低内部使用门槛。",
    icon: ShieldCheck,
  },
]

const trustPoints = [
  "企业级账号、成员与权限体系",
  "所有能力统一为专家 Agent 入口",
  "支持多会话、持续迭代与协作",
]

export default function HomePage() {
  const { anonymousLogin } = useAuth()
  const router = useRouter()

  const isDevelopment =
    process.env.NODE_ENV === "development" ||
    process.env.VERCEL_ENV === "preview" ||
    (typeof window !== "undefined" && window.location.hostname.includes("vercel.app"))

  const handleDemoLogin = async () => {
    try {
      await anonymousLogin()
      router.push("/dashboard")
    } catch (error) {
      console.error("Demo login failed:", error)
    }
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[34rem] bg-[radial-gradient(circle_at_top_left,_rgba(236,72,153,0.24),transparent_36%),radial-gradient(circle_at_top_right,_rgba(6,182,212,0.18),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.08),transparent)]" />

      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/78 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_12px_30px_rgba(236,72,153,0.35)]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="font-sans text-base font-semibold tracking-[0.16em] text-foreground/70 uppercase">AI Marketing</div>
              <div className="font-manrope text-sm text-muted-foreground">企业级 AI 营销作战平台</div>
            </div>
          </div>

          <nav className="hidden items-center gap-6 text-sm text-muted-foreground lg:flex">
            <a href="#capabilities" className="transition hover:text-foreground">能力矩阵</a>
            <a href="#workflow" className="transition hover:text-foreground">工作方式</a>
            <a href="#roles" className="transition hover:text-foreground">适用团队</a>
          </nav>

          <div className="flex items-center gap-3">
            {isDevelopment && (
              <Button
                variant="outline"
                className="hidden border-primary/25 bg-white/60 text-foreground shadow-sm hover:bg-primary/10 sm:inline-flex"
                onClick={handleDemoLogin}
              >
                体验环境
              </Button>
            )}
            <Button variant="ghost" className="hidden sm:inline-flex" asChild>
              <Link href="/login">登录</Link>
            </Button>
            <Button className="rounded-full px-5" asChild>
              <Link href="/register">创建企业账号</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="relative">
        <section className="mx-auto grid max-w-7xl gap-12 px-4 pb-18 pt-14 sm:px-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] lg:px-8 lg:pb-24 lg:pt-20">
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white/75 px-4 py-2 text-sm font-medium text-foreground shadow-sm">
              <Bot className="h-4 w-4 text-primary" />
              用专家 Agent 组织品牌、增长、内容、网站与视频工作流
            </div>

            <h1 className="max-w-4xl font-sans text-5xl font-semibold leading-[1.04] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
              帮企业把
              <span className="mx-2 rounded-2xl bg-primary px-3 py-1 text-primary-foreground shadow-[0_12px_30px_rgba(236,72,153,0.22)]">
                AI 营销能力
              </span>
              变成真正可执行的作战系统
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
              AI Marketing 面向品牌、增长和内容团队，提供战略顾问、增长顾问、文案专家、网站专家和视频专家等 Agent。
              不是只给你一个聊天框，而是把企业背景、权限协作和多会话迭代一起组织起来。
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              {trustPoints.map((point) => (
                <div
                  key={point}
                  className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-4 py-2 text-sm text-foreground shadow-sm"
                >
                  <CheckCircle2 className="h-4 w-4 text-accent" />
                  {point}
                </div>
              ))}
            </div>

            <div className="mt-10 flex flex-wrap gap-4">
              <Button size="lg" className="rounded-full px-7 text-base" asChild>
                <Link href="/register">
                  立即创建企业
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="rounded-full border-primary/20 bg-white/70 px-7 text-base" asChild>
                <Link href="/login">已有账号，直接登录</Link>
              </Button>
              {isDevelopment && (
                <Button
                  size="lg"
                  variant="ghost"
                  className="rounded-full border border-dashed border-accent/40 bg-accent/8 px-7 text-base hover:bg-accent/15"
                  onClick={handleDemoLogin}
                >
                  进入体验环境
                </Button>
              )}
            </div>

            <div className="mt-12 grid gap-4 border-t border-border/70 pt-8 sm:grid-cols-3">
              <div>
                <div className="text-3xl font-semibold text-foreground">5 类</div>
                <div className="mt-1 text-sm text-muted-foreground">专家 Agent 统一入口</div>
              </div>
              <div>
                <div className="text-3xl font-semibold text-foreground">多会话</div>
                <div className="mt-1 text-sm text-muted-foreground">支持连续讨论、策略迭代和上下文管理</div>
              </div>
              <div>
                <div className="text-3xl font-semibold text-foreground">企业级</div>
                <div className="mt-1 text-sm text-muted-foreground">成员权限、企业归属和后台管理能力</div>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -left-8 top-10 hidden h-24 w-24 rounded-full bg-accent/20 blur-3xl lg:block" />
            <div className="absolute bottom-10 right-0 hidden h-32 w-32 rounded-full bg-primary/20 blur-3xl lg:block" />

            <div className="relative overflow-hidden rounded-[2rem] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,255,255,0.78))] p-5 shadow-[0_24px_80px_rgba(131,24,67,0.16)] backdrop-blur">
              <div className="mb-4 flex items-center justify-between rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Marketing Workspace</div>
                  <div className="mt-1 font-sans text-lg font-semibold">从策略到内容，一站完成</div>
                </div>
                <div className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">多 Agent</div>
              </div>

              <div className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-[1.05fr_0.95fr]">
                  <div className="rounded-[1.6rem] bg-foreground px-5 py-5 text-background">
                    <div className="flex items-center gap-2 text-sm text-background/70">
                      <MessageSquareText className="h-4 w-4" />
                      顾问工作台
                    </div>
                    <div className="mt-4 text-2xl font-semibold leading-tight">品牌战略、增长顾问、文案专家都以 Agent 形式协同工作</div>
                    <div className="mt-4 grid gap-3">
                      <div className="rounded-2xl bg-white/10 p-3 text-sm text-background/85">梳理品牌定位与竞争差异</div>
                      <div className="rounded-2xl bg-white/10 p-3 text-sm text-background/85">输出活动策略与增长动作建议</div>
                    </div>
                  </div>

                  <div className="grid gap-4">
                    <div className="rounded-[1.5rem] border border-border/70 bg-card p-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <PanelsTopLeft className="h-4 w-4 text-primary" />
                        网站生成
                      </div>
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">
                        将策略和文案继续转化为可展示的营销页面结构。
                      </p>
                    </div>
                    <div className="rounded-[1.5rem] border border-border/70 bg-card p-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <PlayCircle className="h-4 w-4 text-accent" />
                        视频生成
                      </div>
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">
                        从脚本到画面说明，帮助团队更快启动营销视频制作。
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-[1.5rem] border border-border/70 bg-card p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Building2 className="h-4 w-4 text-primary" />
                      企业归属
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">所有用户归属于企业，适合团队内部统一启用。</p>
                  </div>
                  <div className="rounded-[1.5rem] border border-border/70 bg-card p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Users2 className="h-4 w-4 text-primary" />
                      权限分配
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">管理员可审核成员、分配专家顾问和生成能力权限。</p>
                  </div>
                  <div className="rounded-[1.5rem] border border-border/70 bg-card p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Workflow className="h-4 w-4 text-primary" />
                      会话沉淀
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">同一主题支持持续追问，保留历史上下文和迭代过程。</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="capabilities" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <div className="text-sm font-semibold uppercase tracking-[0.28em] text-primary/80">Capabilities</div>
            <h2 className="mt-3 font-sans text-3xl font-semibold sm:text-4xl">客户一进入首页，就应该知道这不是普通 AI 聊天工具</h2>
            <p className="mt-4 text-lg leading-8 text-muted-foreground">
              这个产品的核心不是“能对话”，而是把企业营销工作拆成不同专家职责，再通过 Agent、权限和会话体系组织起来。
            </p>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {capabilityCards.map(({ title, description, icon: Icon }) => (
              <div
                key={title}
                className="group rounded-[1.75rem] border border-border/70 bg-card/90 p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-[0_22px_60px_rgba(131,24,67,0.12)]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 font-sans text-2xl font-semibold">{title}</h3>
                <p className="mt-3 text-base leading-7 text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="workflow" className="border-y border-border/70 bg-card/60">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.28em] text-accent">Workflow</div>
                <h2 className="mt-3 font-sans text-3xl font-semibold sm:text-4xl">把复杂营销流程压缩成三步，而不是让团队各自重复造轮子</h2>
                <p className="mt-4 text-lg leading-8 text-muted-foreground">
                  首页必须讲清楚产品如何使用，否则用户不知道从哪里开始，也无法判断是否值得注册。
                </p>
              </div>

              <div className="grid gap-4">
                {workflowSteps.map((step, index) => (
                  <div key={step.title} className="flex gap-4 rounded-[1.5rem] border border-border/70 bg-background/90 p-5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                      {index + 1}
                    </div>
                    <div>
                      <h3 className="font-sans text-xl font-semibold">{step.title}</h3>
                      <p className="mt-2 text-base leading-7 text-muted-foreground">{step.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="roles" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
            <div>
              <div className="text-sm font-semibold uppercase tracking-[0.28em] text-primary/80">Who It Fits</div>
              <h2 className="mt-3 font-sans text-3xl font-semibold sm:text-4xl">适合谁，一眼就应该被说清楚</h2>
              <p className="mt-4 text-lg leading-8 text-muted-foreground">
                这个站点不是面向泛用户，而是面向要把营销工作组织起来的企业团队。首页需要明确告诉他们：为什么应该用你，而不是继续用零散工具。
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {roleHighlights.map(({ title, description, icon: Icon }) => (
                <div key={title} className="rounded-[1.6rem] border border-border/70 bg-card p-5 shadow-sm">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/12 text-accent">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-5 font-sans text-xl font-semibold">{title}</h3>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 pb-18 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] border border-primary/20 bg-[linear-gradient(135deg,rgba(131,24,67,0.96),rgba(236,72,153,0.92)_52%,rgba(6,182,212,0.78))] px-6 py-10 text-white shadow-[0_30px_90px_rgba(131,24,67,0.24)] sm:px-10 lg:flex lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <div className="text-sm font-semibold uppercase tracking-[0.28em] text-white/75">Launch Faster</div>
              <h2 className="mt-3 font-sans text-3xl font-semibold sm:text-4xl">
                如果你想让客户在 10 秒内明白产品价值，首页必须先把“产品是什么、适合谁、能产出什么”说透。
              </h2>
              <p className="mt-4 text-base leading-8 text-white/82 sm:text-lg">
                现在可以直接创建企业账号，启用专家 Agent，把品牌战略、内容生产、网站生成和视频生成放进同一个营销工作台。
              </p>
            </div>

            <div className="mt-8 flex flex-wrap gap-4 lg:mt-0 lg:justify-end">
              <Button size="lg" variant="secondary" className="rounded-full border border-white/15 bg-white text-foreground hover:bg-white/90" asChild>
                <Link href="/register">创建企业并开始使用</Link>
              </Button>
              <Button size="lg" variant="outline" className="rounded-full border-white/30 bg-white/8 text-white hover:bg-white/14" asChild>
                <Link href="/login">进入控制台</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
