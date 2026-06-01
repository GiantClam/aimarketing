import Link from "next/link"
import { ArrowLeft, ArrowUpRight, CheckCircle2, Lock, Search, Sparkles } from "lucide-react"

import { PptPreviewWorkbench } from "@/components/lead-tools/ppt-preview-workbench"
import { SeoMetaWorkbench } from "@/components/lead-tools/seo-meta-workbench"
import { ToolShell } from "@/components/lead-tools/tool-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getLeadToolBySlug, leadToolsCatalog } from "@/lib/lead-tools/catalog"
import type { PptLanguage, PptScenario } from "@/lib/lead-tools/ppt-preview-data"
import { getLeadToolExampleHref, getLeadToolExamples } from "@/lib/lead-tools/examples"
import type { SeoLanguage, SeoPageType } from "@/lib/lead-tools/seo-meta-data"

type ToolPageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{
    prompt?: string
    scenario?: PptScenario
    language?: PptLanguage
    action?: "download" | "finalize"
    topic?: string
    audience?: string
    pageType?: SeoPageType
    seoLanguage?: SeoLanguage
  }>
}

export default async function ToolPage({ params, searchParams }: ToolPageProps) {
  const { slug } = await params
  const query = await searchParams
  const tool = getLeadToolBySlug(slug)

  if (!tool) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(188,35,35,0.14),transparent_32%),linear-gradient(180deg,var(--background)_0%,color-mix(in_oklch,var(--background),black_8%)_100%)] px-4 py-10 text-foreground sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl rounded-[2rem] border border-border/70 bg-card/90 p-10">
          <Link href="/tools" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            返回工具目录
          </Link>
          <h1 className="mt-6 text-3xl font-semibold text-foreground">这个工具还没上线</h1>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            当前只上线了 AI PPT 快速预览样板。其他 SEO 引流工具会复用同一套预览、登录门槛和埋点框架。
          </p>
          <div className="mt-8">
            <Button asChild>
              <Link href="/tools/ai-ppt-preview">先体验 AI PPT 快速预览</Link>
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const relatedTools = leadToolsCatalog.filter((item) => item.slug !== tool.slug).slice(0, 3)
  const examplePages = getLeadToolExamples(tool.slug).slice(0, 3)

  return (
    <ToolShell
      eyebrow={`${tool.category} · Lead Gen Tool`}
      title={tool.name}
      description={tool.description}
      proofPoints={tool.proofPoints}
      faq={tool.faqs}
      aside={
        <div className="space-y-4 text-sm text-muted-foreground">
          <Link href="/tools" className="inline-flex items-center gap-2 text-muted-foreground transition hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            返回工具目录
          </Link>
          <div className="rounded-2xl border border-border/70 bg-card p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-primary">模型策略</div>
            <div className="mt-3 space-y-2">
              <p>Preview: {tool.previewModel}</p>
              <p>Final: {tool.finalModel}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card p-4">
            <div className="flex items-center gap-2 text-foreground">
              <Lock className="h-4 w-4 text-primary" />
              转化门槛
            </div>
            <p className="mt-3 leading-6 text-muted-foreground">
              {tool.downloadRequiresLogin || tool.finalizeRequiresLogin
                ? "游客可以先看结果，下载和完整生成时再要求登录，并保留当前会话。"
                : "这个工具当前以即时预览和复制结果为主，不要求登录。"}
            </p>
          </div>
        </div>
      }
    >
      {tool.slug === "ai-ppt-preview" ? (
        <>
          <PptPreviewWorkbench
            initialPrompt={query.prompt}
            initialScenario={query.scenario ?? "marketing-campaign"}
            initialLanguage={query.language ?? "zh-CN"}
            initialAction={query.action}
          />

          <section className="mt-8 grid gap-4 md:grid-cols-3">
            <Card className="border-border/70 bg-card/85 text-foreground">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Sparkles className="h-5 w-5 text-primary" />
                  结果为什么更快
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">
                这一层先生成 `deck` 预览结构和样式版本，不直接卡在完整 PPTX 导出上，所以首结果更适合首页和 SEO 流量。
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-card/85 text-foreground">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Lock className="h-5 w-5 text-primary" />
                  为什么在这里拦登录
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">
                下载和完整生成是最强烈的意图信号，把登录放在这里，能显著降低游客的进入阻力，同时保留转化抓手。
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-card/85 text-foreground">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  下一步怎么扩展
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">
                接上真实预览 API、最终 PPT 导出器和埋点后，这个工具就能作为未来更多 SEO 工具的共享底座。
              </CardContent>
            </Card>
          </section>

          <section className="mt-10 rounded-[2rem] border border-border/70 bg-card/85 p-6">
            <div className="max-w-3xl space-y-2">
              <h2 className="text-2xl font-semibold text-foreground">后续可以接入的相关工具</h2>
              <p className="text-sm leading-6 text-muted-foreground">这些工具都可以复用当前的匿名预览、登录回跳和动作拦截机制。</p>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {relatedTools.map((item) => (
                <div key={item.slug} className="rounded-2xl border border-border/70 bg-background/75 p-5">
                  <div className="text-xs uppercase tracking-[0.18em] text-primary">{item.category}</div>
                  <h3 className="mt-2 text-lg font-medium text-foreground">{item.name}</h3>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.tagline}</p>
                </div>
              ))}
            </div>
          </section>

          {examplePages.length > 0 ? (
            <section className="mt-10 rounded-[2rem] border border-border/70 bg-card/85 p-6">
              <div className="max-w-3xl space-y-2">
                <h2 className="text-2xl font-semibold text-foreground">热门示例页</h2>
                <p className="text-sm leading-6 text-muted-foreground">示例页负责承接更具体的搜索意图，再把用户导回可直接交互的预览工具。</p>
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                {examplePages.map((example) => (
                  <Link
                    key={example.slug}
                    href={getLeadToolExampleHref(example.toolSlug, example.slug)}
                    className="rounded-2xl border border-border/70 bg-background/75 p-5 transition hover:border-primary/30 hover:bg-primary/5"
                  >
                    <div className="flex flex-wrap gap-2">
                      {example.tags.slice(0, 2).map((tag) => (
                        <Badge key={tag} variant="outline" className="border-primary/20 bg-primary/5 text-zinc-200">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <h3 className="mt-4 text-lg font-medium text-foreground">{example.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{example.summary}</p>
                    <div className="mt-4 inline-flex items-center gap-2 text-sm text-primary">
                      查看示例页
                      <ArrowUpRight className="h-4 w-4" />
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : tool.slug === "ai-seo-meta-generator" ? (
        <>
          <SeoMetaWorkbench
            initialTopic={query.topic ?? query.prompt}
            initialAudience={query.audience}
            initialPageType={query.pageType}
            initialLanguage={query.seoLanguage}
          />

          <section className="mt-8 grid gap-4 md:grid-cols-3">
            <Card className="border-border/70 bg-card/85 text-foreground">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Search className="h-5 w-5 text-primary" />
                  为什么适合 SEO 引流
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">
                输入门槛极低，结果又能直接用于标题、描述和程序化页面，是非常适合承接搜索流量的轻工具形态。
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-card/85 text-foreground">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Sparkles className="h-5 w-5 text-primary" />
                  为什么要多个方向
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">
                同一个关键词在转化、覆盖和专业可信三个角度上都可能有不同最佳写法，多版本更利于测试和扩展。
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-card/85 text-foreground">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  这证明了什么
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">
                这说明 lead-tools runtime 已经不只适合 PPT 预览，也能承载完全不同结果形态的 SEO 工具。
              </CardContent>
            </Card>
          </section>

          {examplePages.length > 0 ? (
            <section className="mt-10 rounded-[2rem] border border-border/70 bg-card/85 p-6">
              <div className="max-w-3xl space-y-2">
                <h2 className="text-2xl font-semibold text-foreground">可索引示例页</h2>
                <p className="text-sm leading-6 text-zinc-400">
                  这些页面用固定示例词把工具能力讲清楚，再把用户导回主工具页，是后续程序化 SEO 的标准样板。
                </p>
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                {examplePages.map((example) => (
                  <Link
                    key={example.slug}
                    href={getLeadToolExampleHref(example.toolSlug, example.slug)}
                    className="rounded-2xl border border-border/70 bg-background/75 p-5 transition hover:border-primary/30 hover:bg-primary/5"
                  >
                    <div className="flex flex-wrap gap-2">
                      {example.tags.slice(0, 2).map((tag) => (
                        <Badge key={tag} variant="outline" className="border-primary/20 bg-primary/5 text-zinc-200">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <h3 className="mt-4 text-lg font-medium text-foreground">{example.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{example.summary}</p>
                    <div className="mt-4 inline-flex items-center gap-2 text-sm text-primary">
                      查看示例页
                      <ArrowUpRight className="h-4 w-4" />
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <div className="rounded-[2rem] border border-border/70 bg-card/85 p-8 text-foreground">
          <h2 className="text-2xl font-semibold">该工具暂未开放</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            当前只落地了 PPT 预览样板页，其余工具已经在 catalog 中占位，后续会复用同一套 Lead Tool Runtime 快速上线。
          </p>
        </div>
      )}
    </ToolShell>
  )
}
