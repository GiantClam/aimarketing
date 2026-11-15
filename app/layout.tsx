import type React from "react"
import type { Metadata } from "next"
import { Analytics } from "@vercel/analytics/react"

import { AuthProvider } from "@/components/auth-provider"
import { AppToaster } from "@/components/app-toaster"
import { GoogleAnalytics } from "@/components/google-analytics"
import { LocaleProvider } from "@/components/locale-provider"
import { QueryProvider } from "@/components/query-provider"
import { getAppBaseUrl } from "@/lib/app-url"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import "./globals.css"

export const metadata: Metadata = {
  metadataBase: new URL(getAppBaseUrl()),
  title: {
    default: "AI Workspace for Marketing Teams | AIMarketingSite",
    template: "%s | AIMarketingSite",
  },
  description:
    "Start from one marketing brief and move through research, copy, visuals, and review in one AI workspace for marketing teams.",
  openGraph: {
    title: "AI Workspace for Marketing Teams | AIMarketingSite",
    description: "Start from one marketing brief and move through research, copy, visuals, and review in one AI workspace for marketing teams.",
    siteName: "AIMarketingSite",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Workspace for Marketing Teams | AIMarketingSite",
    description: "Start from one marketing brief and move through research, copy, visuals, and review in one AI workspace for marketing teams.",
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getRequestLocale()

  return (
    <html
      lang={locale === "zh" ? "zh-CN" : "en"}
      className="antialiased"
    >
      <body suppressHydrationWarning>
        <LocaleProvider initialLocale={locale}>
          <QueryProvider>
            <AuthProvider>
              {children}
              <AppToaster />
              <Analytics />
              <GoogleAnalytics />
            </AuthProvider>
          </QueryProvider>
        </LocaleProvider>
      </body>
    </html>
  )
}
