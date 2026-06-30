"use client"

import NextImage from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  Bot,
  Calculator,
  Image as ImageIcon,
  LockKeyhole,
  PenTool,
  PlayCircle,
  Sparkles,
  Users2,
} from "lucide-react"

import { useAuth } from "@/components/auth-provider"
import { useI18n } from "@/components/locale-provider"
import { PublicPricingGrid } from "@/components/seo/public-pricing-grid"
import { PublicSiteFooter } from "@/components/seo/public-site-footer"
import { PublicSiteHeader } from "@/components/seo/public-site-header"
import { TrackedCtaLink } from "@/components/seo/tracked-cta-link"
import { Button } from "@/components/ui/button"
import { shouldShowDemoEntry } from "@/lib/auth/demo-entry-visibility"
import { getPublicCopy } from "@/lib/i18n/public-copy"
import { localizePublicPath } from "@/lib/i18n/routing"
import type { PlatformRegistryControlEntry } from "@/lib/platform/control-plane"
import { buildPlatformLaunchPath } from "@/lib/platform/launch-path"
import { SEO_EVENT } from "@/lib/seo/analytics"

const capabilityIcons = [Bot, Sparkles, Users2] as const
const resourceIcons = [Bot, Calculator, PenTool, PlayCircle, ImageIcon, LockKeyhole, Sparkles] as const
const platformCapabilityIcons = {
  "ai-chat": Bot,
  "ai-ppt": Sparkles,
  "ai-image": ImageIcon,
  "ai-video": PlayCircle,
  "agent-platform": Users2,
} as const

const homepageVisuals = {
  hero: {
    src: "/homepage-redesign/hero.png",
    width: 1536,
    height: 1024,
    alt: "AI Marketing homepage hero concept showing a product-led black, yellow, and white workspace design",
  },
  proof: {
    src: "/homepage-redesign/proof.png",
    width: 1693,
    height: 929,
    alt: "Before and after concept showing scattered AI tools converging into one AI Marketing workspace",
  },
  capabilities: {
    src: "/homepage-redesign/capabilities.png",
    width: 1536,
    height: 1024,
    alt: "Capabilities section concept with image-led cards for content, research, visuals, workflows, and team review",
  },
  workflow: {
    src: "/homepage-redesign/workflow.png",
    width: 1717,
    height: 916,
    alt: "Workflow demo concept showing a video storyboard from brief to launch asset",
  },
  useCases: {
    src: "/homepage-redesign/use-cases.png",
    width: 1717,
    height: 916,
    alt: "Use cases section concept showing audience workflows for marketing teams, SEO teams, creators, and founders",
  },
  finalCta: {
    src: "/homepage-redesign/final-cta.png",
    width: 1672,
    height: 941,
    alt: "Final call to action concept for moving one campaign into one workspace",
  },
} as const

function getProviderStatusLabel(status: "active" | "fallback" | "planned", locale: "zh" | "en") {
  if (status === "active") return locale === "zh" ? "已接入" : "Active"
  if (status === "fallback") return locale === "zh" ? "兼容链路" : "Fallback"
  return locale === "zh" ? "规划中" : "Planned"
}

function getHomepageNarrative(locale: "zh" | "en") {
  const isZh = locale === "zh"

  return {
    heroTitle: isZh ? "一份 brief，跑完整个 AI 营销流程" : "One brief. Every AI workflow.",
    heroDescription: isZh
      ? "把策划、调研、文案、图片、视频和复核放进同一个营销工作台。"
      : "Plan, research, write, create visuals, and review work from one shared marketing workspace.",
    watchDemo: isZh ? "看 90 秒演示" : "Watch demo",
    proofTitle: isZh ? "不再反复重建同一份 brief" : "Stop rebuilding the same brief.",
    proofDescription: isZh
      ? "把活动上下文、产出资产和团队复核留在同一个空间。"
      : "Keep campaign context, outputs, and reviews in one shared workspace.",
    beforeLabel: isZh ? "之前" : "Before",
    afterLabel: isZh ? "之后" : "After",
    capabilityTitle: isZh ? "营销工作，不是又一个聊天窗口" : "Marketing work, not another chat tab.",
    capabilityDescription: isZh
      ? "让同一份活动上下文贯穿内容、调研、视觉和团队复核。"
      : "One campaign context travels across content, research, visuals, and team review.",
    workflowTitle: isZh ? "从 brief 到上线资产" : "From brief to launch asset.",
    workflowDescription: isZh
      ? "用视频化流程展示上下文如何穿过调研、文案、视觉和审批。"
      : "A video-style flow shows the same context moving through research, copy, visuals, and approval.",
    platformTitle: isZh ? "把工具入口整理成一个产品工作台" : "Turn tool entry points into a product workspace.",
    platformDescription: isZh
      ? "首页保留 SEO 和工具入口，但第一层表达先让用户看懂工作台本身。"
      : "The homepage keeps SEO and tools reachable, while the first layer explains the workspace itself.",
    audienceTitle: isZh ? "从每周重复的营销工作开始" : "Start with the workflow you repeat every week.",
    audienceDescription: isZh
      ? "先选择场景，再进入围绕这个任务组织好的工作台。"
      : "Pick the job, then open the workspace organized around it.",
    resourcesTitle: isZh ? "需要更细的决策信息？" : "Need the decision details?",
    resourcesDescription: isZh
      ? "价格、成本、替代方案和 SEO 页面放在后半段承接深度阅读。"
      : "Pricing, costs, alternatives, and SEO pages stay lower on the page for deeper evaluation.",
    finalTitle: isZh ? "先把一个活动放进同一个工作台" : "Move one campaign into one workspace.",
    finalDescription: isZh
      ? "从一份 brief 开始，让上下文贯穿每一种输出。"
      : "Start with a brief. Keep the context through every output.",
    openWorkspace: isZh ? "打开工作台" : "Open workspace",
    exploreCapabilities: isZh ? "查看能力入口" : "Explore capabilities",
    browseUseCases: isZh ? "浏览使用场景" : "Browse use cases",
    viewPricing: isZh ? "查看价格" : "View pricing",
    beforeTools: isZh
      ? ["ChatGPT 对话", "Claude 文案", "Gemini 调研", "图片工具", "视频工具"]
      : ["ChatGPT chat", "Claude copy", "Gemini research", "Image tool", "Video tool"],
    workflowSteps: isZh ? ["Brief", "调研", "创作", "复核"] : ["Brief", "Research", "Create", "Review"],
    visualTabs: isZh ? ["文案", "图片", "视频", "复核"] : ["Copy", "Image", "Video", "Review"],
  }
}

function VisualPanel({
  visual,
  priority = false,
  className = "",
}: {
  visual: (typeof homepageVisuals)[keyof typeof homepageVisuals]
  priority?: boolean
  className?: string
}) {
  return (
    <div className={`relative overflow-hidden rounded-[12px] border border-foreground/10 bg-[#111] shadow-2xl ${className}`}>
      <NextImage
        src={visual.src}
        alt={visual.alt}
        width={visual.width}
        height={visual.height}
        priority={priority}
        sizes="(min-width: 1024px) 58vw, 100vw"
        className="h-full w-full object-cover"
      />
      <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10" />
    </div>
  )
}

function ProductDemoVisual() {
  return (
    <div className="relative min-h-[460px] overflow-hidden rounded-[12px] border border-foreground/10 bg-[#111] shadow-2xl">
      <NextImage
        src={homepageVisuals.hero.src}
        alt={homepageVisuals.hero.alt}
        width={homepageVisuals.hero.width}
        height={homepageVisuals.hero.height}
        priority
        sizes="(min-width: 1024px) 58vw, 100vw"
        className="h-full min-h-[460px] w-full object-cover object-right"
      />
      <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10" />
    </div>
  )
}

export function PublicHomePageContent({
  platformCapabilities,
}: {
  platformCapabilities: PlatformRegistryControlEntry[]
}) {
  const { anonymousLogin } = useAuth()
  const { locale } = useI18n()
  const copy = getPublicCopy(locale)
  const router = useRouter()
  const pricingHref = localizePublicPath("/pricing", locale)
  const toolsHref = localizePublicPath("/tools", locale)
  const useCasesHref = localizePublicPath("/use-cases/ai-workspace-for-marketing-teams", locale)
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: copy.home.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  }

  const isDevelopment = shouldShowDemoEntry(typeof window !== "undefined" ? window.location.hostname : null)

  const handleDemoLogin = async () => {
    try {
      await anonymousLogin()
      router.push("/dashboard")
    } catch (error) {
      console.error("Demo login failed:", error)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <PublicSiteHeader />

      <main className="public-grid-bg">
        <section className="mx-auto max-w-7xl px-4 py-6 lg:py-8">
          <div className="grid gap-5 lg:grid-cols-[0.84fr_1.16fr] lg:items-stretch">
            <div className="public-panel flex min-h-[460px] flex-col justify-between overflow-hidden rounded-[12px] bg-background/94 px-6 py-7 lg:px-8 lg:py-8">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="public-kicker rounded-[4px] bg-primary px-3 py-1 text-primary-foreground">
                    {copy.home.systemLabel}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-[4px] border border-foreground/15 px-3 py-1">
                    <span className="public-signal" aria-hidden="true" />
                    <span className="public-kicker text-muted-foreground">{copy.home.campaignControlLabel}</span>
                  </span>
                </div>

                <h1 className="public-display mt-8 max-w-[11ch] text-[3.45rem] text-foreground sm:text-[4.6rem] lg:text-[5.55rem]">
                  {getHomepageNarrative(locale).heroTitle}
                </h1>
                <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
                  {getHomepageNarrative(locale).heroDescription}
                </p>
              </div>

              <div className="mt-8 grid gap-3 sm:flex sm:flex-wrap">
                <Button size="lg" className="public-button-primary h-12 justify-between px-6 sm:min-w-[210px]" asChild>
                  <TrackedCtaLink
                    href="/register"
                    eventName={SEO_EVENT.homepageCtaClick}
                    eventData={{ placement: "hero", cta: "primary", destination: "/register" }}
                  >
                    {copy.home.primaryCta}
                    <ArrowRight className="h-4 w-4" />
                  </TrackedCtaLink>
                </Button>
                <Button size="lg" className="public-button-secondary h-12 justify-between px-6 sm:min-w-[210px]" asChild>
                  <TrackedCtaLink
                    href="#workflow-demo"
                    eventName={SEO_EVENT.homepageCtaClick}
                    eventData={{ placement: "hero", cta: "watch_demo", destination: "#workflow-demo" }}
                  >
                    {getHomepageNarrative(locale).watchDemo}
                    <PlayCircle className="h-4 w-4" />
                  </TrackedCtaLink>
                </Button>
                {isDevelopment ? (
                  <Button
                    size="lg"
                    variant="ghost"
                    className="h-12 rounded-[6px] border border-dashed border-border bg-card px-6 font-display text-xs font-bold uppercase tracking-[0.08em] hover:bg-primary hover:text-primary-foreground"
                    onClick={handleDemoLogin}
                  >
                    {copy.home.demoCta}
                  </Button>
                ) : null}
              </div>
            </div>

            <ProductDemoVisual />
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-6 lg:py-8">
          <div className="grid gap-5 lg:grid-cols-[0.62fr_1.38fr] lg:items-stretch">
            <div className="public-panel rounded-[12px] px-6 py-7 lg:px-7">
              <p className="public-kicker text-muted-foreground">{copy.home.replacementEyebrow}</p>
              <h2 className="mt-4 max-w-lg font-display text-4xl font-extrabold uppercase leading-[0.94] tracking-[-0.04em] text-foreground sm:text-5xl">
                {getHomepageNarrative(locale).proofTitle}
              </h2>
              <p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">{getHomepageNarrative(locale).proofDescription}</p>
            </div>

            <VisualPanel visual={homepageVisuals.proof} className="min-h-[320px]" />
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-8 lg:py-10">
          <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div className="max-w-3xl">
              <h2 className="font-display text-5xl font-extrabold uppercase leading-[0.94] tracking-[-0.04em] text-foreground">
                {getHomepageNarrative(locale).capabilityTitle}
              </h2>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-muted-foreground">{getHomepageNarrative(locale).capabilityDescription}</p>
            </div>
            <Button className="public-button-secondary h-12 px-5" asChild>
              <TrackedCtaLink
                href={toolsHref}
                eventName={SEO_EVENT.homepageCtaClick}
                eventData={{ placement: "capabilities", cta: "explore_tools", destination: toolsHref }}
              >
                {getHomepageNarrative(locale).exploreCapabilities}
              </TrackedCtaLink>
            </Button>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.24fr_0.76fr]">
            <VisualPanel visual={homepageVisuals.capabilities} className="min-h-[520px]" />
            <div className="grid gap-3">
              {copy.home.capabilityCards.map(({ title, description }, index) => {
                const Icon = capabilityIcons[index]
                return (
                  <article key={title} className="rounded-[12px] border border-border bg-card p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="public-kicker text-muted-foreground">{copy.home.capabilityLabel(index + 1)}</div>
                        <h3 className="mt-3 font-display text-2xl font-extrabold uppercase leading-none tracking-[-0.02em] text-foreground">
                          {title}
                        </h3>
                      </div>
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] bg-primary">
                        <Icon className="h-5 w-5 text-primary-foreground" />
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-muted-foreground">{description}</p>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        <section id="workflow-demo" className="mx-auto max-w-7xl px-4 py-8 lg:py-10">
          <div className="overflow-hidden rounded-[12px] border border-foreground/15 bg-[#111] text-white">
            <div className="grid gap-7 px-6 py-8 lg:px-8 lg:py-10">
              <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
                <div className="max-w-3xl">
                  <h2 className="font-display text-5xl font-extrabold uppercase leading-[0.94] tracking-[-0.04em] text-white">
                    {getHomepageNarrative(locale).workflowTitle}
                  </h2>
                  <p className="mt-4 max-w-2xl text-lg leading-8 text-white/68">{getHomepageNarrative(locale).workflowDescription}</p>
                </div>
                <Button className="h-12 rounded-[6px] border border-primary/40 bg-primary px-5 font-display text-xs font-extrabold uppercase tracking-[0.08em] text-primary-foreground hover:bg-primary/92" asChild>
                  <TrackedCtaLink
                    href={toolsHref}
                    eventName={SEO_EVENT.homepageCtaClick}
                    eventData={{ placement: "workflow", cta: "watch_walkthrough", destination: toolsHref }}
                  >
                    {getHomepageNarrative(locale).watchDemo}
                    <PlayCircle className="h-4 w-4" />
                  </TrackedCtaLink>
                </Button>
              </div>

              <VisualPanel visual={homepageVisuals.workflow} className="min-h-[430px] border-white/10" />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-8 lg:py-10">
          <div className="grid gap-5 lg:grid-cols-[0.68fr_1.32fr]">
            <div className="public-panel rounded-[12px] px-6 py-7 lg:px-7">
              <p className="public-kicker text-muted-foreground">{locale === "zh" ? "Platform" : "Platform"}</p>
              <h2 className="mt-4 font-display text-5xl font-extrabold uppercase leading-[0.94] tracking-[-0.04em] text-foreground">
                {getHomepageNarrative(locale).platformTitle}
              </h2>
              <p className="mt-5 max-w-md text-base leading-7 text-muted-foreground">{getHomepageNarrative(locale).platformDescription}</p>
              <div className="mt-6">
                <Button className="public-button-primary h-11 px-5" asChild>
                  <Link href={toolsHref}>
                    {getHomepageNarrative(locale).openWorkspace}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {platformCapabilities.slice(0, 4).map((item) => {
                const Icon = platformCapabilityIcons[item.slug as keyof typeof platformCapabilityIcons] ?? Sparkles
                return (
                  <article key={item.slug} className="rounded-[12px] border border-border bg-card p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="public-kicker text-muted-foreground">{item.capabilityKind?.toUpperCase() || "CAPABILITY"}</div>
                        <h3 className="mt-3 font-display text-2xl font-extrabold uppercase leading-none tracking-[-0.02em] text-foreground">{item.title}</h3>
                      </div>
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] bg-primary">
                        <Icon className="h-5 w-5 text-primary-foreground" />
                      </div>
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">{item.summary}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {(item.bindings ?? []).slice(0, 2).map((binding) => (
                        <span key={`${item.slug}-${binding.provider}`} className="public-system-chip rounded-[4px] px-2.5 py-1.5 text-[11px] leading-5 text-muted-foreground">
                          {binding.provider} · {getProviderStatusLabel(binding.status, locale)}
                        </span>
                      ))}
                    </div>
                    {item.publicHref ? (
                      <Link
                        href={buildPlatformLaunchPath({
                          itemType: "capability",
                          slug: item.slug,
                          surface: "public",
                          locale,
                        })}
                        className="mt-5 inline-flex items-center gap-2 font-display text-xs font-extrabold uppercase tracking-[0.12em] text-foreground transition hover:text-primary-foreground hover:[text-shadow:0_0_0_var(--foreground)]"
                      >
                        {locale === "zh" ? "打开入口" : "Open entry"}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    ) : null}
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-8 lg:py-10">
          <div className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
            <VisualPanel visual={homepageVisuals.useCases} className="min-h-[430px]" />

            <div className="public-panel rounded-[12px] px-6 py-7 lg:px-7">
              <p className="public-kicker text-muted-foreground">{copy.home.audienceEyebrow}</p>
              <h2 className="mt-4 font-display text-5xl font-extrabold uppercase leading-[0.94] tracking-[-0.04em] text-foreground">
                {getHomepageNarrative(locale).audienceTitle}
              </h2>
              <p className="mt-5 text-base leading-7 text-muted-foreground">{getHomepageNarrative(locale).audienceDescription}</p>
              <Button className="public-button-secondary mt-6 h-11 px-5" asChild>
                <TrackedCtaLink
                  href={useCasesHref}
                  eventName={SEO_EVENT.homepageCtaClick}
                  eventData={{ placement: "solutions", cta: "explore_solutions", destination: useCasesHref }}
                >
                  {getHomepageNarrative(locale).browseUseCases}
                </TrackedCtaLink>
              </Button>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-8 lg:py-10">
          <div className="grid gap-5">
            <div className="public-panel rounded-[12px] px-6 py-6 lg:px-7">
              <div className="grid gap-5 lg:grid-cols-[0.72fr_1fr_auto] lg:items-end">
                <div>
                  <p className="public-kicker text-muted-foreground">{locale === "zh" ? "Decision layer" : "Decision layer"}</p>
                  <h2 className="mt-3 max-w-2xl font-display text-4xl font-extrabold uppercase leading-[0.94] tracking-[-0.04em] text-foreground sm:text-5xl">
                    {getHomepageNarrative(locale).resourcesTitle}
                  </h2>
                </div>
                <p className="max-w-xl text-base leading-7 text-muted-foreground lg:pb-1">
                  {getHomepageNarrative(locale).resourcesDescription}
                </p>
                <Button className="public-button-secondary h-11 px-5 lg:self-end" asChild>
                  <TrackedCtaLink
                    href={pricingHref}
                    eventName={SEO_EVENT.homepageCtaClick}
                    eventData={{ placement: "pricing", cta: "open_pricing", destination: pricingHref }}
                  >
                    {getHomepageNarrative(locale).viewPricing}
                  </TrackedCtaLink>
                </Button>
              </div>
            </div>

            <div className="rounded-[12px] border border-border bg-card p-3">
              <PublicPricingGrid compact />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {copy.home.resources.slice(0, 4).map(({ label, title, href }, index) => {
                const Icon = resourceIcons[index]
                return (
                  <Link key={href} href={href} className="group flex items-center gap-4 rounded-[10px] border border-border bg-card px-4 py-4 transition hover:border-primary/60 hover:bg-background">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] bg-primary">
                      <Icon className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="public-kicker text-muted-foreground">{label}</p>
                      <h3 className="mt-1 line-clamp-2 font-display text-lg font-extrabold uppercase leading-tight tracking-[0.01em] text-foreground">{title}</h3>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-8 lg:py-10">
          <div className="grid gap-px overflow-hidden rounded-[12px] border border-border bg-border lg:grid-cols-2">
            {copy.home.faqs.map((faq) => (
              <article key={faq.question} className="bg-card px-6 py-6">
                <h3 className="font-display text-2xl font-extrabold uppercase leading-tight tracking-[-0.01em] text-foreground">{faq.question}</h3>
                <p className="mt-3 text-base leading-7 text-muted-foreground">{faq.answer}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-8 lg:py-12">
          <div className="relative overflow-hidden rounded-[12px] border border-foreground/15 bg-[#111] px-6 py-10 text-white lg:px-8 lg:py-12">
            <div className="absolute inset-x-0 bottom-0 h-28 bg-primary" />
            <div className="relative mx-auto max-w-3xl text-center">
              <h2 className="font-display text-5xl font-extrabold uppercase leading-[0.94] tracking-[-0.04em] text-white sm:text-6xl">
                {getHomepageNarrative(locale).finalTitle}
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-white/72">{getHomepageNarrative(locale).finalDescription}</p>

              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Button size="lg" className="h-12 rounded-[6px] border border-primary bg-primary px-6 font-display text-xs font-extrabold uppercase tracking-[0.08em] text-primary-foreground hover:bg-primary/92" asChild>
                  <TrackedCtaLink
                    href="/register"
                    eventName={SEO_EVENT.homepageCtaClick}
                    eventData={{ placement: "final_cta", cta: "primary", destination: "/register" }}
                  >
                    {copy.home.primaryCta}
                    <ArrowRight className="h-4 w-4" />
                  </TrackedCtaLink>
                </Button>
                <Button size="lg" className="h-12 rounded-[6px] border border-white/24 bg-transparent px-6 font-display text-xs font-extrabold uppercase tracking-[0.08em] text-white hover:bg-white/10" asChild>
                  <TrackedCtaLink
                    href={pricingHref}
                    eventName={SEO_EVENT.homepageCtaClick}
                    eventData={{ placement: "final_cta", cta: "pricing", destination: pricingHref }}
                  >
                    {getHomepageNarrative(locale).viewPricing}
                  </TrackedCtaLink>
                </Button>
              </div>
            </div>

            <VisualPanel visual={homepageVisuals.finalCta} className="relative mx-auto mt-10 max-w-5xl border-white/12" />
          </div>
        </section>

        <PublicSiteFooter />
      </main>
    </div>
  )
}
