import type { BillingKitUseI18n } from "../host/types"

export const useI18n: BillingKitUseI18n = () => ({
  locale: "en",
  messages: {
    billing: {
      loadingPlans: "Loading plans...",
      loadingCredits: "Loading credits...",
    },
  },
})

