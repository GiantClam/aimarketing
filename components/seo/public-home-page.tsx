"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  Bot,
  Calculator,
  CheckCircle2,
  Image,
  LayoutGrid,
  LineChart,
  LockKeyhole,
  Network,
  PenTool,
  PlayCircle,
  Plug,
  Search,
  Sparkles,
  Users2,
  Workflow,
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
import { getLocalizedPlatformHubLinks } from "@/lib/platform/catalog"
import type { PlatformRegistryControlEntry } from "@/lib/platform/control-plane"
import { buildPlatformLaunchPath } from "@/lib/platform/launch-path"
import { SEO_EVENT } from "@/lib/seo/analytics"

const capabilityIcons = [Bot, Sparkles, Users2] as const
const audienceIcons = [LineChart, Search, PenTool, LockKeyhole] as const
const resourceIcons = [Bot, Calculator, PenTool, PlayCircle, Image, LockKeyhole, Sparkles] as const
const platformHubIcons = {
  capabilities: LayoutGrid,
  agents: Users2,
  plugins: Plug,
  "mcp-services": Network,
  workflows: Workflow,
} as const
const platformCapabilityIcons = {
  "ai-chat": Bot,
  "ai-ppt": Sparkles,
  "ai-image": Image,
  "ai-video": PlayCircle,
  "agent-platform": Users2,
} as const

function getProviderStatusLabel(status: "active" | "fallback" | "planned", locale: "zh" | "en") {
  if (status === "active") return locale === "zh" ? "已接入" : "Active"
  if (status === "fallback") return locale === "zh" ? "兼容链路" : "Fallback"
  return locale === "zh" ? "规划中" : "Planned"
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
  const platformHubs = getLocalizedPlatformHubLinks(locale)
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
        <section className="public-page-hero-shell mx-auto max-w-7xl">
          <div className="public-panel grid overflow-hidden rounded-[12px] bg-background/90 lg:grid-cols-[minmax(0,1.12fr)_390px]">
            <div className="border-b border-border px-6 py-8 lg:border-b-0 lg:border-r lg:px-8 lg:py-10">
              <div className="grid gap-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="public-kicker rounded-[6px] border border-primary/35 bg-primary px-3 py-1 text-primary-foreground">
                    {copy.home.eyebrow}
                  </span>
                  <span className="public-system-chip public-kicker rounded-[4px] px-3 py-1 text-muted-foreground">
                    {copy.home.systemLabel}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-[4px] border border-border px-3 py-1">
                    <span className="public-signal" aria-hidden="true" />
                    <span className="public-kicker text-muted-foreground">{copy.home.campaignControlLabel}</span>
                  </span>
                </div>

                <div className="max-w-5xl">
                  <h1 className="public-display max-w-5xl text-[3.35rem] text-foreground sm:text-[4.75rem] lg:text-[6.4rem]">
                    {copy.home.title}
                  </h1>
                  <p className="mt-6 max-w-3xl text-base leading-8 text-muted-foreground sm:text-lg">
                    {copy.home.description}
                  </p>
                  <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">{copy.home.supportingCopy}</p>
                </div>

                <div className="grid gap-3 sm:flex sm:flex-wrap">
                  <Button size="lg" className="public-button-primary h-13 justify-between px-6 sm:min-w-[230px]" asChild>
                    <TrackedCtaLink
                      href="/register"
                      eventName={SEO_EVENT.homepageCtaClick}
                      eventData={{ placement: "hero", cta: "primary", destination: "/register" }}
                    >
                      {copy.home.primaryCta}
                      <ArrowRight className="h-4 w-4" />
                    </TrackedCtaLink>
                  </Button>
                  <Button size="lg" className="public-button-secondary h-13 px-6 sm:min-w-[230px]" asChild>
                    <TrackedCtaLink
                      href={pricingHref}
                      eventName={SEO_EVENT.homepageCtaClick}
                      eventData={{ placement: "hero", cta: "pricing", destination: pricingHref }}
                    >
                      {copy.home.compareCta}
                    </TrackedCtaLink>
                  </Button>
                  <Button size="lg" className="public-button-secondary h-13 px-6 sm:min-w-[230px]" asChild>
                    <TrackedCtaLink
                      href={useCasesHref}
                      eventName={SEO_EVENT.homepageCtaClick}
                      eventData={{ placement: "hero", cta: "use_cases", destination: useCasesHref }}
                    >
                      {copy.home.calculatorCta}
                    </TrackedCtaLink>
                  </Button>
                  {isDevelopment ? (
                    <Button
                      size="lg"
                      variant="ghost"
                      className="h-13 rounded-[8px] border border-dashed border-border bg-card px-6 font-display text-xs font-bold uppercase tracking-[0.08em] hover:bg-primary hover:text-primary-foreground"
                      onClick={handleDemoLogin}
                    >
                      {copy.home.demoCta}
                    </Button>
                  ) : null}
                </div>

                <div className="grid gap-2 lg:grid-cols-3">
                  {copy.home.trustPoints.map((point, index) => (
                    <div
                      key={point}
                      className="public-tag grid grid-cols-[28px_minmax(0,1fr)] items-start gap-3 rounded-[8px] px-4 py-3 text-sm"
                    >
                      <span className="font-display text-base font-bold text-primary">{String(index + 1).padStart(2, "0")}</span>
                      <span className="leading-6 text-foreground/88">{point}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <aside className="grid bg-card/70">
              <div className="border-b border-border px-6 py-5">
                <div className="public-kicker text-muted-foreground">{copy.home.replacementEyebrow}</div>
                <div className="mt-2 font-display text-3xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                  {copy.home.replacementTitle}
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{copy.home.sharedOutputLabel}</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="public-system-chip rounded-[4px] px-3 py-2">
                    <div className="public-kicker text-foreground/56">{copy.home.modeLabel}</div>
                    <div className="mt-1 font-display text-sm font-bold uppercase tracking-[0.06em] text-foreground">
                      {copy.home.modeValue}
                    </div>
                  </div>
                  <div className="public-system-chip rounded-[4px] px-3 py-2">
                    <div className="public-kicker text-foreground/56">{copy.home.statusLabel}</div>
                    <div className="mt-1 inline-flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.06em] text-foreground">
                      <span className="public-signal" aria-hidden="true" />
                      {copy.home.statusValue}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid gap-0">
                {copy.home.replacementStack.map((tool, index) => (
                  <div key={tool} className="grid grid-cols-[54px_minmax(0,1fr)] items-center border-b border-border px-6 py-4 last:border-b-0">
                    <span className="font-display text-2xl font-extrabold text-foreground/20">{String(index + 1).padStart(2, "0")}</span>
                    <span className="font-display text-lg font-bold uppercase tracking-[0.02em] text-foreground">{tool}</span>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </section>

        <section className="public-page-section-shell mx-auto max-w-7xl">
          <div className="grid gap-px overflow-hidden rounded-[12px] border border-border bg-border lg:grid-cols-3">
            {copy.home.capabilityCards.map(({ title, description }, index) => {
              const Icon = capabilityIcons[index]
              return (
                <article key={title} className="bg-card px-6 py-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="public-kicker text-muted-foreground">{copy.home.capabilityLabel(index + 1)}</div>
                    <div className="flex h-11 w-11 items-center justify-center rounded-[6px] border border-primary/30 bg-primary/95">
                      <Icon className="h-5 w-5 text-primary-foreground" />
                    </div>
                  </div>
                  <h2 className="mt-6 font-display text-3xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                    {title}
                  </h2>
                  <p className="mt-3 max-w-md text-base leading-7 text-muted-foreground">{description}</p>
                </article>
              )
            })}
          </div>
        </section>

        <section className="public-page-section-shell mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[0.78fr_1.22fr]">
            <div className="public-panel rounded-[12px] px-6 py-6 lg:px-7 lg:py-7">
              <p className="public-kicker text-muted-foreground">{locale === "zh" ? "Platform Directories" : "Platform Directories"}</p>
              <h2 className="mt-3 font-display text-5xl font-extrabold uppercase tracking-[-0.04em] text-foreground">
                {locale === "zh" ? "把工具站扩成平台入口" : "Expand the toolsite into a platform front door"}
              </h2>
              <p className="mt-4 max-w-xl text-lg leading-8 text-muted-foreground">
                {locale === "zh"
                  ? "公开前台继续承接 SEO、注册和工具试用，但入口不再只停留在单点工具，而是可以直接进入能力中心、智能体广场、插件目录、MCP 服务和工作流模板。"
                  : "The public front door still handles SEO, signup, and trial usage, but it no longer stops at one-off tools. It now opens directly into capabilities, agents, plugins, MCP services, and workflow templates."}
              </p>
              <div className="mt-5">
                <Button className="public-button-primary h-10 px-4" asChild>
                  <Link href={toolsHref}>
                    {locale === "zh" ? "进入应用中心" : "Open app center"}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
              <div className="mt-6 grid gap-3">
                {platformHubs.map((hub) => {
                  const Icon = platformHubIcons[hub.slug as keyof typeof platformHubIcons] ?? LayoutGrid
                  return (
                    <Link
                      key={hub.slug}
                      href={localizePublicPath(hub.href, locale)}
                      className="group rounded-[8px] border border-border bg-card/70 px-4 py-4 transition hover:border-primary/35 hover:bg-background"
                    >
                      <div className="flex items-start gap-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[6px] border border-primary/30 bg-primary/95">
                          <Icon className="h-5 w-5 text-primary-foreground" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-display text-xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                            {hub.title}
                          </div>
                          <p className="mt-2 text-sm leading-7 text-muted-foreground">{hub.summary}</p>
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>

            <div className="grid gap-px overflow-hidden rounded-[12px] border border-border bg-border xl:grid-cols-2">
              {platformCapabilities.map((item) => {
                const Icon = platformCapabilityIcons[item.slug as keyof typeof platformCapabilityIcons] ?? Sparkles
                return (
                  <article key={item.slug} className="bg-card px-6 py-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-3">
                        <div className="public-kicker text-muted-foreground">
                          {item.capabilityKind?.toUpperCase() || "CAPABILITY"}
                        </div>
                        <h3 className="font-display text-3xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                          {item.title}
                        </h3>
                      </div>
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[6px] border border-primary/30 bg-primary/95">
                        <Icon className="h-5 w-5 text-primary-foreground" />
                      </div>
                    </div>

                    <p className="mt-4 text-sm leading-7 text-muted-foreground">{item.summary}</p>

                    <div className="mt-5 flex flex-wrap gap-2">
                      {(item.bindings ?? []).map((binding) => (
                        <span key={`${item.slug}-${binding.provider}`} className="public-system-chip rounded-[4px] px-3 py-2 text-xs leading-5 text-muted-foreground">
                          {binding.provider} · {getProviderStatusLabel(binding.status, locale)}
                        </span>
                      ))}
                    </div>

                    <div className="mt-5 space-y-2">
                      {item.proofPoints.slice(0, 2).map((point) => (
                        <div key={point} className="public-tag rounded-[6px] px-3 py-2 text-sm text-foreground/82">
                          {point}
                        </div>
                      ))}
                    </div>

                    <div className="mt-6 flex flex-wrap gap-3">
                      {item.publicHref ? (
                        <Button className="public-button-primary h-10 px-4" asChild>
                          <Link
                            href={buildPlatformLaunchPath({
                              itemType: "capability",
                              slug: item.slug,
                              surface: "public",
                              locale,
                            })}
                          >
                            {locale === "zh" ? "打开入口" : "Open Entry"}
                          </Link>
                        </Button>
                      ) : null}
                      {item.workspaceHref ? (
                        <Button className="public-button-secondary h-10 px-4" asChild>
                          <Link
                            href={buildPlatformLaunchPath({
                              itemType: "capability",
                              slug: item.slug,
                              surface: "workspace",
                              locale,
                            })}
                          >
                            {locale === "zh" ? "企业工作台" : "Workspace"}
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        <section className="public-page-section-shell mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr]">
            <div className="public-panel rounded-[12px] px-6 py-6 lg:px-7 lg:py-7">
              <p className="public-kicker text-muted-foreground">{copy.home.workflowEyebrow}</p>
              <h2 className="mt-3 font-display text-5xl font-extrabold uppercase tracking-[-0.04em] text-foreground">
                {copy.home.workflowTitle}
              </h2>
              <p className="mt-4 max-w-xl text-lg leading-8 text-muted-foreground">{copy.home.workflowDescription}</p>
            </div>

            <div className="grid gap-px overflow-hidden rounded-[12px] border border-border bg-border">
              {copy.home.workflows.map((step, index) => (
                <article key={step.title} className="grid gap-4 bg-card px-6 py-5 lg:grid-cols-[72px_minmax(0,1fr)]">
                  <div className="font-display text-5xl font-extrabold leading-none text-primary">{String(index + 1).padStart(2, "0")}</div>
                  <div>
                    <h3 className="font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-base leading-7 text-muted-foreground">{step.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="public-page-section-shell mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-6 border-b border-border pb-6 md:flex-row md:items-end">
            <div>
              <p className="public-kicker text-muted-foreground">{copy.home.audienceEyebrow}</p>
              <h2 className="mt-3 font-display text-5xl font-extrabold uppercase tracking-[-0.04em] text-foreground">
                {copy.home.audienceTitle}
              </h2>
            </div>
            <Button className="public-button-secondary h-12 px-5" asChild>
              <TrackedCtaLink
                href={useCasesHref}
                eventName={SEO_EVENT.homepageCtaClick}
                eventData={{ placement: "solutions", cta: "explore_solutions", destination: useCasesHref }}
              >
                {copy.home.exploreSolutionsCta}
              </TrackedCtaLink>
            </Button>
          </div>

          <div className="mt-8 grid gap-px overflow-hidden rounded-[12px] border border-border bg-border lg:grid-cols-2 xl:grid-cols-4">
            {copy.home.audienceCards.map(({ title, description, href }, index) => {
              const Icon = audienceIcons[index] || Sparkles
              return (
                <Link
                  key={title}
                  href={href}
                  className="group bg-card px-6 py-6 transition hover:bg-background"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="public-kicker text-muted-foreground">{copy.home.useCaseLabel(index + 1)}</div>
                    <div className="flex h-11 w-11 items-center justify-center rounded-[6px] border border-primary/30 bg-primary/95">
                      <Icon className="h-5 w-5 text-primary-foreground" />
                    </div>
                  </div>
                  <h3 className="mt-6 font-display text-3xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                    {title}
                  </h3>
                  <p className="mt-3 max-w-sm text-sm leading-7 text-muted-foreground">{description}</p>
                  <div className="mt-5 font-display text-xs font-bold uppercase tracking-[0.16em] text-foreground/58 group-hover:text-foreground">
                    {copy.home.openDetailLabel}
                  </div>
                </Link>
              )
            })}
          </div>
        </section>

        <section className="public-page-section-shell mx-auto max-w-7xl">
          <div className="grid gap-px overflow-hidden rounded-[12px] border border-border bg-border lg:grid-cols-3">
            {copy.home.resources.map(({ label, title, href }, index) => {
              const Icon = resourceIcons[index]
              return (
                <Link key={href} href={href} className="group flex items-center gap-4 bg-card px-5 py-5 transition hover:bg-background">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[6px] border border-primary/30 bg-primary/95">
                    <Icon className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="public-kicker text-muted-foreground">{label}</p>
                    <h3 className="mt-1 font-display text-xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                      {title}
                    </h3>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>

        <section className="public-page-section-shell mx-auto max-w-7xl">
          <div className="flex flex-col justify-between gap-6 border-b border-border pb-6 md:flex-row md:items-end">
            <div className="max-w-3xl">
              <p className="public-kicker text-muted-foreground">{copy.home.pricingEyebrow}</p>
              <h2 className="mt-3 font-display text-5xl font-extrabold uppercase tracking-[-0.04em] text-foreground">
                {copy.home.pricingTitle}
              </h2>
              <p className="mt-4 text-lg leading-8 text-muted-foreground">{copy.home.pricingDescription}</p>
            </div>
            <Button className="public-button-secondary h-12 px-5" asChild>
              <TrackedCtaLink
                href={pricingHref}
                eventName={SEO_EVENT.homepageCtaClick}
                eventData={{ placement: "pricing", cta: "open_pricing", destination: pricingHref }}
              >
                {copy.home.pricingCta}
              </TrackedCtaLink>
            </Button>
          </div>

          <div className="mt-8">
            <PublicPricingGrid compact />
          </div>
        </section>

        <section className="public-page-section-shell mx-auto max-w-7xl">
          <div className="border-b border-border pb-6">
            <p className="public-kicker text-muted-foreground">{copy.home.faqEyebrow}</p>
            <h2 className="mt-3 font-display text-5xl font-extrabold uppercase tracking-[-0.04em] text-foreground">
              {copy.home.faqTitle}
            </h2>
          </div>

          <div className="mt-8 grid gap-px overflow-hidden rounded-[12px] border border-border bg-border lg:grid-cols-2">
            {copy.home.faqs.map((faq) => (
              <article key={faq.question} className="bg-card px-6 py-6">
                <h3 className="font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">{faq.question}</h3>
                <p className="mt-3 text-base leading-7 text-muted-foreground">{faq.answer}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="public-page-section-shell mx-auto max-w-7xl">
          <div className="overflow-hidden rounded-[12px] border border-primary/30 bg-primary text-primary-foreground shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)]">
            <div className="grid gap-8 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_260px] lg:px-8 lg:py-10">
              <div className="max-w-3xl">
                <p className="public-kicker text-primary-foreground/60">{copy.home.finalEyebrow}</p>
                <h2 className="mt-3 font-display text-5xl font-extrabold uppercase tracking-[-0.04em] text-primary-foreground">
                  {copy.home.finalTitle}
                </h2>
                <p className="mt-4 text-lg leading-8 text-primary-foreground/80">{copy.home.finalDescription}</p>

                <div className="mt-8 flex flex-wrap gap-3">
                  <Button size="lg" className="h-12 rounded-[8px] border border-primary-foreground/20 bg-accent px-6 font-display text-xs font-bold uppercase tracking-[0.08em] text-accent-foreground hover:bg-accent/92" asChild>
                    <TrackedCtaLink
                      href="/register"
                      eventName={SEO_EVENT.homepageCtaClick}
                      eventData={{ placement: "final_cta", cta: "primary", destination: "/register" }}
                    >
                      {copy.home.primaryCta}
                    </TrackedCtaLink>
                  </Button>
                  <Button size="lg" className="h-12 rounded-[8px] border border-primary-foreground/30 bg-transparent px-6 font-display text-xs font-bold uppercase tracking-[0.08em] text-primary-foreground hover:bg-primary-foreground/10" asChild>
                    <TrackedCtaLink
                      href={useCasesHref}
                      eventName={SEO_EVENT.homepageCtaClick}
                      eventData={{ placement: "final_cta", cta: "use_cases", destination: useCasesHref }}
                    >
                      {copy.home.calculatorCta}
                    </TrackedCtaLink>
                  </Button>
                </div>
              </div>

              <div className="grid gap-px self-stretch overflow-hidden rounded-[8px] border border-primary-foreground/18 bg-primary-foreground/18">
                {copy.home.trustPoints.slice(0, 3).map((point, index) => (
                  <div key={point} className="grid grid-cols-[26px_minmax(0,1fr)] gap-3 bg-primary px-4 py-4">
                    <CheckCircle2 className="mt-1 h-4 w-4 text-primary-foreground/72" />
                    <div>
                      <div className="font-display text-sm font-bold uppercase tracking-[0.08em] text-primary-foreground/62">
                        {copy.home.signalLabel(index + 1)}
                      </div>
                      <div className="mt-1 text-sm leading-6 text-primary-foreground/82">{point}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <PublicSiteFooter />
      </main>
    </div>
  )
}
