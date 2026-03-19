"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  Bot,
  Building2,
  CheckCircle2,
  LineChart,
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
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-[20px] bg-accent">
              <span className="text-xl font-bold lowercase text-primary">ai</span>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">stb.</div>
              <div className="-mt-1 text-base font-semibold text-foreground">{messages.shared.appName}</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="ghost" className="rounded-full px-5" asChild>
              <Link href="/login">{messages.shared.login}</Link>
            </Button>
            <Button className="rounded-full px-6" asChild>
              <Link href="/register">{messages.shared.register}</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-7xl px-6 py-18 lg:py-24">
          <div className="grid gap-16 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-center">
            <div>
              <div className="mb-6 text-sm uppercase tracking-[0.28em] text-muted-foreground">
                {messages.home.heroBadge}
              </div>
              <h1 className="max-w-4xl text-6xl font-semibold leading-[1.02] tracking-tight lg:text-7xl">
                <span className="text-muted-foreground">{messages.home.heroTitlePrefix}</span>
                <br />
                <span className="text-foreground">{messages.home.heroTitleHighlight}</span>
                <br />
                <span className="text-foreground">{messages.home.heroTitleSuffix}</span>
              </h1>
              <p className="mt-8 max-w-2xl text-lg leading-8 text-muted-foreground">
                {messages.home.heroDescription}
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Button size="lg" className="rounded-full px-8" asChild>
                  <Link href="/register">
                    {messages.home.createEnterprise}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" className="rounded-full border-2 border-border bg-card px-8" asChild>
                  <Link href="/login">{messages.home.loginDirectly}</Link>
                </Button>
                {isDevelopment ? (
                  <Button
                    size="lg"
                    variant="ghost"
                    className="rounded-full border-2 border-dashed border-border bg-card px-8 hover:bg-primary hover:text-primary-foreground"
                    onClick={handleDemoLogin}
                  >
                    {messages.home.enterDemo}
                  </Button>
                ) : null}
              </div>

              <div className="mt-10 flex flex-wrap gap-3">
                {messages.home.trustPoints.map((point) => (
                  <div key={point} className="inline-flex items-center gap-2 rounded-full border-2 border-border bg-card px-4 py-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-secondary" />
                    {point}
                  </div>
                ))}
              </div>

              <div className="mt-12 grid gap-4 sm:grid-cols-3">
                {messages.home.stats.map((stat) => (
                  <div key={stat.label} className="rounded-[24px] border-2 border-border bg-card px-5 py-5">
                    <div className="text-3xl font-semibold text-foreground">{stat.value}</div>
                    <div className="mt-2 text-sm text-muted-foreground">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[32px] border-2 border-border bg-card p-6">
              <div className="rounded-[24px] border-2 border-border bg-background p-5">
                <div className="text-sm uppercase tracking-[0.24em] text-muted-foreground">workspace</div>
                <div className="mt-2 text-3xl font-semibold text-foreground">{messages.home.workspaceTitle}</div>
                <div className="mt-4 inline-flex rounded-full bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary-foreground">
                  {messages.home.workspaceBadge}
                </div>
              </div>

              <div className="mt-4 grid gap-4">
                <div className="rounded-[24px] bg-accent px-5 py-5 text-accent-foreground">
                  <div className="flex items-center gap-2 text-sm text-accent-foreground/70">
                    <Bot className="h-4 w-4" />
                    {messages.home.workspacePanelLabel}
                  </div>
                  <div className="mt-4 text-2xl font-semibold leading-tight text-primary">
                    {messages.home.workspaceHeadline}
                  </div>
                  <div className="mt-4 space-y-3">
                    {messages.home.workspaceHighlights.map((highlight) => (
                      <div key={highlight} className="rounded-[20px] bg-white/10 p-3 text-sm leading-6 text-accent-foreground/88">
                        {highlight}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-[22px] border-2 border-border bg-background p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <PanelsTopLeft className="h-4 w-4 text-primary" />
                      {messages.home.siteGenerationTitle}
                    </div>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      {messages.home.siteGenerationDescription}
                    </p>
                  </div>
                  <div className="rounded-[22px] border-2 border-border bg-background p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <PlayCircle className="h-4 w-4 text-secondary" />
                      {messages.home.videoGenerationTitle}
                    </div>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      {messages.home.videoGenerationDescription}
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-[22px] border-2 border-border bg-background p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Building2 className="h-4 w-4 text-primary" />
                      {messages.home.enterpriseOwnershipTitle}
                    </div>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      {messages.home.enterpriseOwnershipDescription}
                    </p>
                  </div>
                  <div className="rounded-[22px] border-2 border-border bg-background p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Users2 className="h-4 w-4 text-primary" />
                      {messages.home.permissionsTitle}
                    </div>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      {messages.home.permissionsDescription}
                    </p>
                  </div>
                  <div className="rounded-[22px] border-2 border-border bg-background p-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                      <Workflow className="h-4 w-4 text-primary" />
                      {messages.home.historyTitle}
                    </div>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      {messages.home.historyDescription}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="capabilities" className="border-y border-border bg-card">
          <div className="mx-auto max-w-7xl px-6 py-18">
            <div className="max-w-2xl">
              <div className="text-sm uppercase tracking-[0.28em] text-muted-foreground">
                {messages.home.capabilitiesEyebrow}
              </div>
              <h2 className="mt-3 text-4xl font-semibold text-foreground">
                {messages.home.capabilitiesTitle}
              </h2>
              <p className="mt-4 text-lg leading-8 text-muted-foreground">
                {messages.home.capabilitiesDescription}
              </p>
            </div>

            <div className="mt-10 grid gap-5 lg:grid-cols-3">
              {messages.home.capabilityCards.map(({ title, description }, index) => {
                const Icon = capabilityIcons[index] || LineChart
                return (
                  <div key={title} className="rounded-[28px] border-2 border-border bg-background p-6">
                    <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-primary">
                      <Icon className="h-6 w-6 text-primary-foreground" />
                    </div>
                    <h3 className="mt-6 text-2xl font-semibold text-foreground">{title}</h3>
                    <p className="mt-3 text-base leading-7 text-muted-foreground">{description}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <section id="workflow" className="mx-auto max-w-7xl px-6 py-18">
          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <div className="text-sm uppercase tracking-[0.28em] text-muted-foreground">
                {messages.home.workflowEyebrow}
              </div>
              <h2 className="mt-3 text-4xl font-semibold text-foreground">{messages.home.workflowTitle}</h2>
              <p className="mt-4 text-lg leading-8 text-muted-foreground">{messages.home.workflowDescription}</p>
            </div>

            <div className="grid gap-4">
              {messages.home.workflowSteps.map((step, index) => (
                <div key={step.title} className="flex gap-4 rounded-[26px] border-2 border-border bg-card p-5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                    {index + 1}
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-foreground">{step.title}</h3>
                    <p className="mt-2 text-base leading-7 text-muted-foreground">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="roles" className="mx-auto max-w-7xl px-6 py-18">
          <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
            <div>
              <div className="text-sm uppercase tracking-[0.28em] text-muted-foreground">
                {messages.home.rolesEyebrow}
              </div>
              <h2 className="mt-3 text-4xl font-semibold text-foreground">{messages.home.rolesTitle}</h2>
              <p className="mt-4 text-lg leading-8 text-muted-foreground">{messages.home.rolesDescription}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {messages.home.roleHighlights.map(({ title, description }, index) => {
                const Icon = roleIcons[index] || Sparkles
                return (
                  <div key={title} className="rounded-[26px] border-2 border-border bg-card p-5">
                    <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-accent">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="mt-5 text-xl font-semibold text-foreground">{title}</h3>
                    <p className="mt-3 text-sm leading-7 text-muted-foreground">{description}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <section className="bg-primary">
          <div className="mx-auto max-w-7xl px-6 py-18">
            <div className="max-w-3xl">
              <div className="text-sm uppercase tracking-[0.28em] text-primary-foreground/60">
                {messages.home.ctaEyebrow}
              </div>
              <h2 className="mt-3 text-5xl font-semibold text-primary-foreground">
                {messages.home.ctaTitle}
              </h2>
              <p className="mt-4 text-lg leading-8 text-primary-foreground/80">
                {messages.home.ctaDescription}
              </p>

              <div className="mt-8 flex flex-wrap gap-4">
                <Button size="lg" className="rounded-full bg-accent px-8 text-accent-foreground hover:bg-accent/90" asChild>
                  <Link href="/register">{messages.home.ctaPrimary}</Link>
                </Button>
                <Button size="lg" variant="outline" className="rounded-full border-2 border-primary-foreground/25 bg-transparent px-8 text-primary-foreground hover:bg-primary-foreground/10" asChild>
                  <Link href="/login">{messages.home.ctaSecondary}</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
