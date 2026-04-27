export function shouldQueryAiEntryEnterpriseKnowledge(input: {
  canQueryEnterpriseKnowledge: boolean
  effectiveAgentId?: string | null
}) {
  return Boolean(input.canQueryEnterpriseKnowledge && input.effectiveAgentId)
}

export function getAiEntryWebSearchSystemRule(input: {
  webSearchAvailable: boolean
  conversationScope?: "chat" | "consulting"
  consultingModelMode?: "quality"
}) {
  if (!input.webSearchAvailable) return ""

  return "Web search tool rule: a web_search tool is available. Decide from the user's intent whether fresh external evidence is needed; do not rely on fixed trigger words. If you call web_search, cite the result URLs that shaped the answer."
}
