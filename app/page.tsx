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
import { TrackedCtaLink } from "@/components/seo/tracked-cta-link"
import { PublicPricingGrid } from "@/components/seo/public-pricing-grid"
import { PublicSiteFooter } from "@/components/seo/public-site-footer"
import { PublicSiteHeader } from "@/components/seo/public-site-header"
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

      <main>
        <section className="mx-auto max-w-7xl px-6 py-16 lg:py-22">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-muted-foreground">{copy.home.eyebrow}</p>
              <h1 className="mt-5 max-w-4xl text-5xl font-semibold leading-[1.04] tracking-normal lg:text-7xl">
                {copy.home.title}
              </h1>
              <p className="mt-7 max-w-3xl text-lg leading-8 text-muted-foreground">{copy.home.description}</p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Button size="lg" className="rounded-full px-8" asChild>
                  <TrackedCtaLink
                    href="/register"
                    eventName={SEO_EVENT.homepageCtaClick}
                    eventData={{ placement: "hero", cta: "primary", destination: "/register" }}
                  >
                    {copy.home.primaryCta}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </TrackedCtaLink>
                </Button>
                <Button size="lg" variant="outline" className="rounded-full border-2 border-border bg-card px-8" asChild>
                  <TrackedCtaLink
                    href="/alternatives/chatgpt-team-alternative"
                    eventName={SEO_EVENT.homepageCtaClick}
                    eventData={{ placement: "hero", cta: "compare", destination: "/alternatives/chatgpt-team-alternative" }}
                  >
                    {copy.home.compareCta}
                  </TrackedCtaLink>
                </Button>
                <Button size="lg" variant="outline" className="rounded-full border-2 border-border bg-card px-8" asChild>
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
                    className="rounded-full border-2 border-dashed border-border bg-card px-8 hover:bg-primary hover:text-primary-foreground"
                    onClick={handleDemoLogin}
                  >
                    {copy.home.demoCta}
                  </Button>
                ) : null}
              </div>

              <div className="mt-10 flex flex-wrap gap-3">
                {copy.home.trustPoints.map((point) => (
                  <div key={point} className="inline-flex items-center gap-2 rounded-full border-2 border-border bg-card px-4 py-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-secondary" />
                    {point}
                  </div>
                ))}
              </div>
            </div>

            <aside className="rounded-[30px] border-2 border-border bg-card p-6">
              <div className="rounded-[24px] border-2 border-border bg-background p-5">
                <p className="text-sm uppercase tracking-[0.22em] text-muted-foreground">{copy.home.replacementEyebrow}</p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {copy.home.replacementStack.map((tool) => (
                    <div key={tool} className="rounded-[16px] bg-card px-3 py-3 text-sm font-medium">
                      {tool}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 rounded-[24px] bg-accent p-5 text-accent-foreground">
                <p className="text-sm text-accent-foreground/70">{copy.home.sharedOutputLabel}</p>
                <h2 className="mt-2 text-2xl font-semibold leading-tight">{copy.home.replacementTitle}</h2>
              </div>
            </aside>
          </div>
        </section>

        <section className="border-y border-border bg-card">
          <div className="mx-auto max-w-7xl px-6 py-16">
            <div className="grid gap-5 lg:grid-cols-3">
              {copy.home.capabilityCards.map(({ title, description }, index) => {
                const Icon = capabilityIcons[index]
                return (
                  <article key={title} className="rounded-[26px] border-2 border-border bg-background p-6">
                    <div className="flex h-13 w-13 items-center justify-center rounded-[18px] bg-primary">
                      <Icon className="h-6 w-6 text-primary-foreground" />
                    </div>
                    <h2 className="mt-6 text-2xl font-semibold text-foreground">{title}</h2>
                    <p className="mt-3 text-base leading-7 text-muted-foreground">{description}</p>
                  </article>
                )
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-16">
          <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-muted-foreground">{copy.home.workflowEyebrow}</p>
              <h2 className="mt-3 text-4xl font-semibold text-foreground">{copy.home.workflowTitle}</h2>
              <p className="mt-4 text-lg leading-8 text-muted-foreground">{copy.home.workflowDescription}</p>
            </div>

            <div className="grid gap-4">
              {copy.home.workflows.map((step, index) => (
                <article key={step.title} className="flex gap-4 rounded-[24px] border-2 border-border bg-card p-5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                    {index + 1}
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-foreground">{step.title}</h3>
                    <p className="mt-2 text-base leading-7 text-muted-foreground">{step.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-16">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-muted-foreground">{copy.home.audienceEyebrow}</p>
              <h2 className="mt-3 text-4xl font-semibold text-foreground">{copy.home.audienceTitle}</h2>
            </div>
            <Button variant="outline" className="rounded-full border-2 border-border bg-card" asChild>
              <TrackedCtaLink
                href="/solutions/ai-for-small-marketing-teams"
                eventName={SEO_EVENT.homepageCtaClick}
                eventData={{ placement: "solutions", cta: "explore_solutions", destination: "/solutions/ai-for-small-marketing-teams" }}
              >
                {copy.home.exploreSolutionsCta}
              </TrackedCtaLink>
            </Button>
          </div>

          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {copy.home.audienceCards.map(({ title, description, href }, index) => {
              const Icon = audienceIcons[index]
              return (
                <Link key={title} href={href} className="rounded-[26px] border-2 border-border bg-card p-6 transition hover:-translate-y-0.5 hover:border-foreground/25">
                  <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-accent">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="mt-5 text-xl font-semibold text-foreground">{title}</h3>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">{description}</p>
                </Link>
              )
            })}
          </div>
        </section>

        <section className="border-y border-border bg-card">
          <div className="mx-auto grid max-w-7xl gap-5 px-6 py-16 lg:grid-cols-3">
            {copy.home.resources.map(({ label, title, href }, index) => {
              const Icon = resourceIcons[index]
              return (
                <Link key={href} href={href} className="flex items-center gap-4 rounded-[22px] border-2 border-border bg-background p-5 transition hover:border-foreground/25">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-primary">
                    <Icon className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
                    <h3 className="mt-1 text-lg font-semibold text-foreground">{title}</h3>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-16">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div className="max-w-3xl">
              <p className="text-sm uppercase tracking-[0.24em] text-muted-foreground">{copy.home.pricingEyebrow}</p>
              <h2 className="mt-3 text-4xl font-semibold text-foreground">{copy.home.pricingTitle}</h2>
              <p className="mt-4 text-lg leading-8 text-muted-foreground">{copy.home.pricingDescription}</p>
            </div>
            <Button variant="outline" className="rounded-full border-2 border-border bg-card" asChild>
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

        <section className="bg-primary">
          <div className="mx-auto max-w-7xl px-6 py-16">
            <div className="max-w-3xl">
              <p className="text-sm uppercase tracking-[0.24em] text-primary-foreground/60">{copy.home.finalEyebrow}</p>
              <h2 className="mt-3 text-5xl font-semibold leading-tight text-primary-foreground">{copy.home.finalTitle}</h2>
              <p className="mt-4 text-lg leading-8 text-primary-foreground/80">{copy.home.finalDescription}</p>

              <div className="mt-8 flex flex-wrap gap-4">
                <Button size="lg" className="rounded-full bg-accent px-8 text-accent-foreground hover:bg-accent/90" asChild>
                  <TrackedCtaLink
                    href="/register"
                    eventName={SEO_EVENT.homepageCtaClick}
                    eventData={{ placement: "final_cta", cta: "primary", destination: "/register" }}
                  >
                    {copy.home.primaryCta}
                  </TrackedCtaLink>
                </Button>
                <Button size="lg" variant="outline" className="rounded-full border-2 border-primary-foreground/25 bg-transparent px-8 text-primary-foreground hover:bg-primary-foreground/10" asChild>
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
          </div>
        </section>

        <PublicSiteFooter />
      </main>
    </div>
  )
}
