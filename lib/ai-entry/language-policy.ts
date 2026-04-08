import type { CoreMessage } from "ai"

function normalizeCoreMessageContent(content: CoreMessage["content"]) {
  if (typeof content === "string") return content.trim()
  if (!Array.isArray(content)) return ""

  return content
    .map((part) => {
      if (typeof part === "string") return part
      if (part && typeof part === "object" && "text" in part) {
        const text = (part as { text?: unknown }).text
        return typeof text === "string" ? text : ""
      }
      return ""
    })
    .join(" ")
    .trim()
}

export function detectExplicitReplyLanguageFromPrompt(prompt: string): "zh" | "en" | null {
  const normalized = prompt.trim()
  if (!normalized) return null

  const forceEnglishPatterns = [
    /\b(reply|respond|answer)\b.{0,20}\b(in\s+english|english)\b/i,
    /\b(only|always)\b.{0,20}\benglish\b/i,
    /请(用|使用|统一用|一直用|后续用|接下来用).{0,12}(英文|英语)/,
    /(用|使用|改用).{0,12}(英文|英语).{0,12}(回复|回答)/,
  ]
  if (forceEnglishPatterns.some((pattern) => pattern.test(normalized))) {
    return "en"
  }

  const forceChinesePatterns = [
    /\b(reply|respond|answer)\b.{0,20}\b(in\s+chinese|chinese)\b/i,
    /\b(only|always)\b.{0,20}\bchinese\b/i,
    /请(用|使用|统一用|一直用|后续用|接下来用).{0,12}(中文|汉语|普通话)/,
    /(用|使用|改用).{0,12}(中文|汉语|普通话).{0,12}(回复|回答)/,
  ]
  if (forceChinesePatterns.some((pattern) => pattern.test(normalized))) {
    return "zh"
  }

  return null
}

export function resolveForcedReplyLanguage(messages: CoreMessage[]) {
  let forced: "zh" | "en" | null = null
  for (const message of messages) {
    if (message.role !== "user") continue
    const prompt = normalizeCoreMessageContent(message.content)
    const detected = detectExplicitReplyLanguageFromPrompt(prompt)
    if (detected) forced = detected
  }
  return forced
}

