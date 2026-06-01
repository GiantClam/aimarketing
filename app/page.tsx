"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRight, MessageSquare, Sparkles, WandSparkles, Zap } from "lucide-react"

import { ToolCardGrid } from "@/components/lead-tools/tool-card-grid"
import { useAuth } from "@/components/auth-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { featuredLeadTool, leadToolsCatalog } from "@/lib/lead-tools/catalog"

export default function HomePage() {
  const { anonymousLogin } = useAuth()
  const router = useRouter()
  const [prompt, setPrompt] = useState("")

  const liveTools = leadToolsCatalog.filter((tool) => tool.status === "live")

  const handleDemoLogin = async () => {
    try {
      await anonymousLogin()
      router.push("/dashboard")
    } catch (error) {
      console.error("Demo login failed:", error)
    }
  }

  const openFeaturedTool = () => {
    const query = prompt.trim() ? `?prompt=${encodeURIComponent(prompt.trim())}` : ""
    router.push(`${featuredLeadTool.href}${query}`)
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(188,35,35,0.14),transparent_32%),linear-gradient(180deg,var(--background)_0%,color-mix(in_oklch,var(--background),black_8%)_100%)]">
      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">AI Marketing</h1>
              <p className="text-xs text-muted-foreground">Content platform + SEO lead gen tools</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="outline" className="border-primary/30 bg-primary/5 hover:bg-primary/10" onClick={handleDemoLogin}>
              🚀 免费体验
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/login">登录</Link>
            </Button>
            <Button asChild>
              <Link href="/register">开始使用</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        <section className="px-4 pb-14 pt-16 sm:px-6 lg:px-8 lg:pt-24">
          <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[minmax(0,1.1fr)_420px] lg:items-center">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-4 py-2 text-sm font-medium text-primary">
                <Zap className="h-4 w-4" />
                AI 驱动的营销内容平台 + 引流工具体系
              </div>

              <div className="space-y-5">
                <h2 className="max-w-4xl text-5xl font-semibold tracking-tight text-foreground sm:text-6xl">
                  先让用户
                  <span className="text-primary"> 快速看到结果</span>
                  ，再把高价值动作转成登录
                </h2>
                <p className="max-w-3xl text-lg leading-8 text-muted-foreground">
                  首页不再只是品牌介绍。我们用一组可直接体验的 SEO 工具承接搜索流量，其中第一站就是 AI PPT 快速预览。
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button size="lg" onClick={openFeaturedTool}>
                  <WandSparkles className="h-5 w-5" />
                  进入 AI PPT 预览
                </Button>
                <Button size="lg" variant="outline" onClick={handleDemoLogin}>
                  <MessageSquare className="h-5 w-5" />
                  体验主产品
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {featuredLeadTool.proofPoints.map((point) => (
                  <div key={point} className="rounded-2xl border border-border/70 bg-card/70 px-4 py-4 text-sm text-muted-foreground">
                    {point}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-primary/20 bg-card/85 p-6 shadow-[0_28px_90px_-46px_rgba(0,0,0,0.65)] backdrop-blur">
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <WandSparkles className="h-4 w-4" />
                Featured Lead Tool
              </div>
              <h3 className="mt-4 text-2xl font-semibold text-foreground">{featuredLeadTool.name}</h3>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{featuredLeadTool.tagline}</p>

              <div className="mt-6 space-y-3">
                <label className="text-sm font-medium text-foreground">输入一个主题，带着它进入工具页</label>
                <Input
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="例如：为 AI Marketing 制作 B2B 增长策略预览 PPT"
                  className="h-12 border-primary/15 bg-background/70"
                />
              </div>

              <Button className="mt-4 w-full" size="lg" onClick={openFeaturedTool}>
                生成多风格预览
                <ArrowRight className="h-4 w-4" />
              </Button>

              <div className="mt-5 rounded-2xl border border-border/70 bg-background/70 p-4 text-sm leading-6 text-muted-foreground">
                游客可以直接生成预览。点击下载预览包或完整生成时，系统再触发登录并自动回到当前会话。
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-border/70 bg-card/30 px-4 py-10 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-[1.5rem] border border-border/70 bg-background/75 p-5">
                <div className="text-sm font-medium text-primary">Lead Gen Pattern</div>
                <div className="mt-2 text-xl font-semibold text-foreground">预览开放</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">游客先感知价值，不把登录门槛放在第一次输入之前。</p>
              </div>
              <div className="rounded-[1.5rem] border border-border/70 bg-background/75 p-5">
                <div className="text-sm font-medium text-primary">Conversion Trigger</div>
                <div className="mt-2 text-xl font-semibold text-foreground">高价值动作拦截</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">下载、完整生成和保存历史这些动作，天然更适合转登录。</p>
              </div>
              <div className="rounded-[1.5rem] border border-border/70 bg-background/75 p-5">
                <div className="text-sm font-medium text-primary">Reusable Runtime</div>
                <div className="mt-2 text-xl font-semibold text-foreground">多工具共用底座</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">后续 SEO Meta、广告文案、邮件标题工具都复用同一套框架。</p>
              </div>
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <ToolCardGrid
              tools={leadToolsCatalog}
              title="首页引流工具矩阵"
              description="PPT 预览作为第一个上线样板，后续工具会复用相同的匿名预览、登录门槛和埋点机制。"
            />
          </div>
        </section>

        <section className="px-4 pb-20 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-5xl rounded-[2rem] border border-primary/20 bg-gradient-to-r from-primary/8 via-card to-primary/6 p-8 text-center">
            <h2 className="text-3xl font-semibold text-foreground">准备好同时验证 SEO 获客和产品转化了吗？</h2>
            <p className="mx-auto mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
              你可以直接进入已上线的工具体验，也可以先进入主产品控制台继续验证营销内容生成、视频和知识库能力。
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" asChild>
                <Link href={liveTools[0]?.href ?? "/tools"}>
                  体验引流工具
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" onClick={handleDemoLogin}>
                进入主产品 Demo
              </Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
