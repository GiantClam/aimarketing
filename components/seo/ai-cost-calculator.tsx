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

function currency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

export function AiCostCalculator() {
  const [input, setInput] = useState<AiCostInput>(defaultAiCostInput)
  const [hasInteracted, setHasInteracted] = useState(false)
  const estimate = useMemo(() => calculateAiCostEstimate(input), [input])
  const hasTrackedStartRef = useRef(false)
  const hasTrackedEstimateRef = useRef(false)

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
      recommendedPlan: estimate.recommendedPlan,
    })
  }, [estimate.monthlyHigh, estimate.monthlyLow, estimate.recommendedPlan, hasInteracted])

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
      <section className="public-panel rounded-[12px] p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-[6px] border border-primary/30 bg-primary">
            <Calculator className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <div className="public-kicker text-muted-foreground">Cost Input</div>
            <h2 className="mt-1 font-display text-2xl font-extrabold uppercase tracking-[0.02em] text-foreground">
              Estimate your current AI stack
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">Enter the number of active users for each tool type.</p>
          </div>
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="teamSize">Team size</Label>
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
              <Label htmlFor={tool.key}>{tool.label}</Label>
              <Input
                id={tool.key}
                type="number"
                min={0}
                value={input[tool.key]}
                onChange={(event) => updateNumber(tool.key, event.target.value)}
                className="h-12 rounded-[6px] border-border bg-background"
              />
              <p className="text-xs text-muted-foreground">
                Estimate: {currency(tool.monthlyLow)}-{currency(tool.monthlyHigh)} per user / month
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
            <span className="block text-sm font-semibold text-foreground">We need BYOK or heavier model usage</span>
            <span className="mt-1 block text-sm leading-6 text-muted-foreground">
              Select this when your team wants to connect its own API keys or expects high-frequency model usage.
            </span>
          </span>
        </label>
      </section>

      <aside className="rounded-[12px] border border-border bg-accent p-6 text-accent-foreground sm:p-8">
        <p className="public-kicker text-accent-foreground/70">Estimated cost</p>
        <div className="mt-4 space-y-5">
          <div>
            <p className="text-sm text-accent-foreground/70">Monthly AI software cost</p>
            <p className="mt-1 font-display text-5xl font-extrabold uppercase tracking-[-0.04em]">
              {currency(estimate.monthlyLow)}-{currency(estimate.monthlyHigh)}
            </p>
          </div>
          <div>
            <p className="text-sm text-accent-foreground/70">Annual AI software cost</p>
            <p className="mt-1 font-display text-4xl font-extrabold uppercase tracking-[-0.04em]">
              {currency(estimate.annualLow)}-{currency(estimate.annualHigh)}
            </p>
          </div>
          <div className="rounded-[8px] border border-white/12 bg-white/10 p-4">
            <p className="text-sm text-accent-foreground/70">Potential monthly savings range</p>
            <p className="mt-1 font-display text-4xl font-extrabold uppercase tracking-[-0.04em]">
              {currency(estimate.savingsLow)}-{currency(estimate.savingsHigh)}
            </p>
          </div>
          <div className="rounded-[8px] border border-white/12 bg-white/10 p-4">
            <p className="text-sm text-accent-foreground/70">Recommended starting point</p>
            <p className="mt-1 font-display text-xl font-extrabold uppercase tracking-[0.02em]">{estimate.recommendedPlan}</p>
          </div>
        </div>

        <div className="mt-6 space-y-3 text-sm leading-6 text-accent-foreground/80">
          {[
            "One shared AI workspace with multiple models.",
            "Marketing agents for strategy, copy, images, websites, and video scripts.",
            "Team permissions, shared credits, and company context.",
          ].map((item) => (
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
                recommendedPlan: estimate.recommendedPlan,
              }}
            >
              Start your team workspace
            </TrackedCtaLink>
          </Button>
          <Button className="h-12 rounded-[4px] border border-accent-foreground/28 bg-transparent font-display text-xs font-bold uppercase tracking-[0.08em] text-accent-foreground hover:bg-accent-foreground/10" asChild>
            <TrackedCtaLink
              href="/alternatives/chatgpt-team-alternative"
              eventName={SEO_EVENT.calculatorCtaClick}
              eventData={{
                cta: "secondary",
                destination: "/alternatives/chatgpt-team-alternative",
                recommendedPlan: estimate.recommendedPlan,
              }}
            >
              Compare with ChatGPT Team
            </TrackedCtaLink>
          </Button>
        </div>

        <p className="mt-6 text-xs leading-5 text-accent-foreground/60">
          Estimates are illustrative and should be checked against live vendor pricing. AI Marketing does not promise
          unlimited GPT, Claude, Gemini, or image generation usage.
        </p>
      </aside>
    </div>
  )
}
