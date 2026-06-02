import { PublicSiteFooter } from "@/components/seo/public-site-footer"
import { PublicSiteHeader } from "@/components/seo/public-site-header"
import { ToolCardGrid } from "@/components/lead-tools/tool-card-grid"
import { getRequestLocale } from "@/lib/i18n/request-locale"
import { getLocalizedLeadToolsCatalog } from "@/lib/lead-tools/catalog"

export default async function ToolsHubPage() {
  const locale = await getRequestLocale()
  const tools = getLocalizedLeadToolsCatalog(locale)

  const pageCopy =
    locale === "zh"
      ? {
          eyebrow: "SEO Lead Gen Tools",
          title: "一套公共站点主题，承接品牌流量与工具转化",
          description: "这里汇总了当前开放的工具入口。工具页会复用站点主题、语言与导航体验，不再脱离主站形成单独原型页。",
          gridTitle: "工具目录",
          gridDescription: "先从 AI PPT Preview 开始，后续 live 工具会继续复用同一套公共站点外壳与 lead-tools runtime。",
          liveLabel: "已上线",
          comingSoonLabel: "即将上线",
          openToolLabel: "进入工具",
        }
      : {
          eyebrow: "SEO Lead Gen Tools",
          title: "One public-site shell for brand traffic and tool conversion",
          description: "This hub lists the currently available tool entry points. Tool pages now reuse the same site theme, language, and navigation instead of feeling like detached prototypes.",
          gridTitle: "Tool Directory",
          gridDescription: "AI PPT Preview is the first live tool here. Future live tools will reuse the same public-site shell and lead-tools runtime.",
          liveLabel: "Live",
          comingSoonLabel: "Coming Soon",
          openToolLabel: "Open Tool",
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
            tools={tools}
            title={pageCopy.gridTitle}
            description={pageCopy.gridDescription}
            liveLabel={pageCopy.liveLabel}
            comingSoonLabel={pageCopy.comingSoonLabel}
            openToolLabel={pageCopy.openToolLabel}
          />
        </div>
      </section>

      <PublicSiteFooter />
    </main>
  )
}
