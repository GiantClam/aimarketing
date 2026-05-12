import Link from "next/link"

const footerNav = [
  { label: "Alternatives", href: "/alternatives/chatgpt-team-alternative" },
  { label: "Solutions", href: "/solutions/ai-for-small-marketing-teams" },
  { label: "Calculator", href: "/resources/ai-subscription-cost-calculator" },
  { label: "Pricing", href: "/pricing" },
]

export function PublicSiteFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-12 md:grid-cols-[1.2fr_0.8fr] md:items-end">
        <div>
          <div className="text-lg font-semibold text-foreground">AI Marketing</div>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
            A shared AI marketing workspace for small teams that want multiple models, specialist agents, company
            context, and lower subscription sprawl.
          </p>
          <div className="mt-4 text-sm text-muted-foreground">
            Contact:{" "}
            <a className="text-foreground underline underline-offset-4" href="mailto:contact@aimarketingsite.com">
              contact@aimarketingsite.com
            </a>
          </div>
        </div>

        <div className="flex flex-col gap-3 md:items-end">
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground md:justify-end">
            {footerNav.map((item) => (
              <Link key={item.href} href={item.href} className="hover:text-foreground">
                {item.label}
              </Link>
            ))}
          </div>
          <div className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} AI Marketing. Built for small-team marketing execution.
          </div>
        </div>
      </div>
    </footer>
  )
}
