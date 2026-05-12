"use client"

import { track as trackVercelEvent } from "@vercel/analytics"

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

type AnalyticsPayload = Record<string, string | number | boolean | null | undefined>

function hasGoogleAnalytics() {
  return typeof window !== "undefined" && typeof window.gtag === "function"
}

export function trackAnalyticsEvent(eventName: string, eventData?: AnalyticsPayload) {
  trackVercelEvent(eventName, eventData)

  if (!hasGoogleAnalytics()) return

  window.gtag!("event", eventName, eventData || {})
}

export function trackGooglePageView(url: string, title?: string) {
  if (!hasGoogleAnalytics()) return

  window.gtag!("event", "page_view", {
    page_title: title || (typeof document !== "undefined" ? document.title : undefined),
    page_location: url,
    page_path: (() => {
      try {
        return new URL(url).pathname + new URL(url).search
      } catch {
        return url
      }
    })(),
  })
}
