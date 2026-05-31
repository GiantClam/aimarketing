import type React from "react"
import type { Metadata } from "next"
import { cookies } from "next/headers"
import { Analytics } from "@vercel/analytics/react"
import { Barlow_Condensed, IBM_Plex_Sans } from "next/font/google"

import { AuthProvider } from "@/components/auth-provider"
import { AppToaster } from "@/components/app-toaster"
import { GoogleAnalytics } from "@/components/google-analytics"
import { LocaleProvider } from "@/components/locale-provider"
import { QueryProvider } from "@/components/query-provider"
import { getAppBaseUrl } from "@/lib/app-url"
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, normalizeLocale } from "@/lib/i18n/config"
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
    default: "AI Marketing | AI Marketing Workspace for Small Teams",
    template: "%s | AI Marketing",
  },
  description:
    "Use multiple AI models, marketing agents, shared company context, and team permissions in one affordable AI marketing workspace for small teams.",
  openGraph: {
    title: "AI Marketing | AI Marketing Workspace for Small Teams",
    description:
      "Use multiple AI models, marketing agents, shared company context, and team permissions in one affordable AI marketing workspace for small teams.",
    siteName: "AI Marketing",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Marketing | AI Marketing Workspace for Small Teams",
    description:
      "Use multiple AI models, marketing agents, shared company context, and team permissions in one affordable AI marketing workspace for small teams.",
  },
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const cookieStore = await cookies()
  const locale = normalizeLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value) || DEFAULT_LOCALE

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
