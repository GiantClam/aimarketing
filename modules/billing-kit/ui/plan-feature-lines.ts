export type BillingPlanFeatureInput = {
  code: string
  name: string
  monthlyCredits: number
  trialDays: number | null
  trialCredits: number
  features: Record<string, unknown>
}

export type BillingFeatureMessages = {
  freeTrialLine: string
  sharedCreditsLine: string
  unlimitedMembersLine: string
  imageQualityLine: string
  maskEditLine: string
  priorityQueue: string
  standardQueue: string
  imageAllowanceLine: string
  videoAllowanceLine: string
  modelAccessLine: string
  agentAccessLine: string
  workflowAccessLine: string
  workspaceGoverned: string
}

const IMAGE_CREDITS_BY_QUALITY = {
  low: 3,
  medium: 27,
  high: 106,
} as const

const VIDEO_CREDITS_PER_SECOND = 80
const IMAGE_MODEL_CATALOG = "Qwen Image 3.0 Pro、Qwen Image 2.7、Nanobanana2、GPT Image 2"
const VIDEO_MODEL_CATALOG = "HappyHorse 1.1、MiniMax Hailuo 2.3、Seedance"

export function formatCredits(credits: number, locale: string) {
  return new Intl.NumberFormat(locale).format(credits)
}

export function formatTemplate(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""))
}

function formatEstimatedImageAllowance(plan: BillingPlanFeatureInput, locale: string, credits: number) {
  const qualityLabels: Record<keyof typeof IMAGE_CREDITS_BY_QUALITY, string> = locale.toLowerCase().startsWith("zh")
    ? { low: "低质量", medium: "中质量", high: "高质量" }
    : { low: "low", medium: "medium", high: "high" }
  const quality = Array.isArray(plan.features?.imageQuality)
    ? plan.features.imageQuality.filter((item): item is keyof typeof IMAGE_CREDITS_BY_QUALITY => item in IMAGE_CREDITS_BY_QUALITY)
    : []
  const imageUnit = locale.toLowerCase().startsWith("zh") ? "张" : "images"
  return quality
    .map((item) => `${qualityLabels[item]} ${formatCredits(Math.floor(credits / IMAGE_CREDITS_BY_QUALITY[item]), locale)} ${imageUnit}`)
    .join(" / ") || "—"
}

function permissionLines(
  plan: BillingPlanFeatureInput,
  billing: BillingFeatureMessages,
  locale: string,
  credits: number,
  allowanceLines?: { image: string; video: string },
) {
  const qualityLabels: Record<string, string> = locale.toLowerCase().startsWith("zh")
    ? { low: "低质量", medium: "中质量", high: "高质量" }
    : { low: "low", medium: "medium", high: "high" }
  const quality = Array.isArray(plan.features?.imageQuality)
    ? plan.features.imageQuality.map((item) => qualityLabels[String(item)] || String(item)).join(" / ")
    : "standard"
  const imageModels = `${IMAGE_MODEL_CATALOG}（${quality}）`
  const videoModels = plan.features?.videoGeneration
    ? `${VIDEO_MODEL_CATALOG}（${billing.workspaceGoverned}）`
    : "—"

  return [
    formatTemplate(allowanceLines?.image || billing.imageAllowanceLine, {
      details: formatEstimatedImageAllowance(plan, locale, credits),
    }),
    formatTemplate(allowanceLines?.video || billing.videoAllowanceLine, {
      details: `${formatCredits(Math.floor(credits / VIDEO_CREDITS_PER_SECOND), locale)}s`,
    }),
    formatTemplate(billing.modelAccessLine, { details: `${imageModels}；视频：${videoModels}` }),
    billing.agentAccessLine,
    billing.workflowAccessLine,
  ]
}

export function buildPlanFeatureLines(
  plan: BillingPlanFeatureInput,
  billing: BillingFeatureMessages,
  locale: string,
  options?: { credits?: number; creditsLine?: string; allowanceLines?: { image: string; video: string } },
) {
  const credits = options?.credits ?? (plan.code === "free" ? plan.trialCredits : plan.monthlyCredits)
  const quality = Array.isArray(plan.features?.imageQuality) ? plan.features.imageQuality.join("/") : "standard"
  const firstLine = options?.creditsLine
    ? formatTemplate(options.creditsLine, { credits: formatCredits(credits, locale) })
    : plan.code === "free"
      ? formatTemplate(billing.freeTrialLine, { credits: formatCredits(credits, locale), days: plan.trialDays || 0 })
      : formatTemplate(billing.sharedCreditsLine, { credits: formatCredits(credits, locale) })

  return [
    firstLine,
    billing.unlimitedMembersLine,
    formatTemplate(billing.imageQualityLine, { quality }),
    formatTemplate(billing.maskEditLine, { level: String(plan.features?.maskEdit || "standard") }),
    plan.features?.priorityQueue ? billing.priorityQueue : billing.standardQueue,
    ...permissionLines(plan, billing, locale, credits, options?.allowanceLines),
  ]
}
