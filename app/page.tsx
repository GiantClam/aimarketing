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
import { useI18n } from "@/components/locale-provider"
import { Button } from "@/components/ui/button"

const capabilityIcons = [LineChart, PenTool, PanelsTopLeft]
const roleIcons = [Sparkles, Zap, ShieldCheck]

export default function HomePage() {
  const { anonymousLogin } = useAuth()
  const { messages } = useI18n()
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
              <div className="font-sans text-base font-semibold tracking-[0.16em] text-foreground/70 uppercase">{messages.shared.appName}</div>
              <div className="font-manrope text-sm text-muted-foreground">{messages.shared.appTagline}</div>
            </div>
          </div>

          <nav className="hidden items-center gap-6 text-sm text-muted-foreground lg:flex">
            <a href="#capabilities" className="transition hover:text-foreground">{messages.home.navCapabilities}</a>
            <a href="#workflow" className="transition hover:text-foreground">{messages.home.navWorkflow}</a>
            <a href="#roles" className="transition hover:text-foreground">{messages.home.navRoles}</a>
          </nav>

          <div className="flex items-center gap-3">
            {isDevelopment && (
              <Button
                variant="outline"
                className="hidden border-primary/25 bg-white/60 text-foreground shadow-sm hover:bg-primary/10 sm:inline-flex"
                onClick={handleDemoLogin}
              >
                {messages.shared.experienceEnvironment}
              </Button>
            )}
            <Button variant="ghost" className="hidden sm:inline-flex" asChild>
              <Link href="/login">{messages.shared.login}</Link>
            </Button>
            <Button className="rounded-full px-5" asChild>
              <Link href="/register">{messages.shared.register}</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="relative">
        <section className="mx-auto grid max-w-7xl gap-12 px-4 pb-18 pt-14 sm:px-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] lg:px-8 lg:pb-24 lg:pt-20">
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-white/75 px-4 py-2 text-sm font-medium text-foreground shadow-sm">
              <Bot className="h-4 w-4 text-primary" />
              {messages.home.heroBadge}
            </div>

            <h1 className="max-w-4xl font-sans text-5xl font-semibold leading-[1.04] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
              {messages.home.heroTitlePrefix}
              <span className="mx-2 rounded-2xl bg-primary px-3 py-1 text-primary-foreground shadow-[0_12px_30px_rgba(236,72,153,0.22)]">
                {messages.home.heroTitleHighlight}
              </span>
              {messages.home.heroTitleSuffix}
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl">
              {messages.home.heroDescription}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              {messages.home.trustPoints.map((point) => (
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
                  {messages.home.createEnterprise}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" className="rounded-full border-primary/20 bg-white/70 px-7 text-base" asChild>
                <Link href="/login">{messages.home.loginDirectly}</Link>
              </Button>
              {isDevelopment && (
                <Button
                  size="lg"
                  variant="ghost"
                  className="rounded-full border border-dashed border-accent/40 bg-accent/8 px-7 text-base hover:bg-accent/15"
                  onClick={handleDemoLogin}
                >
                  {messages.home.enterDemo}
                </Button>
              )}
            </div>

            <div className="mt-12 grid gap-4 border-t border-border/70 pt-8 sm:grid-cols-3">
              {messages.home.stats.map((stat) => (
                <div key={stat.label}>
                  <div className="text-3xl font-semibold text-foreground">{stat.value}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute -left-8 top-10 hidden h-24 w-24 rounded-full bg-accent/20 blur-3xl lg:block" />
            <div className="absolute bottom-10 right-0 hidden h-32 w-32 rounded-full bg-primary/20 blur-3xl lg:block" />

            <div className="relative overflow-hidden rounded-[2rem] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,255,255,0.78))] p-5 shadow-[0_24px_80px_rgba(131,24,67,0.16)] backdrop-blur">
              <div className="mb-4 flex items-center justify-between rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Marketing Workspace</div>
                  <div className="mt-1 font-sans text-lg font-semibold">{messages.home.workspaceTitle}</div>
                </div>
                <div className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">{messages.home.workspaceBadge}</div>
              </div>

              <div className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-[1.05fr_0.95fr]">
                  <div className="rounded-[1.6rem] bg-foreground px-5 py-5 text-background">
                    <div className="flex items-center gap-2 text-sm text-background/70">
                      <MessageSquareText className="h-4 w-4" />
                      {messages.home.workspacePanelLabel}
                    </div>
                    <div className="mt-4 text-2xl font-semibold leading-tight">{messages.home.workspaceHeadline}</div>
                    <div className="mt-4 grid gap-3">
                      {messages.home.workspaceHighlights.map((highlight) => (
                        <div key={highlight} className="rounded-2xl bg-white/10 p-3 text-sm text-background/85">{highlight}</div>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-4">
                    <div className="rounded-[1.5rem] border border-border/70 bg-card p-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <PanelsTopLeft className="h-4 w-4 text-primary" />
                        {messages.home.siteGenerationTitle}
                      </div>
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">{messages.home.siteGenerationDescription}</p>
                    </div>
                    <div className="rounded-[1.5rem] border border-border/70 bg-card p-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <PlayCircle className="h-4 w-4 text-accent" />
                        {messages.home.videoGenerationTitle}
                      </div>
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">{messages.home.videoGenerationDescription}</p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-[1.5rem] border border-border/70 bg-card p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Building2 className="h-4 w-4 text-primary" />
                      {messages.home.enterpriseOwnershipTitle}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{messages.home.enterpriseOwnershipDescription}</p>
                  </div>
                  <div className="rounded-[1.5rem] border border-border/70 bg-card p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Users2 className="h-4 w-4 text-primary" />
                      {messages.home.permissionsTitle}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{messages.home.permissionsDescription}</p>
                  </div>
                  <div className="rounded-[1.5rem] border border-border/70 bg-card p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Workflow className="h-4 w-4 text-primary" />
                      {messages.home.historyTitle}
                    </div>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{messages.home.historyDescription}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="capabilities" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <div className="text-sm font-semibold uppercase tracking-[0.28em] text-primary/80">{messages.home.capabilitiesEyebrow}</div>
            <h2 className="mt-3 font-sans text-3xl font-semibold sm:text-4xl">{messages.home.capabilitiesTitle}</h2>
            <p className="mt-4 text-lg leading-8 text-muted-foreground">{messages.home.capabilitiesDescription}</p>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {messages.home.capabilityCards.map(({ title, description }, index) => {
              const Icon = capabilityIcons[index] || LineChart
              return (
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
              )
            })}
          </div>
        </section>

        <section id="workflow" className="border-y border-border/70 bg-card/60">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.28em] text-accent">{messages.home.workflowEyebrow}</div>
                <h2 className="mt-3 font-sans text-3xl font-semibold sm:text-4xl">{messages.home.workflowTitle}</h2>
                <p className="mt-4 text-lg leading-8 text-muted-foreground">{messages.home.workflowDescription}</p>
              </div>

              <div className="grid gap-4">
                {messages.home.workflowSteps.map((step, index) => (
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
              <div className="text-sm font-semibold uppercase tracking-[0.28em] text-primary/80">{messages.home.rolesEyebrow}</div>
              <h2 className="mt-3 font-sans text-3xl font-semibold sm:text-4xl">{messages.home.rolesTitle}</h2>
              <p className="mt-4 text-lg leading-8 text-muted-foreground">{messages.home.rolesDescription}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {messages.home.roleHighlights.map(({ title, description }, index) => {
                const Icon = roleIcons[index] || Sparkles
                return (
                  <div key={title} className="rounded-[1.6rem] border border-border/70 bg-card p-5 shadow-sm">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/12 text-accent">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-5 font-sans text-xl font-semibold">{title}</h3>
                    <p className="mt-3 text-sm leading-7 text-muted-foreground">{description}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <section className="px-4 pb-18 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl overflow-hidden rounded-[2rem] border border-primary/20 bg-[linear-gradient(135deg,rgba(131,24,67,0.96),rgba(236,72,153,0.92)_52%,rgba(6,182,212,0.78))] px-6 py-10 text-white shadow-[0_30px_90px_rgba(131,24,67,0.24)] sm:px-10 lg:flex lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <div className="text-sm font-semibold uppercase tracking-[0.28em] text-white/75">{messages.home.ctaEyebrow}</div>
              <h2 className="mt-3 font-sans text-3xl font-semibold sm:text-4xl">{messages.home.ctaTitle}</h2>
              <p className="mt-4 text-base leading-8 text-white/82 sm:text-lg">{messages.home.ctaDescription}</p>
            </div>

            <div className="mt-8 flex flex-wrap gap-4 lg:mt-0 lg:justify-end">
              <Button size="lg" variant="secondary" className="rounded-full border border-white/15 bg-white text-foreground hover:bg-white/90" asChild>
                <Link href="/register">{messages.home.ctaPrimary}</Link>
              </Button>
              <Button size="lg" variant="outline" className="rounded-full border-white/30 bg-white/8 text-white hover:bg-white/14" asChild>
                <Link href="/login">{messages.home.ctaSecondary}</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
