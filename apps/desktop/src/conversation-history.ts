import type { WorkbenchMessage } from "@aimarketing/workbench-client";

export function mergeConversationMessages<TMessage extends WorkbenchMessage>(
  current: readonly TMessage[],
  loaded: readonly TMessage[],
  conversationId: string,
): TMessage[] {
  const merged = new Map<string, TMessage>();
  for (const message of current) {
    if (message.conversationId === conversationId) merged.set(message.id, message);
  }
  for (const message of loaded) merged.set(message.id, message);
  return [...merged.values()].sort((left, right) => {
    const leftTime = Date.parse(left.createdAt);
    const rightTime = Date.parse(right.createdAt);
    if (Number.isNaN(leftTime) || Number.isNaN(rightTime) || leftTime === rightTime) return 0;
    return leftTime - rightTime;
  });
}
