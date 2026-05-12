import Link from "next/link"

import { LocaleSwitcher } from "@/components/locale-switcher"
import { TrackedCtaLink } from "@/components/seo/tracked-cta-link"
import { Button } from "@/components/ui/button"
import { SEO_EVENT } from "@/lib/seo/analytics"
import { cn } from "@/lib/utils"

type PublicNavKey = "alternatives" | "compare" | "solutions" | "calculator" | "pricing"

const navItems: Array<{ key: PublicNavKey; label: string; href: string }> = [
  { key: "alternatives", label: "Alternatives", href: "/alternatives/chatgpt-team-alternative" },
  { key: "compare", label: "Compare", href: "/compare/best-ai-workspace-for-small-teams" },
  { key: "solutions", label: "Solutions", href: "/solutions/ai-for-small-marketing-teams" },
  { key: "calculator", label: "Calculator", href: "/resources/ai-subscription-cost-calculator" },
  { key: "pricing", label: "Pricing", href: "/pricing" },
]

export function PublicSiteHeader({ activeKey }: { activeKey?: PublicNavKey }) {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-accent">
            <span className="text-lg font-bold lowercase text-primary">ai</span>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">AI Marketing</div>
            <div className="-mt-1 text-base font-semibold text-foreground">Small-team workspace</div>
          </div>
        </Link>

        <nav className="hidden items-center gap-5 text-sm lg:flex">
          {navItems.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                "transition hover:text-foreground",
                activeKey === item.key ? "font-medium text-foreground" : "text-muted-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <LocaleSwitcher className="hidden bg-background sm:inline-flex" />
          <Button variant="ghost" className="hidden rounded-full px-5 sm:inline-flex" asChild>
            <Link href="/login">Log in</Link>
          </Button>
          <Button className="rounded-full px-5" asChild>
            <TrackedCtaLink
              href="/register"
              eventName={SEO_EVENT.seoPageCtaClick}
              eventData={{
                group: activeKey || "homepage",
                slug: "header",
                placement: "header",
                cta: "primary",
                destination: "/register",
              }}
            >
              Start workspace
            </TrackedCtaLink>
          </Button>
        </div>
      </div>
    </header>
  )
}
