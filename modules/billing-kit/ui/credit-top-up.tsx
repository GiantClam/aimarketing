"use client"

import { useEffect, useState } from "react"
import { Check, LoaderCircle, WalletCards } from "lucide-react"
import { useSearchParams } from "next/navigation"

import { useI18n } from "@/modules/billing-kit/host/locale"
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@/modules/billing-kit/host/ui"
import { buildPlanFeatureLines, type BillingPlanFeatureInput } from "@/modules/billing-kit/ui/plan-feature-lines"

const IMAGE_CREDITS_BY_QUALITY = {
  low: 3,
  medium: 27,
  high: 106,
} as const

const VIDEO_CREDITS_PER_SECOND = 80

type CreditProduct = {
  code: string
  name: string
  creditAmount: number
  amountMinor: number
  currency: string
  expiresAt: null
  availableProviders: string[]
  stripeAmountMinor: number | null
  stripeCurrency: string | null
}

type CreditTopUpProps = {
  onPurchased?: () => void
}

function formatCredits(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(value)
}

function formatMoney(amountMinor: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(amountMinor / 100)
}

export function CreditTopUp({ onPurchased }: CreditTopUpProps) {
  const { locale, messages } = useI18n()
  const billing = messages.billing
  const searchParams = useSearchParams()
  const [products, setProducts] = useState<CreditProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [payingCode, setPayingCode] = useState("")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [polledOrderNo, setPolledOrderNo] = useState("")
  const [currentPlan, setCurrentPlan] = useState<BillingPlanFeatureInput | null>(null)

  const isChinese = locale.startsWith("zh")
  const text = isChinese
    ? {
        oneTime: "一次性",
        permanent: "永久有效",
        description: "无需订阅会员，积分到账后永久有效。",
        buy: "购买积分包",
        unavailable: "暂不可用",
        loading: "加载积分包…",
        processing: "支付已提交，正在确认积分到账…",
        success: "支付成功，积分已到账。",
        failed: "支付未完成，请重新选择积分包。",
        loadFailed: "积分包加载失败",
        orderFailed: "创建支付订单失败",
      }
    : {
        oneTime: "One-time",
        permanent: "Never expires",
        description: "No subscription required. Credits never expire after delivery.",
        buy: "Buy credit pack",
        unavailable: "Unavailable",
        loading: "Loading credit packs…",
        processing: "Payment submitted. Confirming your credit balance…",
        success: "Payment succeeded. Credits have been added.",
        failed: "Payment was not completed. Please try again.",
        loadFailed: "Failed to load credit packs",
        orderFailed: "Failed to create payment order",
      }

  useEffect(() => {
    let cancelled = false
    async function loadProducts() {
      setLoading(true)
      setError("")
      try {
        const response = await fetch("/api/billing/credit-products?currency=CNY", { cache: "no-store" })
        const json = await response.json().catch(() => null)
        if (!response.ok) throw new Error(json?.error || text.loadFailed)
          if (!cancelled) {
            const availableProducts = Array.isArray(json?.products) ? json.products : []
            setProducts(availableProducts)
          }
        const [plansResponse, subscriptionResponse] = await Promise.all([
          fetch("/api/billing/plans", { cache: "no-store" }),
          fetch("/api/billing/subscription", { cache: "no-store" }),
        ])
        const plansJson = await plansResponse.json().catch(() => null)
        const subscriptionJson = await subscriptionResponse.json().catch(() => null)
        if (!cancelled && plansResponse.ok && subscriptionResponse.ok) {
          const planCode = subscriptionJson?.subscription?.effective_plan_code || subscriptionJson?.subscription?.plan_code || "free"
          const matchedPlan = Array.isArray(plansJson?.plans)
            ? plansJson.plans.find((plan: BillingPlanFeatureInput) => plan.code === planCode)
            : null
          setCurrentPlan(matchedPlan || null)
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : text.loadFailed)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void loadProducts()
    return () => {
      cancelled = true
    }
  }, [text.loadFailed])

  const returnOrderNo =
    searchParams.get("zpay") === "return" || searchParams.get("stripe") === "credit_approved"
      ? searchParams.get("orderNo") || ""
      : ""

  useEffect(() => {
    if (!returnOrderNo || returnOrderNo === polledOrderNo) return
    setPolledOrderNo(returnOrderNo)
    let cancelled = false
    let attempts = 0
    let timer: number | undefined

    async function poll() {
      try {
        const response = await fetch(`/api/billing/payment-orders/${encodeURIComponent(returnOrderNo)}`, { cache: "no-store" })
        const json = await response.json().catch(() => null)
        if (!response.ok) throw new Error(json?.error || text.failed)
        if (cancelled) return
        if (json?.status === "paid") {
          setNotice(text.success)
          onPurchased?.()
          return
        }
        if (["failed", "expired", "refunded"].includes(String(json?.status))) {
          setError(text.failed)
          return
        }
        attempts += 1
        if (attempts < 12) timer = window.setTimeout(() => void poll(), 1500)
        else setNotice(text.processing)
      } catch (pollError) {
        if (!cancelled) setError(pollError instanceof Error ? pollError.message : text.failed)
      }
    }
    setError("")
    setNotice(text.processing)
    void poll()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [onPurchased, polledOrderNo, returnOrderNo, text.failed, text.processing, text.success])

  async function startPayment(product: CreditProduct) {
    const zpayAvailable = product.availableProviders.includes("zpay")
    const stripeAvailable = product.availableProviders.includes("stripe")
    const provider = isChinese && zpayAvailable ? "zpay" : stripeAvailable ? "stripe" : zpayAvailable ? "zpay" : ""
    if (payingCode || !provider) return
    setPayingCode(product.code)
    setError("")
    setNotice("")
    try {
      const response = await fetch("/api/billing/credit-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productCode: product.code,
          provider,
          paymentMethod: provider === "zpay" ? "alipay" : "card",
          idempotencyKey: crypto.randomUUID(),
        }),
      })
      const json = await response.json().catch(() => null)
      if (!response.ok || typeof json?.paymentUrl !== "string") throw new Error(json?.error || text.orderFailed)
      window.location.assign(json.paymentUrl)
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : text.orderFailed)
      setPayingCode("")
    }
  }

  return (
    <>
      {error ? <div className="col-span-full rounded-[1.5rem] bg-destructive/10 p-4 text-sm text-destructive">{error}</div> : null}
      {notice ? <div className="col-span-full rounded-[1.5rem] bg-teal-50 p-4 text-sm text-teal-950">{notice}</div> : null}
      {loading ? <div className="col-span-full rounded-[1.5rem] border bg-white/80 p-6 text-sm text-muted-foreground">{text.loading}</div> : null}
      {!loading && products.length === 0 ? (
        <div className="col-span-full rounded-[1.5rem] border bg-white/80 p-6 text-sm text-muted-foreground">{text.loadFailed}</div>
      ) : null}
      {products.map((product) => {
        const zpayAvailable = product.availableProviders.includes("zpay")
        const stripeAvailable = product.availableProviders.includes("stripe")
        const preferredProvider = isChinese && zpayAvailable ? "zpay" : stripeAvailable ? "stripe" : zpayAvailable ? "zpay" : ""
        const usesStripePrice = preferredProvider === "stripe" && product.stripeAmountMinor != null && product.stripeCurrency
        const displayAmountMinor = usesStripePrice ? product.stripeAmountMinor : product.amountMinor
        const displayCurrency = usesStripePrice ? product.stripeCurrency : product.currency
        const imageAllowance = [
          [isChinese ? "低质量" : "low", Math.floor(product.creditAmount / IMAGE_CREDITS_BY_QUALITY.low)],
          [isChinese ? "中质量" : "medium", Math.floor(product.creditAmount / IMAGE_CREDITS_BY_QUALITY.medium)],
          [isChinese ? "高质量" : "high", Math.floor(product.creditAmount / IMAGE_CREDITS_BY_QUALITY.high)],
        ]
          .map(([label, count]) => `${label} ${formatCredits(Number(count), locale)} ${isChinese ? "张" : "images"}`)
          .join(" / ")
        const videoAllowance = `${formatCredits(Math.floor(product.creditAmount / VIDEO_CREDITS_PER_SECOND), locale)}s`
        const featureLines = currentPlan
          ? [
              ...buildPlanFeatureLines(currentPlan, billing, locale, {
                credits: product.creditAmount,
                creditsLine: billing.creditPackCreditsLine,
                allowanceLines: {
                  image: billing.creditPackImageAllowanceLine,
                  video: billing.creditPackVideoAllowanceLine,
                },
              }),
              billing.creditPackNoSubscriptionLine,
            ]
          : [
              billing.creditPackCreditsLine.replace("{credits}", formatCredits(product.creditAmount, locale)),
              billing.creditPackImageAllowanceLine.replace("{details}", imageAllowance),
              billing.creditPackVideoAllowanceLine.replace("{details}", videoAllowance),
              billing.creditPackModelAccessLine,
              billing.creditPackAgentAccessLine,
              billing.creditPackWorkflowAccessLine,
              billing.creditPackNoSubscriptionLine,
            ]
        return (
          <Card key={product.code} className="relative overflow-hidden rounded-[2rem] border-2 border-slate-200 bg-white/90 shadow-sm">
            <div className="absolute right-4 top-4">
              <Badge className="rounded-full bg-teal-600 text-white">{text.oneTime}</Badge>
            </div>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <WalletCards className="h-5 w-5" />
                {product.name}
              </CardTitle>
              {currentPlan ? <p className="text-sm text-muted-foreground">{billing.creditPackAlignedPlanLine.replace("{plan}", currentPlan.name)}</p> : null}
              <div className="mt-5">
                <span className="text-5xl font-semibold tracking-tight">
                  {formatMoney(Number(displayAmountMinor), String(displayCurrency), locale)}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="rounded-full">{text.permanent}</Badge>
                <Badge variant="outline" className="rounded-full">{formatCredits(product.creditAmount, locale)} credits</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{text.description}</p>
              <div className="space-y-3">
                {featureLines.map((line) => (
                  <div key={line} className="flex items-start gap-3 text-sm">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <span>{line}</span>
                  </div>
                ))}
              </div>
              <Button
                className="w-full rounded-full"
                onClick={() => void startPayment(product)}
                disabled={!preferredProvider || Boolean(payingCode)}
              >
                {payingCode === product.code ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {preferredProvider ? text.buy : text.unavailable}
              </Button>
            </CardContent>
          </Card>
        )
      })}
    </>
  )
}
