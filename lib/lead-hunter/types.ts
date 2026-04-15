export const LEAD_HUNTER_ADVISOR_TYPES = ["lead-hunter", "company-search", "contact-mining"] as const

export type LeadHunterAdvisorType = (typeof LEAD_HUNTER_ADVISOR_TYPES)[number]

export function normalizeLeadHunterAdvisorType(advisorType: string | null | undefined): LeadHunterAdvisorType | null {
  if (advisorType === "lead-hunter" || advisorType === "company-search" || advisorType === "contact-mining") {
    return advisorType
  }
  return null
}

export function isLeadHunterAdvisorType(advisorType: string | null | undefined): advisorType is LeadHunterAdvisorType {
  return normalizeLeadHunterAdvisorType(advisorType) !== null
}

export function getLeadHunterAgentName(advisorType: string | null | undefined) {
  const normalized = normalizeLeadHunterAdvisorType(advisorType)
  if (normalized === "contact-mining") return "Contact Mining"
  if (normalized === "company-search") return "Company Search"
  return "Lead Hunter"
}
