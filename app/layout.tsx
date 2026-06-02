import type React from "react"
import type { Metadata } from "next"
import { Analytics } from "@vercel/analytics/react"
import { Barlow_Condensed, IBM_Plex_Sans } from "next/font/google"

import { AuthProvider } from "@/components/auth-provider"
import { AppToaster } from "@/components/app-toaster"
import { GoogleAnalytics } from "@/components/google-analytics"
import { LocaleProvider } from "@/components/locale-provider"
import { QueryProvider } from "@/components/query-provider"
import { getAppBaseUrl } from "@/lib/app-url"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import "./globals.css"

const displayFont = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
})

const bodyFont = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
})

export const metadata: Metadata = {
  metadataBase: new URL(getAppBaseUrl()),
  title: {
    default: "Multi-Model AI Workspace for Marketing Teams | AIMarketingSite",
    template: "%s | AIMarketingSite",
  },
  description:
    "Use multiple AI models in one workspace for marketing content, research, visuals, and workflows. Built for teams, creators, and indie operators.",
  openGraph: {
    title: "Multi-Model AI Workspace for Marketing Teams | AIMarketingSite",
    description:
      "Use multiple AI models in one workspace for marketing content, research, visuals, and workflows. Built for teams, creators, and indie operators.",
    siteName: "AIMarketingSite",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Multi-Model AI Workspace for Marketing Teams | AIMarketingSite",
    description:
      "Use multiple AI models in one workspace for marketing content, research, visuals, and workflows. Built for teams, creators, and indie operators.",
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
      className={`${displayFont.variable} ${bodyFont.variable} antialiased`}
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
