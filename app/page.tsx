"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  Bot,
  Calculator,
  CheckCircle2,
  Image,
  LineChart,
  LockKeyhole,
  PenTool,
  PlayCircle,
  Search,
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
import { getPublicCopy } from "@/lib/i18n/public-copy"
import { SEO_EVENT } from "@/lib/seo/analytics"

const capabilityIcons = [Bot, Sparkles, Users2] as const
const audienceIcons = [LineChart, Search, LockKeyhole] as const
const resourceIcons = [Calculator, PenTool, PlayCircle, Image, LockKeyhole, Sparkles] as const

export default function HomePage() {
  const { anonymousLogin } = useAuth()
  const { locale } = useI18n()
  const copy = getPublicCopy(locale)
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
    <div className="min-h-screen bg-background text-foreground">
      <PublicSiteHeader />

      <main className="public-grid-bg">
        <section className="mx-auto max-w-7xl px-6 py-10 lg:py-14">
          <div className="public-panel grid overflow-hidden rounded-[12px] bg-background/90 lg:grid-cols-[minmax(0,1.12fr)_390px]">
            <div className="border-b border-border px-6 py-8 lg:border-b-0 lg:border-r lg:px-8 lg:py-10">
              <div className="grid gap-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="public-kicker rounded-[6px] border border-primary/35 bg-primary px-3 py-1 text-primary-foreground">
                    {copy.home.eyebrow}
                  </span>
                  <span className="public-system-chip public-kicker rounded-[4px] px-3 py-1 text-muted-foreground">
                    AI Marketing System
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-[4px] border border-border px-3 py-1">
                    <span className="public-signal" aria-hidden="true" />
                    <span className="public-kicker text-muted-foreground">Campaign Control</span>
                  </span>
                </div>

                <div className="max-w-5xl">
                  <h1 className="public-display max-w-5xl text-[3.35rem] text-foreground sm:text-[4.75rem] lg:text-[6.4rem]">
                    {copy.home.title}
                  </h1>
                  <p className="mt-6 max-w-3xl text-base leading-8 text-muted-foreground sm:text-lg">
                    {copy.home.description}
                  </p>
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
                      href="/alternatives/chatgpt-team-alternative"
                      eventName={SEO_EVENT.homepageCtaClick}
                      eventData={{ placement: "hero", cta: "compare", destination: "/alternatives/chatgpt-team-alternative" }}
                    >
                      {copy.home.compareCta}
                    </TrackedCtaLink>
                  </Button>
                  <Button size="lg" className="public-button-secondary h-13 px-6 sm:min-w-[230px]" asChild>
                    <TrackedCtaLink
                      href="/resources/ai-subscription-cost-calculator"
                      eventName={SEO_EVENT.homepageCtaClick}
                      eventData={{ placement: "hero", cta: "calculator", destination: "/resources/ai-subscription-cost-calculator" }}
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
                <div className="public-kicker text-muted-foreground">Replacement Stack</div>
                <div className="mt-2 font-display text-3xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                  {copy.home.replacementTitle}
                </div>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">{copy.home.sharedOutputLabel}</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="public-system-chip rounded-[4px] px-3 py-2">
                    <div className="public-kicker text-foreground/56">Mode</div>
                    <div className="mt-1 font-display text-sm font-bold uppercase tracking-[0.06em] text-foreground">
                      Brand Stack
                    </div>
                  </div>
                  <div className="public-system-chip rounded-[4px] px-3 py-2">
                    <div className="public-kicker text-foreground/56">Status</div>
                    <div className="mt-1 inline-flex items-center gap-2 font-display text-sm font-bold uppercase tracking-[0.06em] text-foreground">
                      <span className="public-signal" aria-hidden="true" />
                      Live
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

        <section className="mx-auto max-w-7xl px-6 py-8 lg:py-10">
          <div className="grid gap-px overflow-hidden rounded-[12px] border border-border bg-border lg:grid-cols-3">
            {copy.home.capabilityCards.map(({ title, description }, index) => {
              const Icon = capabilityIcons[index]
              return (
                <article key={title} className="bg-card px-6 py-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="public-kicker text-muted-foreground">Capability {String(index + 1).padStart(2, "0")}</div>
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

        <section className="mx-auto max-w-7xl px-6 py-8 lg:py-10">
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

        <section className="mx-auto max-w-7xl px-6 py-8 lg:py-10">
          <div className="flex flex-col justify-between gap-6 border-b border-border pb-6 md:flex-row md:items-end">
            <div>
              <p className="public-kicker text-muted-foreground">{copy.home.audienceEyebrow}</p>
              <h2 className="mt-3 font-display text-5xl font-extrabold uppercase tracking-[-0.04em] text-foreground">
                {copy.home.audienceTitle}
              </h2>
            </div>
            <Button className="public-button-secondary h-12 px-5" asChild>
              <TrackedCtaLink
                href="/solutions/ai-for-small-marketing-teams"
                eventName={SEO_EVENT.homepageCtaClick}
                eventData={{ placement: "solutions", cta: "explore_solutions", destination: "/solutions/ai-for-small-marketing-teams" }}
              >
                {copy.home.exploreSolutionsCta}
              </TrackedCtaLink>
            </Button>
          </div>

          <div className="mt-8 grid gap-px overflow-hidden rounded-[12px] border border-border bg-border lg:grid-cols-3">
            {copy.home.audienceCards.map(({ title, description, href }, index) => {
              const Icon = audienceIcons[index]
              return (
                <Link
                  key={title}
                  href={href}
                  className="group bg-card px-6 py-6 transition hover:bg-background"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="public-kicker text-muted-foreground">Use Case {String(index + 1).padStart(2, "0")}</div>
                    <div className="flex h-11 w-11 items-center justify-center rounded-[6px] border border-primary/30 bg-primary/95">
                      <Icon className="h-5 w-5 text-primary-foreground" />
                    </div>
                  </div>
                  <h3 className="mt-6 font-display text-3xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                    {title}
                  </h3>
                  <p className="mt-3 max-w-sm text-sm leading-7 text-muted-foreground">{description}</p>
                  <div className="mt-5 font-display text-xs font-bold uppercase tracking-[0.16em] text-foreground/58 group-hover:text-foreground">
                    Open Detail
                  </div>
                </Link>
              )
            })}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-8 lg:py-10">
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

        <section className="mx-auto max-w-7xl px-6 py-8 lg:py-10">
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
                href="/pricing"
                eventName={SEO_EVENT.homepageCtaClick}
                eventData={{ placement: "pricing", cta: "open_pricing", destination: "/pricing" }}
              >
                {copy.home.pricingCta}
              </TrackedCtaLink>
            </Button>
          </div>

          <div className="mt-8">
            <PublicPricingGrid compact />
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-8 lg:py-12">
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
                      href="/resources/ai-subscription-cost-calculator"
                      eventName={SEO_EVENT.homepageCtaClick}
                      eventData={{ placement: "final_cta", cta: "calculator", destination: "/resources/ai-subscription-cost-calculator" }}
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
                        Signal {String(index + 1).padStart(2, "0")}
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
