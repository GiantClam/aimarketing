import { PublicSiteFooter } from "@/components/seo/public-site-footer"
import { PublicSiteHeader } from "@/components/seo/public-site-header"
import { PptPreviewWorkbench } from "@/components/lead-tools/ppt-preview-workbench"
import { getLocalizedLeadToolBySlug } from "@/lib/lead-tools/catalog"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import { getPptMasterSessionDeck } from "@/lib/lead-tools/ppt-master-runtime"
import { getPptPreviewSessionDeck } from "@/lib/lead-tools/ppt-preview-session-store"
import type { PptLanguage, PptPreviewModelValue, PptScenario } from "@/lib/lead-tools/ppt-preview-data-fixed"
import type { SeoLanguage, SeoPageType } from "@/lib/lead-tools/seo-meta-data"

type ToolPageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{
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
  }>
}

export default async function ToolPage({ params, searchParams }: ToolPageProps) {
  const { slug } = await params
  const query = await searchParams
  const locale = await getRequestLocale()
  const tool = getLocalizedLeadToolBySlug(slug, locale)
  const defaultPptLanguage: PptLanguage = locale === "zh" ? "zh-CN" : "en-US"

  if (!tool) {
    const { MissingLeadToolPage } = await import("./tool-marketing-page")
    return <MissingLeadToolPage />
  }

  if (tool.slug === "ai-ppt-preview") {
    const previewSessionId = query.previewSessionId
    const sessionDeck = previewSessionId
      ? await getPptPreviewSessionDeck(previewSessionId)
          .catch(() => getPptMasterSessionDeck(previewSessionId))
          .catch(() => null)
      : null

    return (
      <main className="min-h-screen bg-background text-foreground">
        <PublicSiteHeader activeKey="tools" />
        <section className="public-grid-bg px-2 py-2 sm:px-3">
          <PptPreviewWorkbench
            initialPrompt={query.prompt ?? sessionDeck?.title}
            initialScenario={query.scenario ?? sessionDeck?.scenario ?? "marketing-campaign"}
            initialLanguage={query.language ?? sessionDeck?.language ?? defaultPptLanguage}
            initialModel={(query.model ?? sessionDeck?.previewModel ?? tool.previewModel) as PptPreviewModelValue}
            initialAction={query.action}
            initialDeck={sessionDeck}
            skipSavedSession={Boolean(sessionDeck)}
            embedded
          />
        </section>
        <PublicSiteFooter />
      </main>
    )
  }

  const { ToolMarketingPage } = await import("./tool-marketing-page")

  return (
    <ToolMarketingPage
      tool={tool}
      locale={locale}
      topic={query.topic}
      prompt={query.prompt}
      audience={query.audience}
      pageType={query.pageType}
      seoLanguage={query.seoLanguage}
    />
  )
}
