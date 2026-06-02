"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Calculator, CheckCircle2 } from "lucide-react"

import { TrackedCtaLink } from "@/components/seo/tracked-cta-link"
import {
  aiToolPrices,
  calculateAiCostEstimate,
  defaultAiCostInput,
  type AiCostInput,
  type AiToolKey,
} from "@/lib/seo/ai-cost-calculator"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { trackAnalyticsEvent } from "@/lib/seo/client-analytics"
import { SEO_EVENT } from "@/lib/seo/analytics"
import type { AppLocale } from "@/lib/i18n/config"
import { localizePublicPath } from "@/lib/i18n/routing"
import {
  getAiCostPageCopy,
  getAiToolLabel,
  getRecommendedPlanLabel,
} from "@/lib/seo/i18n"

function currency(value: number, locale: AppLocale) {
  return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

export function AiCostCalculator({ locale }: { locale: AppLocale }) {
  const [input, setInput] = useState<AiCostInput>(defaultAiCostInput)
  const [hasInteracted, setHasInteracted] = useState(false)
  const estimate = useMemo(() => calculateAiCostEstimate(input), [input])
  const hasTrackedStartRef = useRef(false)
  const hasTrackedEstimateRef = useRef(false)
  const copy = getAiCostPageCopy(locale)
  const recommendedPlanLabel = getRecommendedPlanLabel(locale, estimate.recommendedPlanKey)

  const updateNumber = (key: AiToolKey | "teamSize", value: string) => {
    const parsed = Number.parseInt(value, 10)
    setHasInteracted(true)
    setInput((current) => ({
      ...current,
      [key]: Number.isFinite(parsed) ? Math.max(0, parsed) : 0,
    }))
  }

  useEffect(() => {
    if (!hasInteracted || hasTrackedStartRef.current) return
    hasTrackedStartRef.current = true
    trackAnalyticsEvent(SEO_EVENT.calculatorStarted, {
      teamSize: input.teamSize,
      needsByok: input.needsByok,
    })
  }, [hasInteracted, input.needsByok, input.teamSize])

  useEffect(() => {
    if (!hasInteracted || hasTrackedEstimateRef.current) return
    hasTrackedEstimateRef.current = true
    trackAnalyticsEvent(SEO_EVENT.calculatorEstimateReady, {
      monthlyLow: estimate.monthlyLow,
      monthlyHigh: estimate.monthlyHigh,
      recommendedPlan: recommendedPlanLabel,
    })
  }, [estimate.monthlyHigh, estimate.monthlyLow, hasInteracted, recommendedPlanLabel])

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
      <section className="public-panel rounded-[12px] p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-[6px] border border-primary/30 bg-primary">
            <Calculator className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <div className="public-kicker text-muted-foreground">{copy.calculatorInputKicker}</div>
            <h2 className="mt-1 font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
              {copy.calculatorInputTitle}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{copy.calculatorInputDescription}</p>
          </div>
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="teamSize">{copy.teamSize}</Label>
            <Input
              id="teamSize"
              type="number"
              min={1}
              value={input.teamSize}
              onChange={(event) => updateNumber("teamSize", event.target.value)}
              className="h-12 rounded-[6px] border-border bg-background"
            />
          </div>

          {aiToolPrices.map((tool) => (
            <div key={tool.key} className="space-y-2">
              <Label htmlFor={tool.key}>{getAiToolLabel(locale, tool.key)}</Label>
              <Input
                id={tool.key}
                type="number"
                min={0}
                value={input[tool.key]}
                onChange={(event) => updateNumber(tool.key, event.target.value)}
                className="h-12 rounded-[6px] border-border bg-background"
              />
              <p className="text-xs text-muted-foreground">
                {copy.estimatePerUser(currency(tool.monthlyLow, locale), currency(tool.monthlyHigh, locale))}
              </p>
            </div>
          ))}
        </div>

        <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-[8px] border border-border bg-background p-4">
          <input
            type="checkbox"
            checked={input.needsByok}
            onChange={(event) => {
              setHasInteracted(true)
              setInput((current) => ({ ...current, needsByok: event.target.checked }))
            }}
            className="mt-1 h-4 w-4"
          />
          <span>
            <span className="block text-sm font-semibold text-foreground">{copy.byokTitle}</span>
            <span className="mt-1 block text-sm leading-6 text-muted-foreground">
              {copy.byokDescription}
            </span>
          </span>
        </label>
      </section>

      <aside className="rounded-[12px] border border-border bg-accent p-6 text-accent-foreground sm:p-8">
        <p className="public-kicker text-accent-foreground/70">{copy.estimatedCost}</p>
        <div className="mt-4 space-y-5">
          <div>
            <p className="text-sm text-accent-foreground/70">{copy.monthlyCost}</p>
            <p className="mt-1 font-display text-5xl font-extrabold uppercase tracking-[-0.04em]">
              {currency(estimate.monthlyLow, locale)}-{currency(estimate.monthlyHigh, locale)}
            </p>
          </div>
          <div>
            <p className="text-sm text-accent-foreground/70">{copy.annualCost}</p>
            <p className="mt-1 font-display text-4xl font-extrabold uppercase tracking-[-0.04em]">
              {currency(estimate.annualLow, locale)}-{currency(estimate.annualHigh, locale)}
            </p>
          </div>
          <div className="rounded-[8px] border border-white/12 bg-white/10 p-4">
            <p className="text-sm text-accent-foreground/70">{copy.savingsRange}</p>
            <p className="mt-1 font-display text-4xl font-extrabold uppercase tracking-[-0.04em]">
              {currency(estimate.savingsLow, locale)}-{currency(estimate.savingsHigh, locale)}
            </p>
          </div>
          <div className="rounded-[8px] border border-white/12 bg-white/10 p-4">
            <p className="text-sm text-accent-foreground/70">{copy.recommendedStartingPoint}</p>
            <p className="mt-1 font-display text-xl font-extrabold uppercase tracking-[0.02em]">{recommendedPlanLabel}</p>
          </div>
        </div>

        <div className="mt-6 space-y-3 text-sm leading-6 text-accent-foreground/80">
          {copy.benefits.map((item) => (
            <div key={item} className="flex gap-2">
              <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-primary" />
              <span>{item}</span>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-col gap-3">
          <Button className="public-button-primary h-12" asChild>
            <TrackedCtaLink
              href="/register"
              eventName={SEO_EVENT.calculatorCtaClick}
              eventData={{
                cta: "primary",
                destination: "/register",
                recommendedPlan: recommendedPlanLabel,
              }}
            >
              {copy.primaryCta}
            </TrackedCtaLink>
          </Button>
          <Button className="h-12 rounded-[4px] border border-accent-foreground/28 bg-transparent font-display text-xs font-bold uppercase tracking-[0.08em] text-accent-foreground hover:bg-accent-foreground/10" asChild>
            <TrackedCtaLink
              href={localizePublicPath("/alternatives/chatgpt-team-alternative", locale)}
              eventName={SEO_EVENT.calculatorCtaClick}
              eventData={{
                cta: "secondary",
                destination: "/alternatives/chatgpt-team-alternative",
                recommendedPlan: recommendedPlanLabel,
              }}
            >
              {copy.secondaryCta}
            </TrackedCtaLink>
          </Button>
        </div>

        <p className="mt-6 text-xs leading-5 text-accent-foreground/60">
          {copy.disclaimer}
        </p>
      </aside>
    </div>
  )
}
