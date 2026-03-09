"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { MessageSquare, Sparkles, Zap } from "lucide-react"

import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"

export default function HomePage() {
  const { anonymousLogin } = useAuth()
  const router = useRouter()

  const isDevelopment =
    process.env.NODE_ENV === "development" ||
    process.env.VERCEL_ENV === "preview" ||
    (typeof window !== "undefined" && window.location.hostname.includes("vercel.app"))

  const handleDemoLogin = async () => {
    try {
      await anonymousLogin()
      router.push("/dashboard")
    } catch (error) {
      console.error("Demo login failed:", error)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <Sparkles className="h-5 w-5 text-primary-foreground" />
              </div>
              <h1 className="text-xl font-bold text-foreground font-sans">AI Marketing</h1>
            </div>
            <div className="flex items-center gap-4">
              {isDevelopment && (
                <Button
                  variant="outline"
                  className="border-primary/50 bg-gradient-to-r from-primary/20 to-destructive/20 font-manrope hover:bg-primary/10"
                  onClick={handleDemoLogin}
                >
                  免费体验
                </Button>
              )}
              <Button variant="ghost" className="font-manrope" asChild>
                <Link href="/login">登录</Link>
              </Button>
              <Button className="font-manrope" asChild>
                <Link href="/register">开始使用</Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <section className="px-4 py-20">
        <div className="container mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-accent/10 px-4 py-2 text-sm font-medium text-accent">
            <Zap className="h-4 w-4" />
            企业级 AI 营销专家平台
          </div>
          <h1 className="mb-6 font-sans text-5xl font-bold leading-tight text-foreground">
            用 AI 专家 Agent 提升
            <span className="text-primary"> 品牌增长效率</span>
          </h1>
          <p className="mb-8 text-xl leading-relaxed text-muted-foreground font-manrope">
            支持企业组织、成员权限与多会话协作，覆盖品牌战略、增长、文案、网站与视频生成。
          </p>
          <div className="flex items-center justify-center gap-4">
            {isDevelopment && (
              <Button
                size="lg"
                variant="outline"
                className="border-primary/30 bg-gradient-to-r from-primary/10 to-destructive/10 font-manrope hover:bg-primary/20"
                onClick={handleDemoLogin}
              >
                立即体验
              </Button>
            )}
            <Button size="lg" className="font-manrope" asChild>
              <Link href="/register">
                <MessageSquare className="mr-2 h-5 w-5" />
                创建企业账号
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
