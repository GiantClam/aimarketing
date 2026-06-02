"use client"

import Link from "next/link"
import { ChevronDown } from "lucide-react"

import { useI18n } from "@/components/locale-provider"
import { LocaleSwitcher } from "@/components/locale-switcher"
import { TrackedCtaLink } from "@/components/seo/tracked-cta-link"
import { Button } from "@/components/ui/button"
import { getPublicCopy } from "@/lib/i18n/public-copy"
import { localizePublicPath } from "@/lib/i18n/routing"
import { leadToolsCatalog } from "@/lib/lead-tools/catalog"
import { SEO_EVENT } from "@/lib/seo/analytics"
import { cn } from "@/lib/utils"

type PublicNavKey = "alternatives" | "compare" | "solutions" | "calculator" | "pricing" | "tools"

export function PublicSiteHeader({ activeKey }: { activeKey?: PublicNavKey }) {
  const { locale } = useI18n()
  const copy = getPublicCopy(locale)
  const homeHref = localizePublicPath("/", locale)
  const liveTools = leadToolsCatalog.filter((tool) => tool.status === "live")

  return (
    <header className="relative z-50 border-b border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/88">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-4">
        <Link href={homeHref} className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-[6px] border border-primary/50 bg-primary shadow-[inset_0_0_0_1px_rgba(0,0,0,0.15)]">
            <span className="font-display text-lg font-extrabold uppercase tracking-[0.08em] text-primary-foreground">AI</span>
          </div>
          <div className="min-w-0">
            <div className="public-kicker text-muted-foreground/80">{copy.header.productName}</div>
            <div className="mt-1 font-display text-base font-bold uppercase tracking-[0.03em] text-foreground">
              {copy.header.tagline}
            </div>
          </div>
        </Link>

        <nav className="hidden flex-1 items-center justify-center gap-1 lg:flex">
          {copy.header.navItems.map((item) =>
            item.key === "tools" ? (
              <div key={item.key} className="group relative z-10 shrink-0">
                <Link
                  href={item.href}
                  className={cn(
                    "public-system-chip public-kicker inline-flex items-center gap-1.5 rounded-[4px] px-3 py-2 transition",
                    activeKey === item.key
                      ? "border border-primary/40 bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.label}
                  <ChevronDown className="h-3.5 w-3.5" />
                </Link>

                <div className="invisible absolute left-1/2 top-full z-[70] mt-2 min-w-[220px] -translate-x-1/2 translate-y-1 rounded-[8px] border border-border bg-card p-2 opacity-0 shadow-xl transition duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
                  {liveTools.map((tool) => (
                    <Link key={tool.slug} href={tool.href} className="block rounded-[6px] px-3 py-2.5 transition hover:bg-background">
                      <div className="font-display text-xs font-bold uppercase tracking-[0.08em] text-foreground">{tool.name}</div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">{tool.tagline}</div>
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              <Link
                key={item.key}
                href={item.href}
                className={cn(
                  "public-system-chip public-kicker rounded-[4px] px-3 py-2 transition",
                  activeKey === item.key
                    ? "border border-primary/40 bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            ),
          )}
        </nav>

        <div className="flex items-center gap-3">
          <LocaleSwitcher className="hidden rounded-[4px] border-border bg-card sm:inline-flex" />
          <Button variant="ghost" className="public-system-chip hidden rounded-[4px] px-4 font-display text-xs font-bold uppercase tracking-[0.08em] sm:inline-flex" asChild>
            <Link href="/login">{copy.header.login}</Link>
          </Button>
          <Button className="public-button-primary h-10 px-5" asChild>
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
              {copy.header.startWorkspace}
            </TrackedCtaLink>
          </Button>
        </div>
      </div>
    </header>
  )
}
