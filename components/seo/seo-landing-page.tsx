import Link from "next/link"
import { CheckCircle2 } from "lucide-react"

import type { SeoPage } from "@/lib/seo/pages"
import { SeoComparisonTable } from "@/components/seo/seo-comparison-table"
import { SeoFaqList } from "@/components/seo/seo-faq"
import { PublicSiteFooter } from "@/components/seo/public-site-footer"
import { PublicSiteHeader } from "@/components/seo/public-site-header"
import { SeoPageHeroCta } from "@/components/seo/seo-page-hero-cta"
import { TrackedSeoCtaBlock } from "@/components/seo/tracked-seo-cta-block"

function faqJsonLd(page: SeoPage) {
  if (page.faqs.length === 0) return null

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: page.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  }
}

export function SeoLandingPage({ page }: { page: SeoPage }) {
  const jsonLd = faqJsonLd(page)
  const activeKey =
    page.group === "alternatives"
      ? "alternatives"
      : page.group === "compare"
        ? "compare"
        : page.group === "solutions" || page.group === "use-cases"
          ? "solutions"
          : undefined

  return (
    <main className="min-h-screen bg-background text-foreground">
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      ) : null}

      <PublicSiteHeader activeKey={activeKey} />

      <section className="public-grid-bg mx-auto max-w-7xl px-6 py-16 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="public-kicker text-muted-foreground">{page.primaryKeyword}</p>
              <span className="public-system-chip public-kicker rounded-[4px] px-3 py-1 text-muted-foreground">
                SEO Landing
              </span>
              <span className="inline-flex items-center gap-2 rounded-[4px] border border-border px-3 py-1">
                <span className="public-signal" aria-hidden="true" />
                <span className="public-kicker text-muted-foreground">Brand Demand</span>
              </span>
            </div>
            <h1 className="public-display mt-4 max-w-4xl text-5xl text-foreground lg:text-6xl">
              {page.h1}
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-muted-foreground">{page.intro}</p>
            <SeoPageHeroCta page={page} />
          </div>

          <aside className="public-panel rounded-[12px] p-6">
            <p className="public-kicker text-muted-foreground">Best fit</p>
            <p className="mt-3 text-base leading-7 text-foreground">{page.audience}</p>
            <div className="mt-6 space-y-3">
              {page.secondaryKeywords.slice(0, 4).map((keyword) => (
                <div key={keyword} className="flex gap-2 text-sm leading-6 text-muted-foreground">
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-secondary" />
                  <span>{keyword}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section className="border-y border-border bg-card/85">
        <div className="mx-auto max-w-7xl px-6 py-14">
          <div className="grid gap-px overflow-hidden rounded-[12px] border border-border bg-border md:grid-cols-3">
            {page.highlights.map((item, index) => (
              <div key={item} className="bg-background px-5 py-5 text-sm font-medium leading-6">
                <div className="font-display text-sm font-bold uppercase tracking-[0.08em] text-foreground/48">
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div className="mt-3">{item}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid gap-6">
          {page.sections.map((section) => (
            <article key={section.heading} className="public-panel rounded-[12px] p-6 sm:p-8">
              <h2 className="font-display text-3xl font-extrabold uppercase tracking-[0.02em] text-foreground">{section.heading}</h2>
              <div className="mt-4 space-y-4">
                {section.body.map((paragraph) => (
                  <p key={paragraph} className="max-w-4xl text-base leading-8 text-muted-foreground">
                    {paragraph}
                  </p>
                ))}
              </div>
              {section.bullets ? (
                <ul className="mt-5 grid gap-3 md:grid-cols-2">
                  {section.bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-3 rounded-[8px] border border-border bg-background p-4 text-sm leading-6 text-muted-foreground">
                      <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-secondary" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>

        {page.comparison ? (
          <div className="mt-8">
            <SeoComparisonTable
              firstLabel={page.comparison.firstLabel}
              secondLabel={page.comparison.secondLabel}
              rows={page.comparison.rows}
            />
          </div>
        ) : null}
      </section>

      {page.relatedLinks.length > 0 ? (
        <section className="mx-auto max-w-7xl px-6 pb-4">
          <div className="public-panel rounded-[12px] p-6 sm:p-8">
            <p className="public-kicker text-muted-foreground">Related pages</p>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {page.relatedLinks.map((link, index) => (
                <Link
                  key={`${page.slug}-${link.href}`}
                  href={link.href}
                  className="rounded-[8px] border border-border bg-background p-5 transition hover:border-foreground/20 hover:bg-muted/40"
                >
                  <div className="font-display text-sm font-bold uppercase tracking-[0.08em] text-foreground/48">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div className="mt-3 text-base font-semibold text-foreground">{link.label}</div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{link.description}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <SeoFaqList faqs={page.faqs} />

      <section className="mx-auto max-w-7xl px-6 pb-18">
        <TrackedSeoCtaBlock cta={page.cta} group={page.group} slug={page.slug} />
      </section>

      <PublicSiteFooter />
    </main>
  )
}
