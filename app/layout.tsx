import type React from "react"
import type { Metadata } from "next"
import { cookies } from "next/headers"
import { Analytics } from "@vercel/analytics/react"

import { AuthProvider } from "@/components/auth-provider"
import { AppToaster } from "@/components/app-toaster"
import { GoogleAnalytics } from "@/components/google-analytics"
import { LocaleProvider } from "@/components/locale-provider"
import { QueryProvider } from "@/components/query-provider"
import { getAppBaseUrl } from "@/lib/app-url"
import { LOCALE_COOKIE_NAME, normalizeLocale } from "@/lib/i18n/config"
import "./globals.css"

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
  const locale = normalizeLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value) || "en"

  return (
    <html lang={locale === "zh" ? "zh-CN" : "en"} className="antialiased">
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
