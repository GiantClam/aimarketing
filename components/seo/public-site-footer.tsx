"use client"

import Link from "next/link"

import { useI18n } from "@/components/locale-provider"
import { getPublicCopy } from "@/lib/i18n/public-copy"

export function PublicSiteFooter() {
  const { locale } = useI18n()
  const copy = getPublicCopy(locale)
  const resourceLinks = copy.home.resources.slice(0, 4)

  return (
    <footer className="border-t border-border/80 bg-card/90">
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-12 lg:grid-cols-[1.1fr_0.9fr_0.8fr] lg:items-start">
        <div>
          <div className="public-kicker text-muted-foreground">{copy.footer.systemFooterLabel}</div>
          <div className="mt-2 font-display text-2xl font-extrabold uppercase tracking-[0.04em] text-foreground">AI Marketing</div>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">{copy.footer.description}</p>
          <div className="mt-4 text-sm text-muted-foreground">
            {copy.footer.contact}:{" "}
            <a className="text-foreground underline underline-offset-4" href="mailto:contact@aimarketingsite.com">
              contact@aimarketingsite.com
            </a>
          </div>
        </div>

        <div>
          <div className="public-kicker text-muted-foreground">{locale === "zh" ? "资源入口" : "Resources"}</div>
          <div className="mt-3 grid gap-2">
            {resourceLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-[6px] px-2 py-1 text-sm text-muted-foreground transition hover:bg-background hover:text-foreground"
              >
                <span className="font-medium text-foreground">{item.title}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:items-end">
          <div className="flex flex-wrap gap-2 text-sm text-muted-foreground md:justify-end">
            {copy.header.navItems
              .filter((item) => item.key !== "compare")
              .map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="public-kicker rounded-[6px] px-2 py-1 text-muted-foreground hover:bg-background hover:text-foreground"
                >
                  {item.label}
                </Link>
              ))}
          </div>
          <div className="text-xs text-muted-foreground">{copy.footer.copyright(new Date().getFullYear())}</div>
        </div>
      </div>
    </footer>
  )
}
