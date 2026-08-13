export type WriterRevision = {
  readonly revisionId: string;
  readonly content: string;
  readonly baseHash?: string;
};

export type WriterActiveDraft = { readonly revision: number; readonly title: string; readonly content: string };
export type WriterDraftResult = { readonly outcome: "needs_clarification" | "draft_ready"; readonly draft: { title: string; content: string; baseRevision: number | null } | null };
export type WriterSessionDraft = WriterActiveDraft & { readonly sourceUrls: readonly string[] };
export type WriterSessionTurn = { readonly role: "user" | "assistant"; readonly content: string };
export type WriterSessionContext = {
  readonly schemaVersion: 1;
  readonly conversationId: string;
  readonly platform: string;
  readonly currentTurn: string;
  readonly activeDraft: WriterSessionDraft | null;
  readonly recentTurns: readonly WriterSessionTurn[];
  readonly taskStatus: "pending" | "running" | "ready" | "failed";
  readonly recovery: boolean;
};
export type WriterResultInvariant = WriterDraftResult & {
  readonly research: { readonly requested: boolean; readonly completed: boolean };
  readonly assetIntents: readonly { readonly id: string }[];
};

const TITLE_SIGNAL = /(?:标题|标题名|headline|title)/iu;
const TITLE_ONLY_SIGNAL = /(?:仅|只|只需|只要|only|just)/iu;
const PRESERVE_SIGNAL = /(?:正文|内容|图片|配图|body|content|image|images).*(?:保持|保留|不变|原样|unchanged|same|preserve|keep)/iu;
const BODY_MUTATION_SIGNAL = /(?:正文|内容|body|content|article).*(?:改|翻译|重写|改写|rewrite|translate|revise|change)/iu;
const INCOMPLETE_REVISION_SIGNAL = /(?:正文后续保持不变|其余正文.*(?:保持不变|不变)|正文省略|rest of (?:the )?(?:article|body|content).*(?:unchanged|same|preserved|retain)|(?:the )?(?:remaining|rest).*(?:article|body|content).*(?:unchanged|same)|application.*(?:preserve|retain).*(?:article|body|content)|\.\.\.\s*(?:正文|文章|article|body|content)?)/iu;

export function isWriterTitleOnlyRevisionRequest(query: string) {
  const normalized = query.trim();
  if (!TITLE_SIGNAL.test(normalized)) return false;
  if (BODY_MUTATION_SIGNAL.test(normalized)) return false;
  return TITLE_ONLY_SIGNAL.test(normalized) || PRESERVE_SIGNAL.test(normalized);
}

export function isIncompleteWriterRevisionContent(content: string) { return INCOMPLETE_REVISION_SIGNAL.test(content); }

/** Enforce result invariants after a host validates its transport schema. */
export function validateWriterResultInvariants<T extends WriterResultInvariant>(result: T): T {
  const normalized = result.outcome === "needs_clarification" && result.draft
    ? { ...result, outcome: "draft_ready" as const } as T
    : result;
  if (normalized.outcome === "draft_ready" && !normalized.draft) throw new Error("writer_result_draft_missing");
  if (normalized.research.completed && !normalized.research.requested) throw new Error("writer_result_research_state_invalid");
  const ids = new Set<string>();
  for (const intent of normalized.assetIntents) {
    if (ids.has(intent.id)) throw new Error(`writer_result_duplicate_asset:${intent.id}`);
    ids.add(intent.id);
  }
  return normalized;
}

/** Normalize portable Writer session data; hosts add storage keys and hashes. */
export function buildWriterSessionContext(input: {
  readonly conversationId?: string;
  readonly platform: string;
  readonly currentTurn: string;
  readonly activeDraft: WriterSessionDraft | null;
  readonly recentTurns: readonly WriterSessionTurn[];
  readonly recentTurnLimit?: number;
  readonly taskStatus: WriterSessionContext["taskStatus"];
  readonly recovery?: boolean;
}): WriterSessionContext {
  const activeDraft = input.activeDraft ? {
    revision: input.activeDraft.revision,
    title: input.activeDraft.title,
    content: input.activeDraft.content,
    sourceUrls: [...input.activeDraft.sourceUrls],
  } : null;
  return {
    schemaVersion: 1,
    conversationId: input.conversationId?.trim() || "unknown",
    platform: input.platform.trim(),
    currentTurn: input.currentTurn.trim(),
    activeDraft,
    recentTurns: input.recentTurns.slice(-(input.recentTurnLimit ?? 12)).map((turn) => ({ role: turn.role, content: turn.content })),
    taskStatus: input.taskStatus,
    recovery: input.recovery === true,
  };
}

function replaceMarkdownTitle(content: string, title: string) {
  const normalizedTitle = title.trim();
  const heading = /^#\s+.*$/mu;
  return heading.test(content) ? content.replace(heading, `# ${normalizedTitle}`) : `# ${normalizedTitle}\n\n${content.trim()}`;
}

export function reconcileWriterRevisionResult<T extends WriterDraftResult>(input: { query: string; result: T; activeDraft: WriterActiveDraft | null | undefined }): T {
  const { activeDraft, result } = input;
  if (!activeDraft?.content || !result.draft) return result;
  if (isWriterTitleOnlyRevisionRequest(input.query)) {
    const title = result.draft.title.trim();
    if (!title) return result;
    if (title === activeDraft.title.trim()) throw new Error("writer_result_title_change_missing");
    return { ...result, outcome: "draft_ready", draft: { ...result.draft, title, content: replaceMarkdownTitle(activeDraft.content, title), baseRevision: activeDraft.revision } };
  }
  if (isIncompleteWriterRevisionContent(result.draft.content)) throw new Error("writer_result_incomplete_revision");
  return result;
}

export type PendingWriterMessageLike = { id: string; role: "user" | "assistant"; content: string };
export type PendingWriterMessageReconciliation = { prompt: string; generatingContent: string; optimisticUserMessageId?: string | null; optimisticAssistantMessageId?: string | null };

export type PendingWriterHistoryEntryLike = {
  role?: "user" | "assistant";
  query?: string | null;
  answer?: string | null;
  content?: string | null;
  created_at?: number | null;
};

export type PendingWriterTaskLike = {
  prompt?: string | null;
  taskCreatedAt?: number | null;
  generatingContent: string;
};

export function hasCompletedPendingWriterResponse(
  entries: PendingWriterHistoryEntryLike[],
  pending: PendingWriterTaskLike,
) {
  const prompt = String(pending.prompt || "").trim();
  if (!prompt) return false;

  const taskCreatedAt = Number(pending.taskCreatedAt);
  const earliestAcceptedAt = Number.isFinite(taskCreatedAt) ? taskCreatedAt - 2_000 : null;
  const generatingContent = String(pending.generatingContent || "").trim();

  return entries.some((entry) => {
    if (entry.role !== "assistant" || String(entry.query || "").trim() !== prompt) return false;

    const answer = String(entry.answer ?? entry.content ?? "").trim();
    if (
      answer.length < 20 ||
      answer === generatingContent ||
      /^(?:request failed|请求失败)\s*:/iu.test(answer)
    ) {
      return false;
    }

    if (earliestAcceptedAt === null) return true;
    const createdAt = Number(entry.created_at);
    return !Number.isFinite(createdAt) || createdAt * 1_000 >= earliestAcceptedAt;
  });
}

export function reconcilePendingWriterMessages<T extends PendingWriterMessageLike>(serverMessages: T[], currentMessages: T[], pending: PendingWriterMessageReconciliation) {
  const normalize = (content: string) => content.trim();
  const findLast = (items: T[], predicate: (item: T) => boolean) => { for (let index = items.length - 1; index >= 0; index -= 1) if (predicate(items[index])) return index; return -1; };
  const generatingContent = normalize(pending.generatingContent);
  const requestedPrompt = normalize(pending.prompt);
  const explicitUserIndex = pending.optimisticUserMessageId ? currentMessages.findIndex((message) => message.id === pending.optimisticUserMessageId && message.role === "user") : -1;
  const explicitAssistant = pending.optimisticAssistantMessageId ? currentMessages.find((message) => message.id === pending.optimisticAssistantMessageId && message.role === "assistant") ?? null : null;
  const assistantIndex = explicitAssistant ? currentMessages.findIndex((message) => message.id === explicitAssistant.id) : findLast(currentMessages, (message) => message.role === "assistant" && normalize(message.content) === generatingContent);
  const assistant = explicitAssistant || currentMessages[assistantIndex] || null;
  const userIndex = explicitUserIndex >= 0
    ? explicitUserIndex
    : assistantIndex > 0 && currentMessages[assistantIndex - 1]?.role === "user"
      ? assistantIndex - 1
      : findLast(currentMessages, (message) => message.role === "user" && normalize(message.content) === requestedPrompt);
  const prompt = requestedPrompt || (userIndex >= 0 ? normalize(currentMessages[userIndex].content) : "");
  if (!prompt || !assistant || normalize(assistant.content) !== generatingContent) return serverMessages;
  const user = userIndex >= 0 ? currentMessages[userIndex] : null;
  const serverUserIndex = findLast(serverMessages, (message) => message.role === "user" && normalize(message.content) === prompt);
  if (serverUserIndex >= 0) {
    const next = [...serverMessages];
    const assistantIndexOnServer = serverUserIndex + 1;
    if (next[assistantIndexOnServer]?.role === "assistant") next[assistantIndexOnServer] = assistant;
    else next.splice(assistantIndexOnServer, 0, assistant);
    return next;
  }
  return user ? [...serverMessages, user, assistant] : serverMessages;
}
