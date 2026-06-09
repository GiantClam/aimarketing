import Link from "next/link"
import { ArrowLeft, ArrowUpRight, CheckCircle2, Lock, Search, Sparkles, Workflow } from "lucide-react"

import { SeoMetaWorkbench } from "@/components/lead-tools/seo-meta-workbench"
import { ToolShell } from "@/components/lead-tools/tool-shell"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PublicMediaToolWorkbench } from "@/components/platform/public-media-tool-workbench"
import { PublicChatToolWorkbench } from "@/components/platform/public-chat-tool-workbench"
import type { AuthUser } from "@/lib/auth/session"
import type { LeadToolDefinition } from "@/lib/lead-tools/catalog"
import { getLeadToolExampleHref, getLeadToolExamples } from "@/lib/lead-tools/examples"
import type { AppLocale } from "@/lib/i18n/config"
import { localizePublicPath } from "@/lib/i18n/routing"
import type { SeoLanguage, SeoPageType } from "@/lib/lead-tools/seo-meta-data"
import { resolveLocalizedPlatformCapabilitiesFromSnapshot } from "@/lib/platform/capability-resolver"
import {
  getDeferredAvailabilityLabel,
  getDeferredEntryCopy,
  isDeferredAvailability,
} from "@/lib/platform/deferred-entry"
import { getLocalizedToolDirectoryEntryBySlug } from "@/lib/platform/directory-registry"
import { getPlatformCapabilityExecutionState } from "@/lib/platform/execution"
import { buildPlatformLaunchPath } from "@/lib/platform/launch-path"
import { getPlatformRuntimeSnapshot } from "@/lib/platform/runtime"

type ToolMarketingPageProps = {
  tool: LeadToolDefinition
  locale: AppLocale
  currentUser: AuthUser | null
  topic?: string
  prompt?: string
  audience?: string
  pageType?: SeoPageType
  seoLanguage?: SeoLanguage
}

export function MissingLeadToolPage({ locale = "en" }: { locale?: AppLocale }) {
  return (
    <div className="min-h-screen bg-background px-4 py-10 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl rounded-[2rem] border border-border/70 bg-card/90 p-10">
        <Link href={localizePublicPath("/tools", locale)} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to tools
        </Link>
        <h1 className="mt-6 text-3xl font-semibold text-foreground">This tool is not live yet</h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          AI PPT Preview is the current live reference tool. Other SEO-oriented lead-gen tools will reuse the same runtime, preview pattern, and conversion flow.
        </p>
        <div className="mt-8">
          <Button asChild>
            <Link href={localizePublicPath("/tools/ai-ppt-preview", locale)}>Open AI PPT Preview</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

function getExecutionStatusLabel(
  locale: AppLocale,
  runtimeStatus: "ready" | "deferred" | "runtime_disabled",
  accessState: "public" | "public_then_login" | "login_required" | "authorized" | "permission_required" | "admin_required",
) {
  const runtimeLabel =
    locale === "zh"
      ? {
          ready: "运行中",
          deferred: "后续实现",
          runtime_disabled: "运行时关闭",
        }[runtimeStatus]
      : {
          ready: "Runtime ready",
          deferred: "Deferred",
          runtime_disabled: "Runtime disabled",
        }[runtimeStatus]

  const accessLabel =
    locale === "zh"
      ? {
          public: "公开可见",
          public_then_login: "先公开后登录",
          login_required: "需登录",
          authorized: "已授权",
          permission_required: "需企业权限",
          admin_required: "需管理员",
        }[accessState]
      : {
          public: "Public",
          public_then_login: "Public then login",
          login_required: "Login required",
          authorized: "Authorized",
          permission_required: "Permission required",
          admin_required: "Admin required",
        }[accessState]

  return `${runtimeLabel} · ${accessLabel}`
}

export async function ToolMarketingPage({
  tool,
  locale,
  currentUser,
  topic,
  prompt,
  audience,
  pageType,
  seoLanguage,
}: ToolMarketingPageProps) {
  const examplePages = getLeadToolExamples(tool.slug).slice(0, 3)
  const toolDirectoryEntry = getLocalizedToolDirectoryEntryBySlug(locale, tool.slug)
  const deferredAvailability = toolDirectoryEntry?.availability
  const isDeferredTool =
    tool.accessMode === "deferred" || isDeferredAvailability(deferredAvailability)
  const platformCapabilityMap = new Map(
    resolveLocalizedPlatformCapabilitiesFromSnapshot(locale, "all", getPlatformRuntimeSnapshot()).map((item) => [
      item.slug,
      item,
    ] as const),
  )
  const deferredEntrySpec =
    tool.slug === "sentiment-monitoring"
      ? {
          workspaceHref: "/dashboard/agent-platform",
          directoryHref: "/agents",
        }
      : tool.slug === "video-remake-studio" || tool.slug === "hot-video-research"
        ? {
            workspaceHref: "/dashboard/workflows",
            directoryHref: "/workflows",
          }
        : null

  const workspaceEntrySpec =
    tool.slug === "ai-chat"
      ? {
          capabilitySlug: "ai-chat",
          workspaceHref: "/dashboard/ai",
          directoryHref: "/capabilities",
        }
      : tool.slug === "ai-image"
        ? {
            capabilitySlug: "ai-image",
            workspaceHref: "/dashboard/image-assistant",
            directoryHref: "/capabilities",
          }
        : tool.slug === "ai-video"
        ? {
            capabilitySlug: "ai-video",
            workspaceHref: "/dashboard/video",
            directoryHref: "/capabilities",
          }
        : null
  const workspaceCapability = workspaceEntrySpec
    ? platformCapabilityMap.get(workspaceEntrySpec.capabilitySlug)
    : null
  const workspaceExecution = workspaceEntrySpec
    ? await getPlatformCapabilityExecutionState(workspaceEntrySpec.capabilitySlug, locale, currentUser)
    : null
  const deferredCopy = getDeferredEntryCopy(locale, deferredAvailability)
  const copy =
    locale === "zh"
      ? {
          eyebrow: `${tool.category} 路 Lead Gen Tool`,
          toolsHubLabel: "返回工具目录",
          modelStrategy: "模型策略",
          conversionGate: "转化门槛",
          gatedDescription: "游客可以先看结果，下载和完整生成时再要求登录，并保留当前会话。",
          openDescription: "这个工具当前以即时预览和复制结果为主，不要求登录。",
          seoReasonTitle: "为什么适合 SEO 引流",
          seoReasonBody: "输入门槛低，结果又能直接用于标题、描述和程序化页面，是很适合承接搜索流量的轻工具形态。",
          multiAngleTitle: "为什么要多方向",
          multiAngleBody: "同一关键词在转化、覆盖和专业可信三个角度上都可能有不同最佳写法，多版本更利于测试和扩展。",
          proofTitle: "这证明了什么",
          proofBody: "这说明 lead-tools runtime 已经不只适合 PPT 预览，也能承载不同结果形态的 SEO 工具。",
          examplesTitle: "可索引示例页",
          examplesBody: "这些页面用固定示例词把工具能力讲清楚，再把用户导回主工具页，是后续程序化 SEO 的标准样板。",
          openExample: "查看示例页",
          notOpenTitle: "该工具暂未开放",
          notOpenBody: "当前只落地了 PPT 预览样板页，其余工具已经在 catalog 中占位，后续会复用同一套 Lead Tool Runtime 快速上线。",
          entryTitle: "从公共入口进入正式工作台",
          entryBody: "这个页面不是另起一套 runtime，而是把现有工作台能力包装成 public toolsite 能理解、能转化的入口。",
          loginAction: "登录后进入工作台",
          workspaceAction: "直接打开工作台",
          directoryAction: "查看能力中心",
          runtimeStrategyTitle: "运行时策略",
          runtimeStrategyBody: "公开入口负责定位、说明和转化，真实任务仍进入现有 workspace runtime 处理。",
          executionFlowTitle: "进入路径",
          executionFlowBody: "先理解能力，再登录进入正式工作台，避免普通用户从企业导航里迷路。",
          providerBindingsTitle: "当前能力绑定位",
          deferredNoticeTitle: "Deferred 边界",
          deferredNoticeBody: "相关 deferred 能力仍会保留平台位置，但不会伪装成已经可用的正式功能。",
          faqTitle: "常见问题",
          faqDescription: "这部分内容也会作为工具页的 SEO 长文结构的一部分。",
        }
      : {
          eyebrow: `${tool.category} Lead Gen Tool`,
          toolsHubLabel: "Back to tool directory",
          modelStrategy: "Model Strategy",
          conversionGate: "Conversion Gate",
          gatedDescription: "Visitors can review the output first. Login is only required for protected actions such as download or full generation, while keeping the current session.",
          openDescription: "This tool currently focuses on instant preview and copyable output, so login is not required.",
          seoReasonTitle: "Why this works for SEO acquisition",
          seoReasonBody: "The input friction is low and the result can be used directly in titles, descriptions, and programmatic pages, which makes it a strong lightweight search-acquisition format.",
          multiAngleTitle: "Why multiple directions matter",
          multiAngleBody: "The same keyword may need different framings for conversion, coverage, and credibility, so multiple variants are better for testing and expansion.",
          proofTitle: "What this proves",
          proofBody: "It shows that the lead-tools runtime can support more than PPT preview and can carry SEO-oriented tools with very different output shapes.",
          examplesTitle: "Indexable example pages",
          examplesBody: "These pages explain the tool clearly with fixed example keywords, then route users back to the main tool page. That becomes the standard template for programmatic SEO later.",
          openExample: "Open example page",
          notOpenTitle: "This tool is not open yet",
          notOpenBody: "Only the PPT preview reference page is fully live right now. The remaining tools are already cataloged and will reuse the same Lead Tool Runtime when they launch.",
          deferredEntryTitle: "Deferred module with a real platform entry",
          deferredEntryBody:
            "This module intentionally ships as an entry, explanation, and workspace path before the production runtime is ready. That keeps the platform information architecture honest without faking finished capability.",
          entryTitle: "Use one public entry to reach the real workspace",
          entryBody: "This page does not introduce a second runtime. It packages the existing workspace capability into a public-facing entry that can convert and educate new users.",
          loginAction: "Log in to workspace",
          workspaceAction: "Open workspace",
          directoryAction: "View capabilities",
          runtimeStrategyTitle: "Runtime strategy",
          runtimeStrategyBody: "The public entry handles positioning, explanation, and conversion while the real task execution stays in the existing workspace runtime.",
          executionFlowTitle: "Entry flow",
          executionFlowBody: "Help users understand the capability first, then log in and continue in the formal workspace instead of dropping them into enterprise navigation cold.",
          providerBindingsTitle: "Current capability bindings",
          deferredNoticeTitle: "Deferred boundary",
          deferredNoticeBody: "Related deferred modules keep a visible platform position, but they are not presented as already-finished production features.",
          faqTitle: "FAQ",
          faqDescription: "This section also serves as long-form SEO support content for the tool page.",
        }

  const mediaWorkbenchSpec =
    tool.slug === "ai-image"
      ? {
          capabilitySlug: "ai-image" as const,
        }
      : tool.slug === "ai-video"
        ? {
            capabilitySlug: "ai-video" as const,
          }
        : null

  return (
    <ToolShell
      eyebrow={copy.eyebrow}
      title={tool.name}
      description={tool.description}
      proofPoints={tool.proofPoints}
      faqTitle={copy.faqTitle}
      faqDescription={copy.faqDescription}
      faq={tool.faqs}
      aside={
        <div className="space-y-4 text-sm text-muted-foreground">
          <Link href={localizePublicPath("/tools", locale)} className="inline-flex items-center gap-2 text-muted-foreground transition hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            {copy.toolsHubLabel}
          </Link>
          <div className="rounded-2xl border border-border/70 bg-card p-4">
            <div className="text-xs uppercase tracking-[0.18em] text-primary">{copy.modelStrategy}</div>
            <div className="mt-3 space-y-2">
              <p>Preview: {tool.previewModel}</p>
              <p>Final: {tool.finalModel}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card p-4">
            <div className="flex items-center gap-2 text-foreground">
              <Lock className="h-4 w-4 text-primary" />
              {copy.conversionGate}
            </div>
            <p className="mt-3 leading-6 text-muted-foreground">
              {tool.downloadRequiresLogin || tool.finalizeRequiresLogin ? copy.gatedDescription : copy.openDescription}
            </p>
          </div>
        </div>
      }
    >
      {tool.slug === "ai-seo-meta-generator" ? (
        <>
          <SeoMetaWorkbench
            initialTopic={topic ?? prompt}
            initialAudience={audience}
            initialPageType={pageType}
            initialLanguage={seoLanguage}
          />

          <section className="mt-8 grid gap-4 md:grid-cols-3">
            <Card className="border-border/70 bg-card/85 text-foreground">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Search className="h-5 w-5 text-primary" />
                  {copy.seoReasonTitle}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">{copy.seoReasonBody}</CardContent>
            </Card>
            <Card className="border-border/70 bg-card/85 text-foreground">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Sparkles className="h-5 w-5 text-primary" />
                  {copy.multiAngleTitle}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">{copy.multiAngleBody}</CardContent>
            </Card>
            <Card className="border-border/70 bg-card/85 text-foreground">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  {copy.proofTitle}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">{copy.proofBody}</CardContent>
            </Card>
          </section>

          {examplePages.length > 0 ? (
            <section className="mt-10 rounded-[2rem] border border-border/70 bg-card/85 p-6">
              <div className="max-w-3xl space-y-2">
                <h2 className="text-2xl font-semibold text-foreground">{copy.examplesTitle}</h2>
                <p className="text-sm leading-6 text-zinc-400">{copy.examplesBody}</p>
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                {examplePages.map((example) => (
                  <Link
                    key={example.slug}
                    href={localizePublicPath(getLeadToolExampleHref(example.toolSlug, example.slug), locale)}
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
                      {copy.openExample}
                      <ArrowUpRight className="h-4 w-4" />
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : isDeferredTool && deferredEntrySpec ? (
        <>
          <section className="rounded-[2rem] border border-border/70 bg-card/85 p-6">
            <div className="max-w-3xl space-y-3">
              <Badge variant="outline" className="border-primary/20 bg-primary/5 text-zinc-200">
                {getDeferredAvailabilityLabel(locale, deferredAvailability)}
              </Badge>
              <h2 className="text-2xl font-semibold text-foreground">{deferredCopy.title}</h2>
              <p className="text-sm leading-6 text-muted-foreground">{deferredCopy.body}</p>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild>
                <Link href={localizePublicPath(deferredEntrySpec.directoryHref, locale)}>
                  {deferredCopy.primaryActionLabel}
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={deferredEntrySpec.workspaceHref}>{deferredCopy.secondaryActionLabel}</Link>
              </Button>
            </div>
          </section>

          <section className="mt-8 grid gap-4 md:grid-cols-3">
            {tool.proofPoints.map((point) => (
              <Card key={point} className="border-border/70 bg-card/85 text-foreground">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                    {tool.shortName}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-6 text-muted-foreground">{point}</CardContent>
              </Card>
            ))}
          </section>
        </>
      ) : workspaceCapability && workspaceEntrySpec ? (
        <>
          {tool.slug === "ai-chat" && workspaceExecution ? (
            <PublicChatToolWorkbench
              locale={locale}
              currentUser={Boolean(currentUser)}
              loginHref={buildPlatformLaunchPath({
                itemType: "capability",
                slug: workspaceEntrySpec.capabilitySlug,
                surface: "workspace",
                locale,
              })}
              workspaceHref={workspaceEntrySpec.workspaceHref}
              runtimeStatus={workspaceExecution.runtimeStatus}
              accessState={workspaceExecution.accessState}
            />
          ) : null}

          {mediaWorkbenchSpec && workspaceExecution ? (
            <PublicMediaToolWorkbench
              capabilitySlug={mediaWorkbenchSpec.capabilitySlug as "ai-image" | "ai-video"}
              locale={locale}
              currentUser={Boolean(currentUser)}
              loginHref={buildPlatformLaunchPath({
                itemType: "capability",
                slug: workspaceEntrySpec.capabilitySlug,
                surface: "workspace",
                locale,
              })}
              workspaceHref={workspaceEntrySpec.workspaceHref}
              runtimeStatus={workspaceExecution.runtimeStatus}
              accessState={workspaceExecution.accessState}
            />
          ) : null}

          <section className="rounded-[2rem] border border-border/70 bg-card/85 p-6">
            <div className="max-w-3xl space-y-2">
              <h2 className="text-2xl font-semibold text-foreground">
                {tool.status === "coming_soon" ? copy.deferredEntryTitle : copy.entryTitle}
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                {tool.status === "coming_soon" ? copy.deferredEntryBody : copy.entryBody}
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild>
                <Link
                  href={buildPlatformLaunchPath({
                    itemType: "capability",
                    slug: workspaceEntrySpec.capabilitySlug,
                    surface: "workspace",
                    locale,
                  })}
                >
                  {copy.loginAction}
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link
                  href={buildPlatformLaunchPath({
                    itemType: "capability",
                    slug: workspaceEntrySpec.capabilitySlug,
                    surface: "workspace",
                    locale,
                  })}
                >
                  {copy.workspaceAction}
                </Link>
              </Button>
              <Button variant="ghost" asChild>
                <Link href={localizePublicPath(workspaceEntrySpec.directoryHref, locale)}>{copy.directoryAction}</Link>
              </Button>
            </div>
          </section>

          <section className="mt-8 grid gap-4 md:grid-cols-3">
            <Card className="border-border/70 bg-card/85 text-foreground">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Workflow className="h-5 w-5 text-primary" />
                  {copy.runtimeStrategyTitle}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">{copy.runtimeStrategyBody}</CardContent>
            </Card>
            <Card className="border-border/70 bg-card/85 text-foreground">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <ArrowUpRight className="h-5 w-5 text-primary" />
                  {copy.executionFlowTitle}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">{copy.executionFlowBody}</CardContent>
            </Card>
            <Card className="border-border/70 bg-card/85 text-foreground">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  {copy.deferredNoticeTitle}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm leading-6 text-muted-foreground">{copy.deferredNoticeBody}</CardContent>
            </Card>
          </section>

          <section className="mt-8 rounded-[2rem] border border-border/70 bg-card/85 p-6">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-foreground">{copy.providerBindingsTitle}</h2>
              <p className="text-sm leading-6 text-muted-foreground">{workspaceCapability.summary}</p>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {workspaceCapability.bindings.map((binding) => (
                <Badge key={`${workspaceCapability.slug}-${binding.provider}`} variant="outline" className="border-primary/20 bg-primary/5 text-zinc-200">
                  {binding.provider} · {binding.status}
                </Badge>
              ))}
              {workspaceExecution ? (
                <Badge variant="outline" className="border-primary/20 bg-primary/5 text-zinc-200">
                  {getExecutionStatusLabel(locale, workspaceExecution.runtimeStatus, workspaceExecution.accessState)}
                </Badge>
              ) : null}
              {workspaceExecution?.billing?.availableCredits != null ? (
                <Badge variant="outline" className="border-primary/20 bg-primary/5 text-zinc-200">
                  {locale === "zh"
                    ? `Credits ${workspaceExecution.billing.availableCredits}`
                    : `${workspaceExecution.billing.availableCredits} credits`}
                </Badge>
              ) : null}
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {(workspaceExecution?.notes || workspaceCapability.proofPoints).map((point) => (
                <div key={point} className="rounded-2xl border border-border/70 bg-background/75 p-5 text-sm leading-6 text-muted-foreground">
                  {point}
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        <div className="rounded-[2rem] border border-border/70 bg-card/85 p-8 text-foreground">
          <h2 className="text-2xl font-semibold">{copy.notOpenTitle}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{copy.notOpenBody}</p>
        </div>
      )}
    </ToolShell>
  )
}
