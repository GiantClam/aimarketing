export function shouldQueryAiEntryEnterpriseKnowledge(input: {
  canQueryEnterpriseKnowledge: boolean
  effectiveAgentId?: string | null
}) {
  return Boolean(input.canQueryEnterpriseKnowledge && input.effectiveAgentId)
}

export function getAiEntryWebSearchSystemRule(input: {
  webSearchAvailable: boolean
  conversationScope?: "chat" | "consulting"
  consultingModelMode?: "speed" | "quality"
}) {
  if (!input.webSearchAvailable) return ""

  if (
    input.conversationScope === "consulting" &&
    input.consultingModelMode === "speed"
  ) {
    return [
      "Web search tool rule: a web_search tool is available, but this is consulting speed mode.",
      "Do not call web_search for evergreen diagnosis, strategy, funnel, messaging, or operations questions.",
      "Call web_search only when the user's intent truly requires fresh/current external facts, recent market changes, verifiable public sources, or up-to-date competitor/policy information.",
      "If you call web_search, cite the result URLs that shaped the answer.",
    ].join(" ")
  }

  return "Web search tool rule: a web_search tool is available. Decide from the user's intent whether fresh external evidence is needed; do not rely on fixed trigger words. If you call web_search, cite the result URLs that shaped the answer."
}
