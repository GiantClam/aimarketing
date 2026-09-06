export type ConversationCacheCursor = {
  readonly createdAt: string;
  readonly id: string;
};

export type ConversationCacheEntry<TMessage> = {
  readonly messages: readonly TMessage[];
  readonly cursor?: ConversationCacheCursor;
  readonly hasMore?: boolean;
  readonly scrollTop?: number;
};

export class ConversationMemoryCache<TMessage> {
  private readonly entries = new Map<string, ConversationCacheEntry<TMessage>>();

  constructor(private readonly maxEntries = 12) {}

  get(conversationId: string): ConversationCacheEntry<TMessage> | undefined {
    const entry = this.entries.get(conversationId);
    if (!entry) return undefined;
    this.entries.delete(conversationId);
    this.entries.set(conversationId, entry);
    return { ...entry, messages: [...entry.messages] };
  }

  set(conversationId: string, entry: ConversationCacheEntry<TMessage>) {
    this.entries.delete(conversationId);
    this.entries.set(conversationId, { ...entry, messages: [...entry.messages] });
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value as string);
  }

  delete(conversationId: string) {
    this.entries.delete(conversationId);
  }
}
