import type { SeoFaq } from "@/lib/seo/pages"

export function SeoFaqList({ faqs }: { faqs: SeoFaq[] }) {
  if (faqs.length === 0) return null

  return (
    <section className="mx-auto max-w-7xl px-6 py-16">
      <div className="max-w-3xl">
        <p className="public-kicker text-muted-foreground">FAQ</p>
        <h2 className="mt-3 font-display text-4xl font-extrabold uppercase tracking-[-0.04em] text-foreground">
          Questions small teams ask before switching
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
