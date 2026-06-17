import type { SeoFaq } from "@/lib/seo/pages"
import type { AppLocale } from "@/lib/i18n/config"
import { getSeoUiCopy } from "@/lib/seo/i18n"

export function SeoFaqList({
  faqs,
  locale,
}: {
  faqs: SeoFaq[]
  locale: AppLocale
}) {
  if (faqs.length === 0) return null
  const ui = getSeoUiCopy(locale)

  return (
    <section className="public-page-hero-shell mx-auto max-w-7xl">
      <div className="max-w-3xl">
        <p className="public-kicker text-muted-foreground">{ui.faqEyebrow}</p>
        <h2 className="mt-3 font-display text-4xl font-extrabold uppercase tracking-[-0.04em] text-foreground">
          {ui.faqTitle}
        </h2>
      </div>
      <div className="mt-8 grid gap-px overflow-hidden rounded-[12px] border border-border bg-border lg:grid-cols-3">
        {faqs.map((faq, index) => (
          <article key={faq.question} className="bg-card p-5">
            <div className="font-display text-sm font-bold uppercase tracking-[0.08em] text-foreground/48">
              {String(index + 1).padStart(2, "0")}
            </div>
            <h3 className="mt-3 text-lg font-semibold text-foreground">{faq.question}</h3>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">{faq.answer}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
