import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ArrowUpRight, CheckCircle2, Compass, FileText, Search, Sparkles } from "lucide-react"
import { notFound } from "next/navigation"

import { PptPreviewWorkbench } from "@/components/lead-tools/ppt-preview-workbench"
import { SeoMetaWorkbench } from "@/components/lead-tools/seo-meta-workbench"
import { ToolShell } from "@/components/lead-tools/tool-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getLeadToolBySlug } from "@/lib/lead-tools/catalog"
import { getLeadToolExample, getLeadToolExampleHref, getLeadToolExampleParams, getLeadToolExamples } from "@/lib/lead-tools/examples"
import { buildMockPptPreview } from "@/lib/lead-tools/ppt-preview-data"
import { buildMockSeoMetaPreview } from "@/lib/lead-tools/seo-meta-data"

type LeadToolExamplePageProps = {
  params: Promise<{ slug: string; exampleSlug: string }>
}

export function generateStaticParams() {
  return getLeadToolExampleParams()
}

export async function generateMetadata({ params }: LeadToolExamplePageProps): Promise<Metadata> {
  const { slug, exampleSlug } = await params
  const tool = getLeadToolBySlug(slug)
  const example = getLeadToolExample(slug, exampleSlug)

  if (!tool || !example) {
    return {
      title: "Example not found | AI Marketing",
    }
  }

  return {
    title: `${example.title} | ${tool.name} | AI Marketing`,
    description: example.summary,
  }
}

export default async function LeadToolExamplePage({ params }: LeadToolExamplePageProps) {
  const { slug, exampleSlug } = await params
  const tool = getLeadToolBySlug(slug)
  const example = getLeadToolExample(slug, exampleSlug)

  if (!tool || !example) {
    notFound()
  }

  const relatedExamples = getLeadToolExamples(slug)
    .filter((item) => item.slug !== example.slug)
    .slice(0, 3)

  return (
    <ToolShell
      eyebrow={`${tool.category} · Example Page`}
      title={example.title}
      description={example.summary}
      proofPoints={[example.intent, ...example.tags]}
      faq={tool.faqs}
      aside={
        <div className="space-y-4 text-sm text-zinc-300">
          <Link href={tool.href} className="inline-flex items-center gap-2 text-zinc-400 transition hover:text-white">
            <ArrowLeft className="h-4 w-4" />
            返回 {tool.shortName}
          </Link>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-primary">示例定位</div>
            <p className="mt-3 leading-6 text-zinc-400">{example.intent}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-primary">建议动作</div>
            <p className="mt-3 leading-6 text-zinc-400">
              先看这个关键词怎么组织标题和结构，再跳回工具页继续生成自己的版本。
            </p>
            <Button asChild className="mt-4 w-full">
              <Link href={tool.href}>
                打开主工具页
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      }
    >
      <section className="grid gap-4 md:grid-cols-3">
        {example.kind === "seo-meta" ? (
          <>
            <Card className="border-white/10 bg-black/25 text-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Search className="h-5 w-5 text-primary" />
                  主题词
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-zinc-300">{example.request.topic}</CardContent>
            </Card>
            <Card className="border-white/10 bg-black/25 text-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Compass className="h-5 w-5 text-primary" />
                  目标受众
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-zinc-300">{example.request.audience}</CardContent>
            </Card>
            <Card className="border-white/10 bg-black/25 text-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  页面类型
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-zinc-300">
                {example.request.pageType} · {example.request.language}
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <Card className="border-white/10 bg-black/25 text-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Sparkles className="h-5 w-5 text-primary" />
                  主题
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-zinc-300">{example.request.prompt}</CardContent>
            </Card>
            <Card className="border-white/10 bg-black/25 text-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Compass className="h-5 w-5 text-primary" />
                  场景
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-zinc-300">{example.request.scenario}</CardContent>
            </Card>
            <Card className="border-white/10 bg-black/25 text-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  语言
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-zinc-300">{example.request.language}</CardContent>
            </Card>
          </>
        )}
      </section>

      <section className="mt-8">
        {example.kind === "seo-meta" ? (
          <SeoMetaWorkbench
            initialTopic={example.request.topic}
            initialAudience={example.request.audience}
            initialPageType={example.request.pageType}
            initialLanguage={example.request.language}
            initialPreview={buildMockSeoMetaPreview(example.request)}
          />
        ) : (
          <PptPreviewWorkbench
            initialPrompt={example.request.prompt}
            initialScenario={example.request.scenario}
            initialLanguage={example.request.language}
            initialDeck={buildMockPptPreview(example.request)}
            skipSavedSession
          />
        )}
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        {example.sections.map((section) => (
          <Card key={section.title} className="border-white/10 bg-black/25 text-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5 text-primary" />
                {section.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-zinc-300">{section.body}</CardContent>
          </Card>
        ))}
      </section>

      {relatedExamples.length > 0 ? (
        <section className="mt-10 rounded-[2rem] border border-white/10 bg-white/5 p-6">
          <div className="max-w-3xl space-y-2">
            <h2 className="text-2xl font-semibold text-white">更多示例页</h2>
            <p className="text-sm leading-6 text-zinc-400">这部分会继续长成程序化 SEO 示例层，每个页面都复用同一套工具底座。</p>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {relatedExamples.map((item) => (
              <Link
                key={item.slug}
                href={getLeadToolExampleHref(item.toolSlug, item.slug)}
                className="rounded-2xl border border-white/10 bg-black/25 p-5 transition hover:border-primary/30 hover:bg-black/35"
              >
                <div className="flex flex-wrap gap-2">
                  {item.tags.slice(0, 2).map((tag) => (
                    <Badge key={tag} variant="outline" className="border-primary/20 bg-primary/5 text-zinc-200">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <h3 className="mt-4 text-lg font-medium text-white">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-zinc-400">{item.summary}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </ToolShell>
  )
}
