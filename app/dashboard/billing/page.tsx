"use client"

import { useState } from "react"
import { ReceiptText } from "lucide-react"

import { CreditBalance } from "@/components/billing/credit-balance"
import { PricingCards } from "@/components/billing/pricing-cards"
import { useI18n } from "@/components/locale-provider"

export default function BillingPage() {
  const [balanceKey, setBalanceKey] = useState(0)
  const { messages } = useI18n()
  const billing = messages.billing

  return (
    <div className="h-full overflow-y-auto bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.18),transparent_32%),linear-gradient(135deg,#fff7ed_0%,#f8fafc_45%,#ecfeff_100%)]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-8 lg:px-10">
        <section className="rounded-[2.4rem] border-2 border-white/70 bg-white/70 p-8 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="inline-flex rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white">
                {billing.pageEyebrow}
              </p>
              <h1 className="mt-5 text-4xl font-semibold tracking-tight text-slate-950 lg:text-6xl">
                {billing.pageTitle}
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">
                {billing.pageDescription}
              </p>
            </div>
            <div className="rounded-[2rem] border bg-slate-950 p-5 text-white">
              <ReceiptText className="h-6 w-6" />
              <p className="mt-4 text-sm leading-6 text-white/72">
                {billing.pageNotice}
              </p>
            </div>
          </div>
        </section>

        <CreditBalance key={balanceKey} />
        <PricingCards onSubscribed={() => setBalanceKey((current) => current + 1)} />
      </div>
    </div>
  )
}
