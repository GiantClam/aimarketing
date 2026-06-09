import Link from "next/link"
import { ArrowLeft, ArrowUpRight, CheckCircle2, Compass, FileText, Search, Sparkles } from "lucide-react"
import { notFound } from "next/navigation"

import { PublicSiteFooter } from "@/components/seo/public-site-footer"
import { PublicSiteHeader } from "@/components/seo/public-site-header"
import { PptPreviewWorkbench } from "@/components/lead-tools/ppt-preview-workbench"
import { SeoMetaWorkbench } from "@/components/lead-tools/seo-meta-workbench"
import { ToolCardGrid } from "@/components/lead-tools/tool-card-grid"
import { ToolShell } from "@/components/lead-tools/tool-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getServerSessionUser } from "@/lib/auth/server-session"
import type { AppLocale } from "@/lib/i18n/config"
import { localizePublicPath } from "@/lib/i18n/routing"
import { getLeadToolBySlug, getLocalizedLeadToolBySlug } from "@/lib/lead-tools/catalog"
import { getLeadToolExample, getLeadToolExampleHref, getLeadToolExamples } from "@/lib/lead-tools/examples"
import { buildFrontendSlidesPreviewDeck } from "@/lib/lead-tools/ppt-engines/frontend-slides-preview-runtime"
import { getLocalizedPlatformHubLinks } from "@/lib/platform/catalog"
import { getLocalizedPublicToolsCenterEntries } from "@/lib/platform/directory-registry"
import { buildMockPptPreview } from "@/lib/lead-tools/ppt-preview-data-fixed"
import { getPptMasterSessionDeck } from "@/lib/lead-tools/ppt-master-runtime"
import { renderPptPreviewDeckAssets } from "@/lib/lead-tools/ppt-master-preview"
import { getPptPreviewSessionDeck } from "@/lib/lead-tools/ppt-preview-session-store"
import type { PptLanguage, PptPreviewModelValue, PptScenario } from "@/lib/lead-tools/ppt-preview-data-fixed"
import { buildMockSeoMetaPreview } from "@/lib/lead-tools/seo-meta-data"
import type { SeoLanguage, SeoPageType } from "@/lib/lead-tools/seo-meta-data"

import { MissingLeadToolPage, ToolMarketingPage } from "@/app/tools/[slug]/tool-marketing-page"

export type LeadToolRouteSearchParams = {
  prompt?: string
  scenario?: PptScenario
  language?: PptLanguage
  model?: PptPreviewModelValue
  previewSessionId?: string
  action?: "download" | "finalize"
  topic?: string
  audience?: string
  pageType?: SeoPageType
  seoLanguage?: SeoLanguage
}

export async function renderToolsHubPage(locale: AppLocale) {
  const entries = getLocalizedPublicToolsCenterEntries(locale)
  const platformLinks = getLocalizedPlatformHubLinks(locale).filter((item) => item.slug !== "agents")

  const pageCopy =
    locale === "zh"
      ? {
          eyebrow: "SEO Lead Gen Tools",
          title: "一套公共站点主题，承接品牌流量与工具转化",
          description: "这里汇总了当前开放的工具入口。工具页会复用站点主题、语言与导航体验，不再脱离主站形成单独原型页。",
          gridTitle: "工具目录",
          gridDescription:
            "按媒介和场景筛选可用工具与公开平台入口。AI 对话、AI PPT、SEO、图片、视频与 Agent 入口会在同一个应用中心里统一呈现。",
          liveLabel: "已上线",
          comingSoonLabel: "即将上线",
          waitlistLabel: "等待名单",
          enterpriseOnlyLabel: "企业专享",
          openToolLabel: "进入工具",
          previewToolLabel: "查看入口",
        }
      : {
          eyebrow: "SEO Lead Gen Tools",
          title: "One public-site shell for brand traffic and tool conversion",
          description: "This hub lists the currently available tool entry points. Tool pages now reuse the same site theme, language, and navigation instead of feeling like detached prototypes.",
          gridTitle: "Tool Directory",
          gridDescription:
            "Filter live tools and public platform entries by media and scenario. AI chat, AI PPT, SEO, image, video, and agent entry points now share one app-center surface.",
          liveLabel: "Live",
          comingSoonLabel: "Coming Soon",
          waitlistLabel: "Waitlist",
          enterpriseOnlyLabel: "Enterprise Only",
          openToolLabel: "Open Tool",
          previewToolLabel: "View Entry",
        }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <PublicSiteHeader activeKey="tools" />

      <section className="public-grid-bg mx-auto max-w-7xl px-6 py-16 lg:py-20">
        <div className="space-y-8">
          <div className="max-w-4xl space-y-4">
            <div className="public-kicker text-muted-foreground">{pageCopy.eyebrow}</div>
            <h1 className="public-display max-w-5xl text-5xl text-foreground lg:text-6xl">{pageCopy.title}</h1>
            <p className="max-w-3xl text-lg leading-8 text-muted-foreground">{pageCopy.description}</p>
          </div>

          <ToolCardGrid
            entries={entries.map((entry) => ({ ...entry, href: localizePublicPath(entry.href, locale) }))}
            locale={locale === "zh" ? "zh" : "en"}
            title={pageCopy.gridTitle}
            description={pageCopy.gridDescription}
            availableLabel={pageCopy.liveLabel}
            comingSoonLabel={pageCopy.comingSoonLabel}
            waitlistLabel={pageCopy.waitlistLabel}
            enterpriseOnlyLabel={pageCopy.enterpriseOnlyLabel}
            openToolLabel={pageCopy.openToolLabel}
            previewToolLabel={pageCopy.previewToolLabel}
          />

          <div className="space-y-4">
            <div className="max-w-4xl space-y-2">
              <div className="public-kicker text-muted-foreground">
                {locale === "zh" ? "Platform Directories" : "Platform Directories"}
              </div>
              <h2 className="font-display text-3xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                {locale === "zh" ? "继续探索更多平台目录" : "Explore the rest of the platform directories"}
              </h2>
              <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
                {locale === "zh"
                  ? "应用中心之外，public toolsite 还会继续承接能力中心、插件目录、MCP 服务和工作流模板这些更平台化的导航入口。"
                  : "Beyond the app center itself, the public toolsite also carries capabilities, plugins, MCP services, and workflow templates as platform-level navigation surfaces."}
              </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {platformLinks.map((item) => (
                <a
                  key={item.slug}
                  href={localizePublicPath(item.href, locale)}
                  className="public-panel rounded-[12px] border border-border bg-card/80 p-6 transition hover:border-primary/30 hover:bg-background"
                >
                  <div className="public-kicker text-muted-foreground">{locale === "zh" ? "Directory" : "Directory"}</div>
                  <div className="mt-3 font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
                    {item.title}
                  </div>
                  <p className="mt-3 text-sm leading-7 text-muted-foreground">{item.summary}</p>
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      <PublicSiteFooter />
    </main>
  )
}

export async function renderLeadToolPage(
  locale: AppLocale,
  slug: string,
  query: LeadToolRouteSearchParams,
) {
  const tool = getLocalizedLeadToolBySlug(slug, locale)
  const currentUser = await getServerSessionUser().catch(() => null)
  const defaultPptLanguage: PptLanguage = locale === "zh" ? "zh-CN" : "en-US"

  if (!tool) {
    return <MissingLeadToolPage locale={locale} />
  }

  if (tool.slug === "ai-ppt-preview") {
    const previewSessionId = query.previewSessionId
    const sessionDeck = previewSessionId
      ? await getPptPreviewSessionDeck(previewSessionId)
          .catch(() => getPptMasterSessionDeck(previewSessionId))
          .catch(() => null)
      : null
    const initialScenario = query.scenario ?? sessionDeck?.scenario ?? "marketing-campaign"
    const initialLanguage = query.language ?? sessionDeck?.language ?? defaultPptLanguage
    const initialModel = (query.model ?? sessionDeck?.previewModel ?? tool.previewModel) as PptPreviewModelValue
    const displayDeck = sessionDeck
      ? null
      : buildFrontendSlidesPreviewDeck(
          buildMockPptPreview({
            prompt: query.prompt ?? "",
            scenario: initialScenario,
            language: "en-US",
            model: initialModel,
          }),
        )

    return (
      <main className="min-h-screen bg-background text-foreground">
        <PublicSiteHeader activeKey="tools" />
        <section className="public-grid-bg px-2 py-2 sm:px-3">
          <PptPreviewWorkbench
            initialPrompt={query.prompt ?? sessionDeck?.title}
            initialScenario={initialScenario}
            initialLanguage={initialLanguage}
            initialModel={initialModel}
            initialAction={query.action}
            initialDeck={sessionDeck}
            initialDisplayDeck={displayDeck}
            skipSavedSession={Boolean(sessionDeck)}
            embedded
          />
        </section>
        <PublicSiteFooter />
      </main>
    )
  }

  return (
    <ToolMarketingPage
      tool={tool}
      locale={locale}
      currentUser={currentUser}
      topic={query.topic}
      prompt={query.prompt}
      audience={query.audience}
      pageType={query.pageType}
      seoLanguage={query.seoLanguage}
    />
  )
}

export async function renderLeadToolExamplePage(locale: AppLocale, slug: string, exampleSlug: string) {
  const tool = getLocalizedLeadToolBySlug(slug, locale) ?? getLeadToolBySlug(slug)
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
          <Link href={localizePublicPath(tool.href, locale)} className="inline-flex items-center gap-2 text-zinc-400 transition hover:text-white">
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
              <Link href={localizePublicPath(tool.href, locale)}>
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
            initialModel="MiniMax-M2.7-highspeed"
            initialDeck={renderPptPreviewDeckAssets(buildMockPptPreview(example.request))}
            skipSavedSession
            embedded
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
                href={localizePublicPath(getLeadToolExampleHref(item.toolSlug, item.slug), locale)}
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
