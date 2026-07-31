import "server-only"

import { tool, type ToolSet } from "ai"
import { z } from "zod"

import type { AuthUser } from "@/lib/auth/session"
import { finalizeReservedCredits, releaseReservedCredits, reserveFeatureCredits } from "@/modules/billing-kit/core/runtime"
import { getBillingEntitlementForUser } from "@/modules/billing-kit/core/entitlements"
import {
  fetchDataForSeoGoogleOrganicSerp,
  getDataForSeoSerpCreditEstimate,
  isDataForSeoConfigured,
} from "@/lib/seo-tools/dataforseo-serp"

const dataForSeoSerpSchema = z.object({
  keyword: z.string().trim().min(2).max(700),
  locationCode: z.number().int().positive(),
  languageCode: z.string().trim().min(2).max(16).default("en"),
  limit: z.number().int().min(1).max(20).default(10),
})

type DataForSeoSerpInput = z.infer<typeof dataForSeoSerpSchema>

function canUsePaidSeoData(entitlement: Awaited<ReturnType<typeof getBillingEntitlementForUser>>) {
  const hasCredits = (entitlement.creditAccount?.availableCredits || 0) >= getDataForSeoSerpCreditEstimate()
  const hasPaidSubscription = entitlement.plan?.code !== "free" && entitlement.subscription?.status === "active"
  return hasCredits || hasPaidSubscription
}

export function buildAiEntrySeoTools(input: { currentUser: AuthUser }): ToolSet {
  return {
    dataforseo_serp: tool<unknown, Record<string, unknown>>({
      description: "Run a paid, live Google organic SERP query. Requires an authenticated user with enough credits or a paid subscription. Use only after confirming the keyword, location code, and language code.",
      inputSchema: dataForSeoSerpSchema as any,
      execute: async (rawInput: unknown): Promise<Record<string, unknown>> => {
        if (!isDataForSeoConfigured()) throw new Error("dataforseo_not_configured")
        const request = dataForSeoSerpSchema.parse(rawInput) as DataForSeoSerpInput
        const entitlement = await getBillingEntitlementForUser(input.currentUser)
        if (!canUsePaidSeoData(entitlement)) throw new Error("dataforseo_entitlement_required")

        const requestId = crypto.randomUUID()
        const reservation = await reserveFeatureCredits({
          userId: input.currentUser.id,
          enterpriseId: input.currentUser.enterpriseId,
          featureKey: "dataforseo_serp",
          amount: getDataForSeoSerpCreditEstimate(),
          idempotencyKey: `dataforseo-serp:${requestId}:reserve`,
          metadata: { keyword: request.keyword, locationCode: request.locationCode, languageCode: request.languageCode },
        })
        try {
          const result = await fetchDataForSeoGoogleOrganicSerp(request)
          await finalizeReservedCredits({
            reservation,
            userId: input.currentUser.id,
            enterpriseId: input.currentUser.enterpriseId,
            actualAmount: getDataForSeoSerpCreditEstimate(),
            idempotencyKey: `dataforseo-serp:${requestId}:debit`,
            provider: "dataforseo",
            usagePayload: { resultCount: result.organicResults.length, serpFeatures: result.serpFeatures },
            metadata: { keyword: request.keyword, locationCode: request.locationCode, languageCode: request.languageCode },
          })
          return { ok: true, ...result, creditsCharged: getDataForSeoSerpCreditEstimate() }
        } catch (error) {
          await releaseReservedCredits({
            reservation,
            userId: input.currentUser.id,
            enterpriseId: input.currentUser.enterpriseId,
            idempotencyKey: `dataforseo-serp:${requestId}:release`,
            reason: error instanceof Error ? error.message : "dataforseo_failed",
          }).catch(() => {})
          throw error
        }
      },
    }),
  }
}
