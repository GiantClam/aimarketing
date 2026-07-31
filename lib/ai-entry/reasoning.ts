export const REASONING_EFFORTS = [
  "auto",
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const

export type ReasoningEffort = (typeof REASONING_EFFORTS)[number]

export type ReasoningCapability = {
  effort: ReasoningEffort
  zh: string
  en: string
}

function normalizedModelText(providerId?: string | null, modelId?: string | null) {
  return `${providerId || ""} ${modelId || ""}`.trim().toLowerCase()
}

function isDeepSeekModel(providerId?: string | null, modelId?: string | null) {
  return normalizedModelText(providerId, modelId).includes("deepseek")
}

function isOpenAiModel(providerId?: string | null, modelId?: string | null) {
  const value = normalizedModelText(providerId, modelId)
  return value.includes("openai") || /(?:^|[\s/])gpt[-\d.]/i.test(value) || /(?:^|[\s/])o[1345](?:[\s.-]|$)/i.test(value)
}

export function getReasoningCapabilities(input: {
  providerId?: string | null
  modelId?: string | null
}): ReasoningCapability[] {
  const base: ReasoningCapability = { effort: "auto", zh: "自动", en: "Auto" }
  if (isDeepSeekModel(input.providerId, input.modelId)) {
    return [
      base,
      { effort: "none", zh: "关闭推理", en: "Off" },
      { effort: "low", zh: "低", en: "Low" },
      { effort: "high", zh: "高", en: "High" },
      { effort: "max", zh: "最大", en: "Max" },
    ]
  }
  if (isOpenAiModel(input.providerId, input.modelId)) {
    return [
      base,
      { effort: "none", zh: "关闭推理", en: "Off" },
      { effort: "minimal", zh: "最小", en: "Minimal" },
      { effort: "low", zh: "低", en: "Low" },
      { effort: "medium", zh: "中", en: "Medium" },
      { effort: "high", zh: "高", en: "High" },
      { effort: "xhigh", zh: "极高", en: "Extra high" },
    ]
  }
  return [base]
}

export function normalizeReasoningEffort(
  value: unknown,
  input: { providerId?: string | null; modelId?: string | null },
): ReasoningEffort {
  const requested = typeof value === "string" ? value.trim().toLowerCase() as ReasoningEffort : "auto"
  const supported = getReasoningCapabilities(input).some((item) => item.effort === requested)
  return supported ? requested : "auto"
}
