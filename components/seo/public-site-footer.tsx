"use client"

import Link from "next/link"

import { useI18n } from "@/components/locale-provider"
import { getPublicCopy } from "@/lib/i18n/public-copy"

export function PublicSiteFooter() {
  const { locale } = useI18n()
  const copy = getPublicCopy(locale)

  return (
    <footer className="border-t border-border bg-card">
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-12 md:grid-cols-[1.2fr_0.8fr] md:items-end">
        <div>
          <div className="text-lg font-semibold text-foreground">AI Marketing</div>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">{copy.footer.description}</p>
          <div className="mt-4 text-sm text-muted-foreground">
            {copy.footer.contact}:{" "}
            <a className="text-foreground underline underline-offset-4" href="mailto:contact@aimarketingsite.com">
              contact@aimarketingsite.com
            </a>
          </div>
        </div>

        <div className="flex flex-col gap-3 md:items-end">
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground md:justify-end">
            {copy.header.navItems
              .filter((item) => item.key !== "compare")
              .map((item) => (
                <Link key={item.href} href={item.href} className="hover:text-foreground">
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
