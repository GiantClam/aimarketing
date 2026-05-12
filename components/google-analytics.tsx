"use client"

import { useEffect } from "react"
import Script from "next/script"
import { usePathname, useSearchParams } from "next/navigation"

import { trackGooglePageView } from "@/lib/seo/client-analytics"

const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim()

export function GoogleAnalytics() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!measurementId || !pathname) return

    const query = searchParams?.toString()
    const url = `${window.location.origin}${pathname}${query ? `?${query}` : ""}`
    trackGooglePageView(url, document.title)
  }, [pathname, searchParams])

  if (!measurementId) return null

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${measurementId}', { send_page_view: false });
        `}
      </Script>
    </>
  )
}
