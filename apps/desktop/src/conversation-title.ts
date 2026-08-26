export type ConversationTitleLocale = "zh" | "en";

const AUTO_TITLE_MAX_LENGTH = 60;

const GENERIC_TITLES = new Set([
  "new chat",
  "new conversation",
  "new session",
  "untitled",
  "untitled chat",
  "新对话",
  "新会话",
  "未命名",
  "未命名会话",
]);

export function defaultConversationTitle(locale: ConversationTitleLocale) {
  return locale === "zh" ? "新对话" : "New chat";
}

export function buildConversationTitleFromPrompt(prompt: string, locale: ConversationTitleLocale) {
  const normalized = prompt.replace(/\s+/gu, " ").trim().slice(0, AUTO_TITLE_MAX_LENGTH);
  return normalized || defaultConversationTitle(locale);
}

export function resolveConversationTitleUpdate(input: {
  currentTitle: string;
  userPrompt: string;
  existingMessageCount: number;
  locale: ConversationTitleLocale;
}) {
  const currentTitle = input.currentTitle.trim();
  if (input.existingMessageCount > 0 && !GENERIC_TITLES.has(currentTitle.toLowerCase())) return null;
  return buildConversationTitleFromPrompt(input.userPrompt, input.locale);
}
