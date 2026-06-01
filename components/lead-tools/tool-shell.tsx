import type { ReactNode } from "react"
import Link from "next/link"
import { Sparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

type ToolShellProps = {
  eyebrow: string
  title: string
  description: string
  proofPoints: string[]
  faq?: Array<{ question: string; answer: string }>
  aside?: ReactNode
  children: ReactNode
}

export function ToolShell({ eyebrow, title, description, proofPoints, faq = [], aside, children }: ToolShellProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(188,35,35,0.14),transparent_32%),linear-gradient(180deg,var(--background)_0%,color-mix(in_oklch,var(--background),black_8%)_100%)] text-foreground">
      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="text-lg font-semibold text-foreground">AI Marketing</div>
              <div className="text-xs text-muted-foreground">Content platform + SEO lead gen tools</div>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild>
              <Link href="/tools">工具目录</Link>
            </Button>
            <Button variant="outline" className="border-primary/30 bg-primary/5 hover:bg-primary/10" asChild>
              <Link href="/login">登录</Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <section className="grid gap-8 rounded-[2rem] border border-border/70 bg-card/90 p-6 shadow-[0_28px_90px_-46px_rgba(0,0,0,0.65)] backdrop-blur md:grid-cols-[minmax(0,1fr)_300px] md:p-10">
          <div className="space-y-6">
            <Badge variant="outline" className="border-primary/40 bg-primary/10 px-3 py-1 text-primary">
              {eyebrow}
            </Badge>
            <div className="space-y-4">
              <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">{title}</h1>
              <p className="max-w-3xl text-lg leading-8 text-muted-foreground">{description}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              {proofPoints.map((point) => (
                <div
                  key={point}
                  className="rounded-full border border-border/70 bg-background/75 px-4 py-2 text-sm text-muted-foreground"
                >
                  {point}
                </div>
              ))}
            </div>
          </div>

          {aside ? (
            <aside className="rounded-[1.5rem] border border-primary/20 bg-background/80 p-5">{aside}</aside>
          ) : null}
        </section>

        <section className="mt-8">{children}</section>

        {faq.length > 0 ? (
          <section className="mt-10 space-y-5 rounded-[2rem] border border-border/70 bg-card/85 p-6 md:p-8">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-foreground">常见问题</h2>
              <p className="text-sm leading-6 text-muted-foreground">这部分内容也会作为工具页的 SEO 长文结构的一部分。</p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {faq.map((item) => (
                <div key={item.question} className="rounded-2xl border border-border/70 bg-background/75 p-5">
                  <h3 className="text-base font-medium text-foreground">{item.question}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.answer}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}
