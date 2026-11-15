import { getBillingPlan } from "@/lib/billing/plans"

export type AiToolKey = "chatgpt" | "claude" | "gemini" | "image" | "writing" | "search"

export type AiToolPrice = {
  key: AiToolKey
  label: string
  monthlyLow: number
  monthlyHigh: number
}

export type AiCostInput = Record<AiToolKey, number> & {
  teamSize: number
  needsByok: boolean
}

export type AiCostEstimate = {
  monthlyLow: number
  monthlyHigh: number
  annualLow: number
  annualHigh: number
  savingsLow: number
  savingsHigh: number
  recommendedPlanKey: "starter" | "creator" | "studio" | "provider-costs"
}

export const aiToolPrices: AiToolPrice[] = [
  { key: "chatgpt", label: "ChatGPT users", monthlyLow: 20, monthlyHigh: 30 },
  { key: "claude", label: "Claude users", monthlyLow: 20, monthlyHigh: 30 },
  { key: "gemini", label: "Gemini users", monthlyLow: 20, monthlyHigh: 30 },
  { key: "image", label: "Image tool users", monthlyLow: 12, monthlyHigh: 35 },
  { key: "writing", label: "Writing tool users", monthlyLow: 39, monthlyHigh: 99 },
  { key: "search", label: "Search tool users", monthlyLow: 20, monthlyHigh: 40 },
]

export const defaultAiCostInput: AiCostInput = {
  teamSize: 5,
  chatgpt: 3,
  claude: 2,
  gemini: 1,
  image: 2,
  writing: 2,
  search: 1,
  needsByok: false,
}

export function calculateAiCostEstimate(input: AiCostInput): AiCostEstimate {
  const workspacePrices = {
    starter: (getBillingPlan("starter")?.priceUsdCents || 0) / 100,
    creator: (getBillingPlan("creator")?.priceUsdCents || 0) / 100,
    studio: (getBillingPlan("studio")?.priceUsdCents || 0) / 100,
  }
  const monthlyLow = aiToolPrices.reduce((sum, tool) => sum + input[tool.key] * tool.monthlyLow, 0)
  const monthlyHigh = aiToolPrices.reduce((sum, tool) => sum + input[tool.key] * tool.monthlyHigh, 0)
  const estimatedWorkspaceLow = workspacePrices.starter
  const estimatedWorkspaceHigh = input.teamSize > 8 ? workspacePrices.studio : workspacePrices.creator
  const savingsLow = Math.max(0, monthlyLow - estimatedWorkspaceHigh)
  const savingsHigh = Math.max(0, monthlyHigh - estimatedWorkspaceLow)

  return {
    monthlyLow,
    monthlyHigh,
    annualLow: monthlyLow * 12,
    annualHigh: monthlyHigh * 12,
    savingsLow,
    savingsHigh,
    recommendedPlanKey: input.needsByok
      ? "provider-costs"
      : input.teamSize > 8
        ? "studio"
        : input.teamSize > 4
          ? "creator"
          : "starter",
  }
}
