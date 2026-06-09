import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, CheckCircle2, Clock3, Lock, PlayCircle, Sparkles } from "lucide-react"

import { ToolShell } from "@/components/lead-tools/tool-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { AppLocale } from "@/lib/i18n/config"
import { localizePublicPath } from "@/lib/i18n/routing"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import { getLocalizedPlatformCapabilityBySlug } from "@/lib/platform/catalog"

type PageCopy = {
  eyebrow: string
  title: string
  description: string
  proofPoints: string[]
  faqTitle: string
  faqDescription: string
  faq: Array<{ question: string; answer: string }>
  asideTitle: string
  accessLabel: string
  asideRuntime: string
  asideAccess: string
  sectionTitle: string
  sectionDescription: string
  cards: Array<{ title: string; body: string }>
  primaryAction: string
  secondaryAction: string
  routeLabel: string
  routeValue: string
  capabilityLabel: string
  capabilityValue: string
  statusLabel: string
  whyEntryTitle: string
}

function getAiMusicPageCopy(locale: AppLocale): PageCopy {
  if (locale === "zh") {
    return {
      eyebrow: "Audio Lead Gen Tool",
      title: "AI 音乐入口",
      description: "把 AI 配乐、短音频片段和主题音乐生成补进 public toolsite，并让任务直接落到 shared media runtime。",
      proofPoints: ["公开入口先上线", "复用 shared media runtime", "RunningHub music target 承接异步任务"],
      faqTitle: "常见问题",
      faqDescription: "先把入口、运行时边界和接入方式说清楚，再逐步补完整交互。",
      faq: [
        {
          question: "这个页面现在能直接在线生成音乐吗？",
          answer: "当前阶段先补平台入口、目录映射和统一任务通道。真正的生成请求已经走 shared media runtime，但完整前端交互还会后续补齐。",
        },
        {
          question: "为什么不单独做一套音乐 runtime？",
          answer: "图片、视频、音乐都属于同一类异步媒体任务，复用 shared media runtime 能减少重复接入和状态处理。",
        },
        {
          question: "音乐任务会走哪个 provider？",
          answer: "最小实现直接对接 RunningHub 的 music target，通过新的 ai-music target 进入统一媒体路由。",
        },
      ],
      asideTitle: "当前接入策略",
      accessLabel: "访问方式",
      asideRuntime: "AI 音乐会复用图片/视频同一套 shared media runtime，统一提交任务和查询状态。",
      asideAccess: "运行时调用仍要求登录，并沿用现有媒体权限校验链路。",
      sectionTitle: "这次最小实现补了什么",
      sectionDescription: "目标不是重做一套音乐工作台，而是先把平台入口、能力目录和底层任务 target 接通。",
      cards: [
        {
          title: "Public Entry",
          body: "新增 /tools/ai-music 公开页面，先承接产品定位、能力说明和后续跳转。",
        },
        {
          title: "Shared Runtime",
          body: "新增 ai-music target，直接复用平台媒体运行时、任务提交和任务查询接口。",
        },
        {
          title: "Directory Visibility",
          body: "在 capability 目录和 tools app center 里都能看到 AI 音乐入口，不再是隐形能力。",
        },
      ],
      primaryAction: "查看能力详情",
      secondaryAction: "返回工具目录",
      routeLabel: "运行时路由",
      routeValue: "POST /api/platform/media/run?target=ai-music&action=generate",
      capabilityLabel: "平台能力",
      capabilityValue: "AI 音乐现在和图片、视频共用统一 media task adapter。",
      statusLabel: "Beta",
      whyEntryTitle: "为什么先做入口",
    }
  }

  return {
    eyebrow: "Audio Lead Gen Tool",
    title: "AI Music Entry",
    description: "Adds a public landing page for AI soundtrack, short audio, and theme-music generation while sending execution into the shared media runtime.",
    proofPoints: ["Public entry now exists", "Reuses the shared media runtime", "RunningHub music target handles async execution"],
    faqTitle: "FAQ",
    faqDescription: "This page clarifies the entry point, runtime boundary, and integration contract before the richer UI lands.",
    faq: [
      {
        question: "Can this page already generate music directly in-browser?",
        answer: "This phase focuses on the platform entry, directory wiring, and unified task target. The runtime path exists, but the richer generation UI is still a follow-up.",
      },
      {
        question: "Why reuse the shared media runtime instead of building a separate music runtime?",
        answer: "Image, video, and music all behave like async media jobs. Reusing the same runtime keeps provider wiring, polling, and task-state handling consistent.",
      },
      {
        question: "Which provider handles AI music jobs?",
        answer: "The MVP routes AI music through a dedicated RunningHub music target, exposed as the new ai-music media target.",
      },
    ],
    asideTitle: "Current integration strategy",
    accessLabel: "Access",
    asideRuntime: "AI music shares the same media runtime contract as image and video, including unified submit and status-query paths.",
    asideAccess: "Execution still requires login and follows the existing protected media access checks.",
    sectionTitle: "What this MVP adds",
    sectionDescription: "The goal is not a second standalone music workspace. It is a platform entry, a visible directory slot, and a real runtime target.",
    cards: [
      {
        title: "Public Entry",
        body: "Ships a dedicated /tools/ai-music page so the capability has a product-facing landing page.",
      },
      {
        title: "Shared Runtime",
        body: "Adds an ai-music target that reuses the platform media runtime for submission and task polling.",
      },
      {
        title: "Directory Visibility",
        body: "Makes AI music visible in both the capability directory and the public tools center instead of hiding it behind future planning notes.",
      },
    ],
    primaryAction: "View capability detail",
    secondaryAction: "Back to tools",
    routeLabel: "Runtime route",
    routeValue: "POST /api/platform/media/run?target=ai-music&action=generate",
    capabilityLabel: "Platform capability",
    capabilityValue: "AI music now shares the unified media task adapter.",
    statusLabel: "Beta",
    whyEntryTitle: "Why ship the entry first",
  }
}

export function getAiMusicPageMetadata(locale: AppLocale): Metadata {
  const copy = getAiMusicPageCopy(locale)
  return {
    title: `${copy.title} | AI Marketing`,
    description: copy.description,
  }
}

export function renderAiMusicPage(locale: AppLocale) {
  const copy = getAiMusicPageCopy(locale)
  const capability = getLocalizedPlatformCapabilityBySlug(locale, "ai-music")
  const capabilityHref = localizePublicPath("/capabilities/ai-music", locale)
  const toolsHref = localizePublicPath("/tools", locale)

  return (
    <ToolShell
      eyebrow={copy.eyebrow}
      title={capability?.title || copy.title}
      description={capability?.summary || copy.description}
      proofPoints={capability?.proofPoints || copy.proofPoints}
      faqTitle={copy.faqTitle}
      faqDescription={copy.faqDescription}
      faq={copy.faq}
      aside={
        <div className="space-y-4 text-sm text-muted-foreground">
          <div className="rounded-2xl border border-border/70 bg-card p-4">
            <div className="flex items-center gap-2 text-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              {copy.asideTitle}
            </div>
            <p className="mt-3 leading-6">{copy.asideRuntime}</p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card p-4">
            <div className="flex items-center gap-2 text-foreground">
              <Lock className="h-4 w-4 text-primary" />
              {copy.accessLabel}
            </div>
            <p className="mt-3 leading-6">{copy.asideAccess}</p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-primary">{copy.routeLabel}</div>
            <p className="mt-3 break-all font-mono text-xs leading-6 text-foreground">{copy.routeValue}</p>
          </div>
        </div>
      }
    >
      <section className="rounded-[2rem] border border-border/70 bg-card/85 p-6">
        <div className="max-w-3xl space-y-3">
          <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
            {capability?.status === "beta" ? copy.statusLabel : "Live"}
          </Badge>
          <h2 className="text-2xl font-semibold text-foreground">{copy.sectionTitle}</h2>
          <p className="text-sm leading-6 text-muted-foreground">{copy.sectionDescription}</p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {copy.cards.map((card, index) => (
            <Card key={card.title} className="border-border/70 bg-background/75 text-foreground">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  {index === 0 ? (
                    <PlayCircle className="h-5 w-5 text-primary" />
                  ) : index === 1 ? (
                    <Clock3 className="h-5 w-5 text-primary" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  )}
                  {card.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">{card.body}</CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <Link href={capabilityHref}>
              {copy.primaryAction}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href={toolsHref}>{copy.secondaryAction}</Link>
          </Button>
        </div>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2">
        <Card className="border-border/70 bg-card/85 text-foreground">
          <CardHeader>
            <CardTitle>{copy.capabilityLabel}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-muted-foreground">{copy.capabilityValue}</CardContent>
        </Card>
        <Card className="border-border/70 bg-card/85 text-foreground">
          <CardHeader>
            <CardTitle>{copy.whyEntryTitle}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-muted-foreground">
            {locale === "zh"
              ? "平台产品化当前先解决“看得见、找得到、能接通运行时”这三件事，再补 richer generation UI。"
              : "This phase solves visibility, discoverability, and runtime wiring first, then leaves room for a richer generation UI later."}
          </CardContent>
        </Card>
      </section>
    </ToolShell>
  )
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale()
  return getAiMusicPageMetadata(locale)
}

export default async function AiMusicPage() {
  const locale = await getRequestLocale()
  return renderAiMusicPage(locale)
}
