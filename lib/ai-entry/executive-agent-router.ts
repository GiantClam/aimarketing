import { AI_ENTRY_CONSULTING_DEFAULT_EXECUTIVE_AGENT_ID } from "@/lib/ai-entry/model-policy"

type RouteRule = {
  agentId: string
  patterns: RegExp[]
}

export type ExecutiveAgentRouteDecision = {
  agentId: string
  confidence: "high" | "medium" | "low"
  score: number
  matchedSignals: string[]
  fallback: boolean
}

const ROUTING_RULES: RouteRule[] = [
  {
    agentId: "executive-brand",
    patterns: [
      /\bbrand\b/i,
      /\bposition(?:ing)?\b/i,
      /\bvalue proposition\b/i,
      /\bnarrative\b/i,
      /品牌/,
      /定位/,
      /价值主张/,
      /品牌策略/,
    ],
  },
  {
    agentId: "executive-growth",
    patterns: [
      /\bgrowth\b/i,
      /\bacquisition\b/i,
      /\bretention\b/i,
      /\bfunnel\b/i,
      /\bexperiment\b/i,
      /增长/,
      /留存/,
      /转化/,
      /漏斗/,
      /实验/,
      /渠道/,
      /A\/B/i,
    ],
  },
  {
    agentId: "executive-sales-strategy",
    patterns: [
      /\bsales strategy\b/i,
      /\bpricing\b/i,
      /\bsegment(?:ation)?\b/i,
      /\bwin rate\b/i,
      /销售策略/,
      /报价/,
      /客群/,
      /赢单/,
    ],
  },
  {
    agentId: "executive-sales-management",
    patterns: [
      /\bpipeline\b/i,
      /\bforecast(?:ing)?\b/i,
      /\bquota\b/i,
      /\bcrm\b/i,
      /销售管理/,
      /线索/,
      /预测/,
      /回款/,
    ],
  },
  {
    agentId: "executive-org-hr",
    patterns: [
      /\borganization(?:al)?\b/i,
      /\bheadcount\b/i,
      /\bperformance\b/i,
      /\bincentive\b/i,
      /\bhiring\b/i,
      /组织/,
      /人效/,
      /绩效/,
      /激励/,
      /招聘/,
    ],
  },
  {
    agentId: "executive-operations",
    patterns: [
      /\boperations?\b/i,
      /\bsop\b/i,
      /\bdelivery\b/i,
      /\bthroughput\b/i,
      /运营/,
      /交付/,
      /流程/,
      /效率/,
      /产能/,
    ],
  },
  {
    agentId: "executive-finance",
    patterns: [
      /\bfinance\b/i,
      /\bcash\s*flow\b/i,
      /\bbudget\b/i,
      /\bmargin\b/i,
      /\bp&l\b/i,
      /财务/,
      /现金流/,
      /预算/,
      /利润/,
      /毛利/,
    ],
  },
  {
    agentId: "executive-legal-risk",
    patterns: [
      /\blegal\b/i,
      /\bcompliance\b/i,
      /\bcontract\b/i,
      /\bliability\b/i,
      /劳动/,
      /合同/,
      /法务/,
      /合规/,
      /风险/,
    ],
  },
]

function resolveConfidence(score: number): ExecutiveAgentRouteDecision["confidence"] {
  if (score >= 3) return "high"
  if (score >= 2) return "medium"
  return "low"
}

export function routeExecutiveAgentByPrompt(
  prompt: string | null | undefined,
): ExecutiveAgentRouteDecision {
  const normalizedPrompt = typeof prompt === "string" ? prompt.trim() : ""
  if (!normalizedPrompt) {
    return {
      agentId: AI_ENTRY_CONSULTING_DEFAULT_EXECUTIVE_AGENT_ID,
      confidence: "low",
      score: 0,
      matchedSignals: [],
      fallback: true,
    }
  }

  const scored = ROUTING_RULES.map((rule) => {
    const matches = rule.patterns
      .map((pattern) => pattern.exec(normalizedPrompt)?.[0] || "")
      .filter(Boolean)
    return {
      agentId: rule.agentId,
      score: matches.length,
      matchedSignals: matches,
    }
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)

  const top = scored[0]
  if (!top) {
    return {
      agentId: AI_ENTRY_CONSULTING_DEFAULT_EXECUTIVE_AGENT_ID,
      confidence: "low",
      score: 0,
      matchedSignals: [],
      fallback: true,
    }
  }

  if (top.score < 2) {
    return {
      agentId: AI_ENTRY_CONSULTING_DEFAULT_EXECUTIVE_AGENT_ID,
      confidence: "low",
      score: top.score,
      matchedSignals: top.matchedSignals,
      fallback: true,
    }
  }

  return {
    agentId: top.agentId,
    confidence: resolveConfidence(top.score),
    score: top.score,
    matchedSignals: top.matchedSignals,
    fallback: false,
  }
}
