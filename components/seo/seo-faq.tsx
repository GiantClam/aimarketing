import type { SeoFaq } from "@/lib/seo/pages"

export function SeoFaqList({ faqs }: { faqs: SeoFaq[] }) {
  if (faqs.length === 0) return null

  return (
    <section className="mx-auto max-w-7xl px-6 py-16">
      <div className="max-w-3xl">
        <p className="text-sm uppercase tracking-[0.24em] text-muted-foreground">FAQ</p>
        <h2 className="mt-3 text-4xl font-semibold text-foreground">Questions small teams ask before switching</h2>
      </div>
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        {faqs.map((faq) => (
          <article key={faq.question} className="rounded-[24px] border-2 border-border bg-card p-5">
            <h3 className="text-lg font-semibold text-foreground">{faq.question}</h3>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">{faq.answer}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
