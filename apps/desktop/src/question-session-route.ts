export type QuestionSessionConversation = {
  readonly id: string;
  readonly opencode_session_id?: string | null;
  readonly agent_id?: string | null;
};

export function questionConversationForRoute(
  path: string,
  conversations: readonly QuestionSessionConversation[],
) {
  const match = path.match(/^\/dashboard\/(?:ai|writer|image-assistant)\/([^/?]+)/u);
  if (!match) return undefined;
  const conversationId = decodeURIComponent(match[1]);
  return conversations.find((conversation) => conversation.id === conversationId);
}

export function questionSessionIdForRoute(
  path: string,
  conversations: readonly QuestionSessionConversation[],
  availableSessionIds: ReadonlySet<string>,
) {
  const sessionId = questionConversationForRoute(path, conversations)?.opencode_session_id?.trim();
  return sessionId && availableSessionIds.has(sessionId) ? sessionId : undefined;
}
