export type ExecutiveAdvisorType = "brand-strategy" | "growth"

export function normalizeExecutiveAdvisorType(value: string | null | undefined): ExecutiveAdvisorType | null {
  if (value === "brand-strategy" || value === "growth") return value
  return null
}

export function getExecutiveAdvisorAgentId(advisorType: ExecutiveAdvisorType) {
  return advisorType === "brand-strategy" ? "executive-brand" : "executive-growth"
}

export function getExecutiveAdvisorAgentName(advisorType: ExecutiveAdvisorType) {
  return advisorType === "brand-strategy" ? "Brand Strategy Advisor" : "Growth Advisor"
}
