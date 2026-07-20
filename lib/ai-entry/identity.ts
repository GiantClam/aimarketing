export function isIdentityPrompt(prompt: string) {
  const normalized = prompt.trim()
  if (!normalized) return false
  return (
    /who\s+are\s+you/i.test(normalized) ||
    /what\s+are\s+you/i.test(normalized) ||
    /introduce\s+yourself/i.test(normalized) ||
    /你是谁/.test(normalized) ||
    /介绍.*你/.test(normalized)
  )
}

export function normalizeAiEntryIdentity(
  text: string,
  prompt: string,
  forcedReplyLanguage: "zh" | "en" | null,
  agentId: string | null = null,
) {
  const trimmed = text.trim()
  if (!trimmed) return text
  const hasExplicitAgent = typeof agentId === "string" && agentId.trim().length > 0
  const identityQuery = isIdentityPrompt(prompt)
  const looksChinese =
    forcedReplyLanguage === "zh"
      ? true
      : forcedReplyLanguage === "en"
        ? false
        : /[\u4e00-\u9fff]/.test(`${prompt}\n${trimmed}`)

  const replacement = hasExplicitAgent
    ? looksChinese
      ? "我是当前选中的企业 Agent，将围绕其配置的目标和能力协助你完成任务。"
      : "I am the selected enterprise Agent, configured to help with the goals and capabilities of this Agent."
    : looksChinese
      ? "我是通用 AI 助手。当前没有加载任何 Agent，我会直接根据你的问题回答，不预设企业咨询角色。"
      : "I am a general-purpose AI assistant. No Agent is currently selected, so I will answer directly without assuming a consulting role."

  if (identityQuery) return replacement

  const identityConflictPatterns = [
    /\bkiro\b/i,
    /\bsoftware\s+development\b/i,
    /\bcode[, ]+debugging\b/i,
    /主要专注于软件开发和技术方面的帮助/,
    /我是\s*kiro/i,
  ]

  const hasConflict = identityConflictPatterns.some((pattern) => pattern.test(trimmed))
  if (!hasConflict) return text
  if (!hasExplicitAgent) return replacement

  return trimmed
    .replace(/\bkiro\b/gi, "the selected enterprise Agent")
    .replace(/software\s+development/gi, "the selected Agent's configured goals")
    .replace(/code,\s*debugging/gi, "the selected Agent's configured goals")
    .replace(/主要专注于软件开发和技术方面的帮助/g, "围绕当前选中 Agent 的配置目标提供帮助")
}
