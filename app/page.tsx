"use client"

import { Button } from "@/components/ui/button"
import { MessageSquare, Sparkles, Zap } from "lucide-react"
import Link from "next/link"
import { useAuth } from "@/components/auth-provider"
import { useRouter } from "next/navigation"

export default function HomePage() {
  const { anonymousLogin } = useAuth()
  const router = useRouter()

  const isDemoEnabled = true

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
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-primary-foreground" />
              </div>
              <h1 className="text-xl font-bold text-foreground font-sans">AI Marketing</h1>
            </div>
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                className="font-manrope bg-gradient-to-r from-primary/20 to-destructive/20 border-primary/50 hover:bg-primary/10"
                onClick={handleDemoLogin}
              >
                🚀 免费体验
              </Button>
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

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center max-w-4xl">
          <div className="inline-flex items-center gap-2 bg-accent/10 text-accent px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Zap className="w-4 h-4" />
            AI 驱动的营销内容生成平台
          </div>
          <h1 className="text-5xl font-bold text-foreground mb-6 font-sans leading-tight">
            让 AI 帮你创造
            <span className="text-primary"> 优质营销内容</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-8 font-manrope leading-relaxed">
            结合行业知识库和个人资料，生成精准的营销文案、社交媒体内容和创意图片。 提升营销效率，释放创意潜能。
          </p>
          <div className="flex items-center justify-center gap-4">
            <Button
              size="lg"
              variant="outline"
              className="font-manrope bg-gradient-to-r from-primary/10 to-destructive/10 border-primary/30 hover:bg-primary/20"
              onClick={handleDemoLogin}
            >
              🚀 立即免费体验
            </Button>
            <Button size="lg" className="font-manrope" asChild>
              <Link href="/register">
                <MessageSquare className="w-5 h-5 mr-2" />
                开始对话
              </Link>
            </Button>
            <Button variant="outline" size="lg" className="font-manrope bg-transparent">
              了解更多
            </Button>
          </div>
        </div>
      </section>

      <section className="py-12 px-4 bg-gradient-to-r from-primary/5 to-destructive/5 border-y border-primary/20">
        <div className="container mx-auto text-center max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-4">
            🚀 免费体验模式
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-4 font-sans">快速体验 AI 营销平台</h2>
          <p className="text-muted-foreground mb-6 font-manrope">
            无需注册，一键登录体验完整功能。包含预设知识库和示例对话。
          </p>
          <Button
            size="lg"
            className="font-manrope bg-gradient-to-r from-primary to-destructive hover:from-primary/90 hover:to-destructive/90"
            onClick={handleDemoLogin}
          >
            🚀 立即体验 (无需注册)
          </Button>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center max-w-3xl">
          <h2 className="text-3xl font-bold text-foreground mb-6 font-sans">准备好提升你的营销效率了吗？</h2>
          <p className="text-lg text-muted-foreground mb-8 font-manrope">
            加入数千名营销专业人士，体验 AI 驱动的内容创作革命
          </p>
          <Button size="lg" className="font-manrope" asChild>
            <Link href="/register">
              <MessageSquare className="w-5 h-5 mr-2" />
              立即开始
            </Link>
          </Button>
        </div>
      </section>
    </div>
  )
}
