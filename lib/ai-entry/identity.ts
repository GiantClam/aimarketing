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
) {
  const trimmed = text.trim()
  if (!trimmed) return text
  const identityQuery = isIdentityPrompt(prompt)
  const looksChinese =
    forcedReplyLanguage === "zh"
      ? true
      : forcedReplyLanguage === "en"
        ? false
        : /[\u4e00-\u9fff]/.test(`${prompt}\n${trimmed}`)

  const replacement = looksChinese
    ? "我是通用咨询顾问助手，专注于策略、增长、运营与执行优化等业务问题。"
    : "I am a general consulting advisor assistant focused on strategy, growth, operations, and execution optimization."

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

  return trimmed
    .replace(/\bkiro\b/gi, "enterprise AI chat assistant")
    .replace(/software\s+development/gi, "strategy, growth, and operations consulting")
    .replace(/code,\s*debugging/gi, "strategy and execution optimization")
    .replace(/主要专注于软件开发和技术方面的帮助/g, "主要专注于策略、增长与运营执行优化方面的帮助")
}
