"use client"

import Link from "next/link"

import { useI18n } from "@/components/locale-provider"
import { LocaleSwitcher } from "@/components/locale-switcher"
import { TrackedCtaLink } from "@/components/seo/tracked-cta-link"
import { Button } from "@/components/ui/button"
import { getPublicCopy } from "@/lib/i18n/public-copy"
import { SEO_EVENT } from "@/lib/seo/analytics"
import { cn } from "@/lib/utils"

type PublicNavKey = "alternatives" | "compare" | "solutions" | "calculator" | "pricing"

export function PublicSiteHeader({ activeKey }: { activeKey?: PublicNavKey }) {
  const { locale } = useI18n()
  const copy = getPublicCopy(locale)

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-accent">
            <span className="text-lg font-bold lowercase text-primary">ai</span>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">{copy.header.productName}</div>
            <div className="-mt-1 text-base font-semibold text-foreground">{copy.header.tagline}</div>
          </div>
        </Link>

        <nav className="hidden items-center gap-5 text-sm lg:flex">
          {copy.header.navItems.map((item) => (
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
            <Link href="/login">{copy.header.login}</Link>
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
              {copy.header.startWorkspace}
            </TrackedCtaLink>
          </Button>
        </div>
      </div>
    </header>
  )
}
