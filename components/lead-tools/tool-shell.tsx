import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import { PublicSiteFooter } from "@/components/seo/public-site-footer"
import { PublicSiteHeader } from "@/components/seo/public-site-header"

type ToolShellProps = {
  eyebrow: string
  title: string
  description: string
  proofPoints: string[]
  faqTitle?: string
  faqDescription?: string
  faq?: Array<{ question: string; answer: string }>
  aside?: ReactNode
  children: ReactNode
}

export function ToolShell({
  eyebrow,
  title,
  description,
  proofPoints,
  faqTitle = "常见问题",
  faqDescription = "这部分内容也会作为工具页的 SEO 长文结构的一部分。",
  faq = [],
  aside,
  children,
}: ToolShellProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicSiteHeader activeKey="tools" />
      <div className="public-grid-bg mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
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
              <h2 className="text-2xl font-semibold text-foreground">{faqTitle}</h2>
              <p className="text-sm leading-6 text-muted-foreground">{faqDescription}</p>
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
      <PublicSiteFooter />
    </div>
  )
}
