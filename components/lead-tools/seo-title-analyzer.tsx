"use client"

import { useMemo, useState } from "react"
import { Check, Copy, LockKeyhole, Loader2, Search, Sparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { paidSeoCapabilities, type SeoTitleCandidate, type SeoTitleInput, type SeoTitleReport } from "@/lib/seo-tools/title-report"
import type { AppLocale } from "@/lib/i18n/config"

type SeoTitleAnalyzerProps = {
  locale?: AppLocale
  initialKeyword?: string
  initialAudience?: string
  initialPageType?: SeoTitleInput["pageType"]
  initialLanguage?: SeoTitleInput["language"]
  upgradeHref: string
}

type StreamStage = "input_analyzing" | "titles_generating" | "titles_scoring" | "finalizing"

const STREAM_STAGES: StreamStage[] = ["input_analyzing", "titles_generating", "titles_scoring", "finalizing"]
const SESSION_KEY = "seo-title-analyzer:v1"
const REQUEST_TIMEOUT_MS = 47_000

const FORM_OPTIONS = {
  zh: {
    pageTypes: [
      ["landing-page", "落地页"],
      ["blog-post", "博客文章"],
      ["product-page", "产品页"],
      ["feature-page", "功能页"],
    ],
    languages: [
      ["zh-CN", "中文"],
      ["en-US", "English"],
    ],
    regions: ["中国", "美国", "英国", "加拿大", "澳大利亚", "全球市场"],
    audiences: ["增长负责人和内容团队", "营销团队", "独立开发者", "中小企业主", "电商运营团队", "B2B 销售团队"],
    valuePropositions: ["提升自然流量与点击率", "更快产出可用的 SEO 标题", "为产品页面带来高意图流量", "帮助团队更快完成内容规划"],
  },
  en: {
    pageTypes: [
      ["landing-page", "Landing page"],
      ["blog-post", "Blog post"],
      ["product-page", "Product page"],
      ["feature-page", "Feature page"],
    ],
    languages: [
      ["en-US", "English"],
      ["zh-CN", "中文"],
    ],
    regions: ["United States", "United Kingdom", "Canada", "Australia", "Europe", "Global market"],
    audiences: ["Marketing teams and SEO managers", "Growth leaders", "Startup founders", "Ecommerce teams", "B2B sales teams", "Content creators"],
    valuePropositions: ["Increase organic traffic and click-through rate", "Create usable SEO titles faster", "Bring high-intent traffic to product pages", "Help teams plan content faster"],
  },
} as const

function parseStreamChunk(chunk: string) {
  const lines = chunk.split("\n")
  const event = lines.find((line) => line.startsWith("event: "))?.slice(7).trim()
  const rawData = lines.find((line) => line.startsWith("data: "))?.slice(6)
  if (!event || !rawData) return null
  try {
    return { event, data: JSON.parse(rawData) as Record<string, unknown> }
  } catch {
    return null
  }
}

async function readApiError(response: Response) {
  try {
    const body = (await response.json()) as { error?: string }
    return body.error || "Unable to analyze this SEO title."
  } catch {
    return "Unable to analyze this SEO title."
  }
}

function stageLabel(stage: StreamStage, isChinese: boolean) {
  const labels = isChinese
    ? {
        input_analyzing: "校验输入与页面目标",
        titles_generating: "生成差异化标题角度",
        titles_scoring: "计算关键词、长度与重复度",
        finalizing: "整理可执行报告",
      }
    : {
        input_analyzing: "Validating inputs and page goal",
        titles_generating: "Generating distinct title angles",
        titles_scoring: "Scoring keyword, length, and overlap",
        finalizing: "Preparing the actionable report",
      }

  return labels[stage]
}

function keywordPositionLabel(position: SeoTitleCandidate["ruleScore"]["keywordPosition"], isChinese: boolean) {
  if (position === "start") return isChinese ? "标题开头" : "At the beginning"
  if (position === "included") return isChinese ? "自然包含" : "Included naturally"
  return isChinese ? "未完整包含" : "Not fully included"
}

export function SeoTitleAnalyzer({
  locale = "en",
  initialKeyword = "",
  initialAudience = "",
  initialPageType = "landing-page",
  initialLanguage,
  upgradeHref,
}: SeoTitleAnalyzerProps) {
  const isChinese = locale === "zh"
  const [keyword, setKeyword] = useState(initialKeyword)
  const [audience, setAudience] = useState(initialAudience || (isChinese ? "增长负责人和内容团队" : "marketing teams and SEO managers"))
  const [region, setRegion] = useState(isChinese ? "中国" : "United States")
  const [pageType, setPageType] = useState<SeoTitleInput["pageType"]>(initialPageType)
  const [language, setLanguage] = useState<SeoTitleInput["language"]>(initialLanguage || (isChinese ? "zh-CN" : "en-US"))
  const [currentTitle, setCurrentTitle] = useState("")
  const [brandName, setBrandName] = useState("")
  const [valueProposition, setValueProposition] = useState("")
  const [activeStage, setActiveStage] = useState<StreamStage | null>(null)
  const [streamedTitles, setStreamedTitles] = useState<SeoTitleCandidate[]>([])
  const [report, setReport] = useState<SeoTitleReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const formOptions = FORM_OPTIONS[isChinese ? "zh" : "en"]

  const copy = isChinese
    ? {
        eyebrow: "免费 SEO 标题分析",
        title: "免费 SEO 标题生成器",
        description: "基于你的关键词、受众和页面目的生成多角度标题；免费报告不会调用实时 SERP 或其他付费数据源。",
        keyword: "主关键词或页面主题",
        audience: "目标受众",
        region: "目标地区",
        pageType: "页面类型",
        language: "输出语言",
        currentTitle: "当前页面标题（可选）",
        brand: "品牌名（可选）",
        value: "主要价值主张（可选）",
        run: "生成免费 SEO 标题报告",
        running: "正在生成专业报告…",
        noLogin: "无需登录",
        process: "真实执行过程",
        intent: "搜索意图假设",
        ruleScore: "规则评分",
        modelJudgment: "模型判断",
        googlePreview: "Google 搜索结果预览",
        recommended: "推荐标题",
        copyTitle: "复制标题",
        abTests: "建议的 A/B 测试",
        risks: "使用边界与风险",
        locked: "注册并解锁实时 SERP 与竞品分析",
        lockedDescription: "以下能力仅在登录并满足订阅/积分或授权条件后执行。此处不展示任何伪造的实时数据。",
        source: "数据来源",
        access: "使用条件",
        cost: "预计消耗",
        credits: "积分",
        noCredits: "不消耗积分",
        notLive: "未使用实时 SERP 验证",
        verificationCta: "登录获取GSC 等真实数据源验证",
        report: "SEO 标题分析报告",
        reportIdle: "在这里生成你的标题报告",
        reportIdleDescription: "填写左侧参数后，系统会展示真实执行过程、推荐标题与可执行的测试方案。",
        candidates: "候选标题与诊断",
        diagnostics: "规则诊断",
        characterCount: "字符数",
        visibleWidth: "预计可见宽度",
        overlap: "候选重复度",
        keywordPlacement: "关键词位置",
        recommendationReason: "推荐理由",
        currentRun: "当前执行状态",
        completedTitles: "条候选标题已完成",
        timeout: "本次生成超过 47 秒仍未完成，请重试。",
        incomplete: "生成连接已结束，但未收到完整报告，请重试。",
      }
    : {
        eyebrow: "FREE SEO TITLE ANALYZER",
        title: "Get an actionable SEO title report",
        description: "Generate distinct title angles from your keyword, audience, and page goal. The free report does not call live SERP or other paid data sources.",
        keyword: "Primary keyword or page topic",
        audience: "Target audience",
        region: "Target region",
        pageType: "Page type",
        language: "Output language",
        currentTitle: "Current page title (optional)",
        brand: "Brand name (optional)",
        value: "Primary value proposition (optional)",
        run: "Generate free SEO title report",
        running: "Generating your professional report…",
        noLogin: "No sign-in required",
        process: "Live execution progress",
        intent: "Search intent hypothesis",
        ruleScore: "Rule score",
        modelJudgment: "Model judgment",
        googlePreview: "Google result preview",
        recommended: "Recommended title",
        copyTitle: "Copy title",
        abTests: "Suggested A/B tests",
        risks: "Boundaries and risks",
        locked: "Register to unlock live SERP and competitor analysis",
        lockedDescription: "These capabilities run only after sign-in plus the required subscription, credits, or property authorization. No fabricated live data is shown here.",
        source: "Data source",
        access: "Access",
        cost: "Estimated cost",
        credits: "credits",
        noCredits: "No credits",
        notLive: "Not validated with live SERP",
        verificationCta: "Sign in to validate with GSC and other real data sources",
        report: "SEO title analysis report",
        reportIdle: "Your title report will appear here",
        reportIdleDescription: "Complete the inputs on the left to see real execution progress, a recommended title, and an actionable test plan.",
        candidates: "Candidate titles and diagnostics",
        diagnostics: "Rule diagnostics",
        characterCount: "Characters",
        visibleWidth: "Estimated visible width",
        overlap: "Candidate overlap",
        keywordPlacement: "Keyword placement",
        recommendationReason: "Why this is recommended",
        currentRun: "Current run status",
        completedTitles: "title candidates completed",
        timeout: "This generation did not finish within 47 seconds. Please try again.",
        incomplete: "The generation stream ended before a complete report was received. Please try again.",
      }

  const recommended = useMemo(
    () => report?.candidates.find((candidate) => candidate.id === report.recommendedCandidateId) || report?.candidates[0] || null,
    [report],
  )

  const copyTitle = async (id: string, title: string) => {
    await navigator.clipboard.writeText(title)
    setCopiedId(id)
    window.setTimeout(() => setCopiedId(null), 1200)
  }

  const saveReportForHandoff = (nextReport: SeoTitleReport, input: SeoTitleInput) => {
    try {
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ schemaVersion: 1, input, report: nextReport, savedAt: new Date().toISOString() }))
    } catch {
      // A report is still usable when storage is unavailable or full.
    }
  }

  const runAnalysis = async () => {
    if (!keyword.trim() || !audience.trim() || !region.trim()) {
      setError(isChinese ? "请填写关键词、目标受众和目标地区。" : "Enter a keyword, target audience, and target region.")
      return
    }

    const input: SeoTitleInput = {
      keyword: keyword.trim(),
      audience: audience.trim(),
      region: region.trim(),
      pageType,
      language,
      currentTitle: currentTitle.trim() || undefined,
      brandName: brandName.trim() || undefined,
      valueProposition: valueProposition.trim() || undefined,
    }
    setError(null)
    setReport(null)
    setStreamedTitles([])
    setActiveStage("input_analyzing")
    setIsRunning(true)
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    let receivedReport = false

    try {
      const response = await fetch("/api/tools/seo-title-generator/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: controller.signal,
      })
      if (!response.ok || !response.body) throw new Error(await readApiError(response))

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const chunks = buffer.split("\n\n")
        buffer = chunks.pop() || ""
        for (const chunk of chunks) {
          const parsed = parseStreamChunk(chunk)
          if (!parsed) continue
          if (parsed.event === "stage" && typeof parsed.data.stage === "string") {
            setActiveStage(parsed.data.stage as StreamStage)
          }
          if (parsed.event === "title_completed" && parsed.data.title) {
            setStreamedTitles((current) => [...current, parsed.data.title as SeoTitleCandidate])
          }
          if (parsed.event === "report_completed" && parsed.data.report) {
            const nextReport = parsed.data.report as SeoTitleReport
            setReport(nextReport)
            saveReportForHandoff(nextReport, input)
            receivedReport = true
          }
          if (parsed.event === "error") {
            throw new Error(typeof parsed.data.message === "string" ? parsed.data.message : "Unable to analyze this SEO title.")
          }
        }
      }
      if (!receivedReport) throw new Error(copy.incomplete)
    } catch (nextError) {
      setError(nextError instanceof DOMException && nextError.name === "AbortError" ? copy.timeout : nextError instanceof Error ? nextError.message : "Unable to analyze this SEO title.")
    } finally {
      window.clearTimeout(timeoutId)
      setIsRunning(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-border/70 bg-card/90 text-foreground shadow-[0_24px_80px_-48px_rgba(0,0,0,0.55)]">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-2 text-primary"><Search className="h-5 w-5" /><span className="text-sm font-medium">{copy.eyebrow}</span></div>
          <CardTitle className="text-2xl">{copy.title}</CardTitle>
          <CardDescription className="max-w-3xl text-muted-foreground">{copy.description}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-8 border-t border-border/70 pt-6 lg:h-[660px] lg:grid-cols-[minmax(300px,0.82fr)_minmax(0,1.18fr)]">
          <datalist id="seo-title-regions">{formOptions.regions.map((option) => <option key={option} value={option} />)}</datalist>
          <datalist id="seo-title-audiences">{formOptions.audiences.map((option) => <option key={option} value={option} />)}</datalist>
          <datalist id="seo-title-value-propositions">{formOptions.valuePropositions.map((option) => <option key={option} value={option} />)}</datalist>
          <section className="space-y-5 lg:h-full lg:overflow-y-auto lg:pr-2">
            <div className="grid gap-5">
              <div className="space-y-2"><label htmlFor="seo-title-keyword" className="text-sm font-medium">{copy.keyword}</label><Input id="seo-title-keyword" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder={isChinese ? "例如：AI 营销自动化" : "For example: AI marketing automation"} /></div>
              <div className="space-y-2"><label htmlFor="seo-title-audience" className="text-sm font-medium">{copy.audience}</label><Input id="seo-title-audience" list="seo-title-audiences" value={audience} onChange={(event) => setAudience(event.target.value)} /></div>
              <div className="space-y-2"><label htmlFor="seo-title-region" className="text-sm font-medium">{copy.region}</label><Input id="seo-title-region" list="seo-title-regions" value={region} onChange={(event) => setRegion(event.target.value)} /></div>
              <div className="space-y-2"><label htmlFor="seo-title-current" className="text-sm font-medium">{copy.currentTitle}</label><Input id="seo-title-current" value={currentTitle} onChange={(event) => setCurrentTitle(event.target.value)} /></div>
              <div className="space-y-2"><label htmlFor="seo-title-brand" className="text-sm font-medium">{copy.brand}</label><Input id="seo-title-brand" value={brandName} onChange={(event) => setBrandName(event.target.value)} /></div>
              <div className="space-y-2"><label htmlFor="seo-title-value" className="text-sm font-medium">{copy.value}</label><Input id="seo-title-value" list="seo-title-value-propositions" value={valueProposition} onChange={(event) => setValueProposition(event.target.value)} /></div>
              <div className="space-y-2"><label htmlFor="seo-title-page-type" className="text-sm font-medium">{copy.pageType}</label><Select value={pageType} onValueChange={(value) => setPageType(value as SeoTitleInput["pageType"])}><SelectTrigger id="seo-title-page-type" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{formOptions.pageTypes.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><label htmlFor="seo-title-language" className="text-sm font-medium">{copy.language}</label><Select value={language} onValueChange={(value) => setLanguage(value as SeoTitleInput["language"])}><SelectTrigger id="seo-title-language" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{formOptions.languages.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="space-y-3 border-t border-border/70 pt-5"><p className="text-sm text-muted-foreground">{copy.verificationCta}</p><Button size="lg" className="w-full" onClick={() => void runAnalysis()} disabled={isRunning}>{isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{isRunning ? copy.running : copy.run}</Button></div>
            {error ? <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</div> : null}
          </section>

          <section className="min-w-0 border-t border-border/70 pt-6 lg:h-full lg:overflow-y-auto lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0 lg:pr-2">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-medium text-primary">{copy.report}</p><h2 className="mt-1 text-xl font-semibold tracking-tight">{report ? report.keyword : copy.reportIdle}</h2></div>{report ? <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary">{copy.notLive}</Badge> : null}</div>

            {!isRunning && !report ? <div className="mt-6 rounded-xl border border-dashed border-border/80 bg-muted/25 p-6 text-sm leading-6 text-muted-foreground">{copy.reportIdleDescription}</div> : null}

            {isRunning || streamedTitles.length > 0 ? <div className="mt-6 rounded-xl border border-border/70 bg-background/60 p-5"><div className="flex items-center justify-between gap-3"><p className="font-medium">{copy.process}</p>{streamedTitles.length > 0 ? <span className="text-sm text-muted-foreground">{streamedTitles.length} {copy.completedTitles}</span> : null}</div><div className="mt-4 space-y-3">{STREAM_STAGES.map((stage) => { const stageIndex = STREAM_STAGES.indexOf(stage); const activeIndex = STREAM_STAGES.indexOf(activeStage || "input_analyzing"); return <div key={stage} className="flex items-center gap-3 text-sm"><span className={cn("h-2.5 w-2.5 rounded-full", activeStage === stage ? "bg-primary animate-pulse" : stageIndex < activeIndex ? "bg-primary" : "bg-muted")}/><span className={stageIndex <= activeIndex ? "text-foreground" : "text-muted-foreground"}>{stageLabel(stage, isChinese)}</span></div> })}</div></div> : null}

            {report && recommended ? <div className="mt-6 space-y-6">
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-5"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-medium text-primary">{copy.recommended}</p><h3 className="mt-2 text-xl font-semibold leading-8">{recommended.title}</h3></div><Button variant="ghost" size="icon" aria-label={copy.copyTitle} onClick={() => void copyTitle(recommended.id, recommended.title)}>{copiedId === recommended.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</Button></div><p className="mt-3 text-sm leading-6 text-muted-foreground"><span className="font-medium text-foreground">{copy.recommendationReason}: </span>{recommended.rationale}</p><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4"><div className="rounded-lg border border-border/70 bg-background/80 p-3"><p className="text-xs text-muted-foreground">{copy.ruleScore}</p><p className="mt-1 text-lg font-semibold">{recommended.ruleScore.total}/100</p></div><div className="rounded-lg border border-border/70 bg-background/80 p-3"><p className="text-xs text-muted-foreground">{copy.keywordPlacement}</p><p className="mt-1 text-sm font-medium">{keywordPositionLabel(recommended.ruleScore.keywordPosition, isChinese)}</p></div><div className="rounded-lg border border-border/70 bg-background/80 p-3"><p className="text-xs text-muted-foreground">{copy.characterCount}</p><p className="mt-1 text-lg font-semibold">{recommended.ruleScore.characterCount}</p></div><div className="rounded-lg border border-border/70 bg-background/80 p-3"><p className="text-xs text-muted-foreground">{copy.visibleWidth}</p><p className="mt-1 text-lg font-semibold">{recommended.ruleScore.estimatedPixelWidth}px</p></div></div></div>

              <div className="grid gap-4 sm:grid-cols-2"><div className="rounded-xl border border-border/70 p-4"><p className="text-sm font-medium">{copy.intent}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{report.intentHypothesis}</p></div><div className="rounded-xl border border-border/70 p-4"><p className="text-sm font-medium">{copy.diagnostics}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{recommended.ruleScore.notes.join(" ")}</p><p className="mt-2 text-sm text-muted-foreground">{copy.overlap}: {Math.round(recommended.ruleScore.duplicateRatio * 100)}%</p></div></div>

              <div><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{copy.candidates}</h3><span className="text-sm text-muted-foreground">{report.candidates.length}</span></div><div className="mt-3 space-y-3">{report.candidates.map((candidate, index) => <article key={candidate.id} className={cn("rounded-xl border p-4", candidate.id === recommended.id ? "border-primary/35 bg-primary/[0.03]" : "border-border/70")}><div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="border-border/80 text-muted-foreground">{index + 1}</Badge><Badge variant="outline" className="border-primary/25 text-primary">{candidate.angle}</Badge><span className="text-sm font-semibold text-primary">{candidate.ruleScore.total}/100</span></div><p className="mt-3 font-medium leading-6">{candidate.title}</p></div><Button variant="ghost" size="icon" aria-label={copy.copyTitle} onClick={() => void copyTitle(candidate.id, candidate.title)}>{copiedId === candidate.id ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</Button></div><p className="mt-2 text-sm leading-6 text-muted-foreground">{candidate.rationale}</p><p className="mt-2 text-sm text-muted-foreground"><span className="font-medium text-foreground">{copy.modelJudgment}: </span>{candidate.modelAssessment.explanation}</p></article>)}</div></div>

              <div className="rounded-xl border border-border/70 bg-background/60 p-5"><p className="font-medium">{copy.googlePreview}</p><p className="mt-1 text-sm text-muted-foreground">{copy.recommended}</p><div className="mt-4 rounded-lg border border-border/70 bg-background p-4"><div className="text-sm text-emerald-600">www.aimarketingsite.com › your-page</div><div className="mt-1 text-lg text-blue-600">{recommended.title}</div><p className="mt-2 text-sm text-muted-foreground">{report.keyword} · {report.audience} · {report.region}</p></div></div>

              <div className="grid gap-4 sm:grid-cols-2"><div className="rounded-xl border border-border/70 p-4"><p className="font-medium">{copy.abTests}</p><div className="mt-3 space-y-3">{report.abTests.map((test) => <div key={test.name} className="text-sm"><p className="font-medium">{test.name}</p><p className="mt-1 text-muted-foreground">A: {test.variantA}</p><p className="text-muted-foreground">B: {test.variantB}</p><p className="mt-2 leading-6 text-muted-foreground">{test.hypothesis}</p></div>)}</div></div><div className="rounded-xl border border-border/70 p-4"><p className="font-medium">{copy.risks}</p><ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">{report.risks.map((risk) => <li key={risk}>• {risk}</li>)}</ul></div></div>
            </div> : null}
          </section>
        </CardContent>
      </Card>

      {report ? <Card className="border-primary/25 bg-card/90"><CardHeader><div className="flex items-center gap-2 text-primary"><LockKeyhole className="h-5 w-5" /><CardTitle className="text-xl">{copy.locked}</CardTitle></div><CardDescription>{copy.lockedDescription}</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-3">{paidSeoCapabilities.map((capability) => <div key={capability.id} className="rounded-xl border border-border/70 bg-background/70 p-4"><p className="font-medium">{capability.title}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{capability.description}</p><dl className="mt-4 space-y-1 text-xs text-muted-foreground"><div><dt className="inline">{copy.source}: </dt><dd className="inline">{capability.source}</dd></div><div><dt className="inline">{copy.access}: </dt><dd className="inline">{capability.requirement}</dd></div><div><dt className="inline">{copy.cost}: </dt><dd className="inline">{capability.estimatedCredits ? `${capability.estimatedCredits} ${copy.credits}` : copy.noCredits}</dd></div></dl></div>)}</CardContent><CardContent className="pt-0"><Button asChild size="lg"><a href={upgradeHref}>{copy.locked}</a></Button></CardContent></Card> : null}
    </div>
  )
}
