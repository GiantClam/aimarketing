import type React from "react"
import type { Metadata } from "next"
import { cookies, headers } from "next/headers"
import { Fira_Code, Fira_Sans, Manrope } from "next/font/google"

import { AuthProvider } from "@/components/auth-provider"
import { LocaleProvider } from "@/components/locale-provider"
import { QueryProvider } from "@/components/query-provider"
import { LOCALE_COOKIE_NAME, resolveRequestLocale } from "@/lib/i18n/config"
import "./globals.css"

const firaSans = Fira_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-fira-sans",
})

const firaCode = Fira_Code({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-fira-code",
})

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
})

export const metadata: Metadata = {
  title: {
    default: "AI Marketing | Enterprise AI Marketing Workspace",
    template: "%s | AI Marketing",
  },
  description:
    "Enterprise AI marketing workspace for expert advisors, writing, image design, website generation, and collaborative execution.",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const cookieStore = await cookies()
  const headerStore = await headers()
  const locale = resolveRequestLocale(
    cookieStore.get(LOCALE_COOKIE_NAME)?.value,
    headerStore.get("accept-language"),
  )

  return (
    <html lang={locale === "zh" ? "zh-CN" : "en"} className={`${firaSans.variable} ${firaCode.variable} ${manrope.variable} antialiased`}>
      <body suppressHydrationWarning>
        <LocaleProvider initialLocale={locale}>
          <QueryProvider>
            <AuthProvider>{children}</AuthProvider>
          </QueryProvider>
        </LocaleProvider>
      </body>
    </html>
  )
}
