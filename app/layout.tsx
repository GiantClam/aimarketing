import type React from "react"
import type { Metadata } from "next"
import { Fira_Sans, Fira_Code, Manrope } from "next/font/google"
import { AuthProvider } from "@/components/auth-provider"
import "./globals.css"

const firaSans = Fira_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-fira-sans"
})
const firaCode = Fira_Code({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-fira-code"
})
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" })

export const metadata: Metadata = {
  title: {
    default: "AI Marketing | 企业级 AI 营销作战平台",
    template: "%s | AI Marketing",
  },
  description:
    "面向企业品牌与增长团队的 AI 营销作战平台，提供战略顾问、增长顾问、文案专家、网站生成和视频生成等专家 Agent，并支持企业权限与多会话协作。",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" className={`${firaSans.variable} ${firaCode.variable} ${manrope.variable} antialiased dark`}>
      <body suppressHydrationWarning>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
