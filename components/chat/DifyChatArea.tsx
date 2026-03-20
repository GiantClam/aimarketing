"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, History, Loader2, MessageSquare, Radar, Send, Sparkles, Target, TrendingUp } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  WorkspaceComposerPanel,
  WorkspaceEmptyState,
} from "@/components/workspace/workspace-primitives";
import { WorkspaceConversationHeader } from "@/components/workspace/workspace-conversation-header";
import {
  WorkspaceLoadingMessage,
  WorkspaceMessageFrame,
} from "@/components/workspace/workspace-message-primitives";
import { ensureWorkspaceQueryData, fetchWorkspaceQueryData, getAdvisorMessagesPage, getAdvisorMessagesQueryKey, invalidateAdvisorConversationQueries } from "@/lib/query/workspace-cache";
import { ADVISOR_SESSION_CACHE_TTL_MS, getAdvisorConversationCache, isAdvisorConversationCacheFresh, mapAdvisorMessagePageToChatMessages, saveAdvisorConversationCache, type AdvisorChatMessage } from "@/lib/advisor/session-store";
import { findAdvisorPendingTask, removePendingAssistantTask, savePendingAssistantTask, updatePendingAssistantTask } from "@/lib/assistant-task-store";
import { readStorageJson } from "@/lib/browser-storage";
import { cn } from "@/lib/utils";
import { CodeBlock } from "./CodeBlock";

type Message = AdvisorChatMessage;

type WorkspaceMeta = {
  icon: typeof Target;
  eyebrow: string;
  title: string;
  description: string;
  contextMode: string;
  outputMode: string;
  focus: string[];
  deliverables: string[];
  promptTips: string[];
  quickPrompts: string[];
  composerPlaceholder: string;
  workflowNote: string;
  complianceNote: string;
  emptyTitle: string;
  emptyDescription: string;
  emptyChecklist: string[];
};

const WORKSPACE_META: Record<string, WorkspaceMeta> = {
  "brand-strategy": {
    icon: Target,
    eyebrow: "品牌策略工作台",
    title: "品牌战略顾问",
    description: "把定位、差异化、叙事和活动方向放进同一条线程里持续打磨，而不是每轮都从空白开始。",
    contextMode: "多轮连续推演",
    outputMode: "判断框架 + 信息建议",
    focus: ["定位与目标人群", "价值主张与差异化", "首页 / 活动信息层级"],
    deliverables: ["定位判断", "叙事结构", "下一步验证建议"],
    promptTips: ["产品 / 服务是什么", "目标客户是谁", "当前最想解决的问题"],
    quickPrompts: [
      "请帮我重新梳理官网首页的品牌定位和价值主张。",
      "请判断我们的目标人群是否过宽，并给出更清晰的叙事方向。",
      "围绕一次新品发布，请给我品牌主张和首页英雄区表达。",
    ],
    composerPlaceholder: "描述品牌、产品、目标客户、市场环境和当前问题，我会按品牌顾问方式帮你拆解定位与叙事。",
    workflowNote: "品牌顾问会保留上下文，适合同一命题的连续追问、收敛和迭代。",
    complianceNote: "Shift + Enter 换行，Enter 发送。AI 输出适合作为讨论底稿，需要结合真实市场验证。",
    emptyTitle: "把品牌判断留在一条可持续追问的线程里",
    emptyDescription: "先给我品牌背景，再逐步收敛定位、叙事和信息方向。",
    emptyChecklist: ["品牌 / 产品背景", "目标客户", "当前表达问题"],
  },
  growth: {
    icon: TrendingUp,
    eyebrow: "增长工作台",
    title: "增长顾问",
    description: "适合持续拆解目标、渠道、实验和执行节奏，把增长判断放在同一条线程里复盘和更新。",
    contextMode: "多轮连续推演",
    outputMode: "策略判断 + 执行动作",
    focus: ["渠道优先级", "转化链路", "实验节奏"],
    deliverables: ["增长策略框架", "实验清单", "动作优先级"],
    promptTips: ["目标与时间窗", "已有渠道与限制", "当前最大瓶颈"],
    quickPrompts: [
      "我们想在 8 周内把官网试用注册提升 30%，请给我增长动作优先级。",
      "围绕小红书与官网表单转化，帮我设计 3 周实验计划。",
      "我们有投放但合格线索不稳定，请帮我拆解漏斗并给出修复动作。",
    ],
    composerPlaceholder: "描述增长目标、时间窗口、渠道、资源约束和当前卡点，我会帮你拆解优先级与下一步。",
    workflowNote: "同一会话会保留上下文，适合连续追问、复盘和调整增长动作。",
    complianceNote: "Shift + Enter 换行，Enter 发送。AI 输出适合作为判断底稿，不替代业务验证。",
    emptyTitle: "把一个增长问题留在同一条线程里持续拆解",
    emptyDescription: "先给我目标和现状，再逐步收敛动作、实验与节奏。",
    emptyChecklist: ["明确目标值", "补充渠道与预算", "说明最大卡点"],
  },
  "lead-hunter": {
    icon: Radar,
    eyebrow: "线索检索工作台",
    title: "海外猎客",
    description: "把客户条件说清楚，我会触发 workflow 返回海外线索。历史仅用于展示，不会作为检索上下文重新发送。",
    contextMode: "仅当前搜索条件",
    outputMode: "线索列表 + 下一轮建议",
    focus: ["地区与市场范围", "行业 / 规模 / 角色", "筛选条件与输出字段"],
    deliverables: ["线索列表", "目标画像", "下一轮筛选建议"],
    promptTips: ["越具体越好", "说明需要的字段", "说明排除条件"],
    quickPrompts: [
      "帮我找美国和加拿大的 DTC 美妆品牌创始人或增长负责人，优先 11-200 人团队。",
      "搜索德国和荷兰做 AI 自动化软件的中型企业，给我 CTO 或 Head of Operations 线索。",
      "找澳洲跨境电商服务商里负责 performance marketing 的负责人，排除代理公司。",
    ],
    composerPlaceholder: "直接写客户画像、地区、行业、职位、公司规模、排除条件和你想拿到的字段。",
    workflowNote: "海外猎客每次只根据当前搜索条件触发 workflow，不会把前文重新作为检索输入。",
    complianceNote: "Shift + Enter 换行，Enter 发送。结果依赖外部数据源，建议二次验证后再触达。",
    emptyTitle: "先把这次搜索条件讲完整，再让 workflow 去找人",
    emptyDescription: "这个工作台更像结构化检索入口，而不是开放式聊天。",
    emptyChecklist: ["地区范围", "行业与角色", "保留 / 排除条件"],
  },
};

const ADVISOR_INITIAL_MESSAGE_LIMIT = 20;
const ADVISOR_HISTORY_PAGE_SIZE = 20;

function normalizeMessageContent(content: string) {
  return content.trim();
}

function getMessageSignature(message: Message) {
  return [message.role, normalizeMessageContent(message.content), message.agentName || ""].join("|");
}

function areMessageListsEquivalent(left: Message[], right: Message[]) {
  if (left.length !== right.length) return false;
  return left.every((message, index) => getMessageSignature(message) === getMessageSignature(right[index]));
}

function isMessageListPrefix(prefix: Message[], full: Message[]) {
  if (prefix.length > full.length) return false;
  return prefix.every((message, index) => getMessageSignature(message) === getMessageSignature(full[index]));
}

export function DifyChatArea({ user, advisorType, initialConversationId }: { user: string; advisorType: string; initialConversationId: string | null }) {
  const meta = useMemo(() => WORKSPACE_META[advisorType] ?? WORKSPACE_META["brand-strategy"], [advisorType]);
  const headerDescription = useMemo(() => `在这里与 ${meta.title} 进行多轮次对话，发送消息后会自动生成回复`, [meta.title]);
  const queryClient = useQueryClient();
  const router = useRouter();
  const [messagesState, setMessagesState] = useState<Message[]>([]);
  const [inputVal, setInputVal] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isConversationLoading, setIsConversationLoading] = useState(Boolean(initialConversationId));
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [historyCursor, setHistoryCursor] = useState<string | null>(null);
  const [pendingTaskRefreshKey, setPendingTaskRefreshKey] = useState(0);
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const [conversationTitle, setConversationTitle] = useState(meta.title);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const historyRestoreRef = useRef<{ height: number; top: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<Message[]>([]);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    messagesRef.current = messagesState;
  }, [messagesState]);

  useEffect(() => {
    const viewport = scrollRef.current?.querySelector("[data-slot='scroll-area-viewport']") as HTMLElement | null;
    if (historyRestoreRef.current && viewport) {
      viewport.scrollTop = viewport.scrollHeight - historyRestoreRef.current.height + historyRestoreRef.current.top;
      historyRestoreRef.current = null;
      return;
    }
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messagesState, isLoading]);

  const persistConversationCache = useCallback((convId: string, nextMessages: Message[], nextCursor: string | null, nextHasMoreHistory: boolean, loadedMessageCount?: number) => {
    saveAdvisorConversationCache(advisorType, convId, {
      messages: nextMessages,
      historyCursor: nextCursor,
      hasMoreHistory: nextHasMoreHistory,
      loadedMessageCount: loadedMessageCount ?? Math.ceil(nextMessages.length / 2),
      updatedAt: Date.now(),
    });
  }, [advisorType]);

  const fetchMessages = useCallback(async (convId: string, options?: { firstId?: string | null; append?: boolean; keepCurrentOnError?: boolean; forceRefresh?: boolean; background?: boolean }) => {
    try {
      const limit = options?.append ? ADVISOR_HISTORY_PAGE_SIZE : ADVISOR_INITIAL_MESSAGE_LIMIT;
      const queryKey = getAdvisorMessagesQueryKey(advisorType, convId, limit, options?.firstId);
      const data = options?.append || options?.forceRefresh
        ? await fetchWorkspaceQueryData(queryClient, { queryKey, queryFn: () => getAdvisorMessagesPage(user, advisorType, convId, limit, options?.firstId) })
        : await ensureWorkspaceQueryData(queryClient, { queryKey, queryFn: () => getAdvisorMessagesPage(user, advisorType, convId, limit, options?.firstId) });
      const rawMessages = Array.isArray(data.data) ? data.data : [];
      const nextCursor = Boolean(data?.has_more) && rawMessages.length > 0 ? rawMessages[0]?.id ?? null : null;
      setHistoryCursor(nextCursor);
      setHasMoreHistory(Boolean(data?.has_more) && Boolean(nextCursor));
      const serverMessages = mapAdvisorMessagePageToChatMessages(data, meta.title);
      setMessagesState((current) => {
        let resolvedMessages = options?.append ? [...serverMessages, ...current] : serverMessages;
        if (!options?.append && options?.background && (areMessageListsEquivalent(current, serverMessages) || isMessageListPrefix(serverMessages, current))) {
          resolvedMessages = current;
        }
        persistConversationCache(convId, resolvedMessages, nextCursor, Boolean(data?.has_more) && Boolean(nextCursor), options?.append ? Math.ceil(resolvedMessages.length / 2) : rawMessages.length);
        return resolvedMessages;
      });
    } catch (error) {
      if (error instanceof TypeError && error.message.includes("Failed to fetch")) return;
      console.error("advisor.fetch-messages.failed", error);
      if (options?.append || options?.keepCurrentOnError) return;
      setMessagesState([{ id: `history_error_${Date.now()}`, conversation_id: convId, role: "assistant", content: `历史消息加载失败：${error instanceof Error ? error.message : "未知错误"}`, agentName: meta.title }]);
    }
  }, [advisorType, meta.title, persistConversationCache, queryClient, user]);

  useEffect(() => {
    setConversationId(initialConversationId);
    setHistoryCursor(null);
    setHasMoreHistory(false);
    if (!initialConversationId) {
      setMessagesState([]);
      setIsConversationLoading(false);
      return;
    }
    const cached = getAdvisorConversationCache(advisorType, initialConversationId);
    if (cached && isAdvisorConversationCacheFresh(cached, ADVISOR_SESSION_CACHE_TTL_MS)) {
      setMessagesState(cached.messages);
      setHistoryCursor(cached.historyCursor);
      setHasMoreHistory(Boolean(cached.hasMoreHistory));
      setIsConversationLoading(false);
    } else {
      setMessagesState([]);
      setIsConversationLoading(true);
    }
    void fetchMessages(initialConversationId, { keepCurrentOnError: Boolean(cached), forceRefresh: Boolean(cached), background: Boolean(cached) }).finally(() => setIsConversationLoading(false));
  }, [advisorType, fetchMessages, initialConversationId]);

  useEffect(() => {
    if (!conversationId) {
      setConversationTitle(meta.title);
      return;
    }

    const cachedList = readStorageJson<{ items?: Array<{ id: string; name?: string | null }> }>(
      "session",
      `advisor-conversations-cache-v2:${advisorType}`,
    );
    const matchedTitle = cachedList?.items?.find((item) => item.id === conversationId)?.name?.trim();
    setConversationTitle(matchedTitle || meta.title);
  }, [advisorType, conversationId, meta.title, pendingTaskRefreshKey]);

  useEffect(() => {
    const pendingTask = findAdvisorPendingTask({ advisorType, conversationId });
    if (!pendingTask) return;
    let cancelled = false;
    setIsLoading(true);

    const poll = async () => {
      while (!cancelled) {
        try {
          const response = await fetch(`/api/tasks/${pendingTask.taskId}`);
          const payload = (await response.json().catch(() => null)) as { data?: { status?: string; result?: { conversation_id?: string | null; answer?: string; agent_name?: string; error?: string } | null } } | null;
          const status = payload?.data?.status;
          const taskResult = payload?.data?.result || null;
          const nextConversationId = typeof taskResult?.conversation_id === "string" ? taskResult.conversation_id : null;

          if (nextConversationId && pendingTask.conversationId !== nextConversationId && !conversationId) {
            updatePendingAssistantTask(pendingTask.taskId, { conversationId: nextConversationId });
            const optimisticMessages = messagesRef.current.map((message) => ({ ...message, conversation_id: nextConversationId }));
            persistConversationCache(nextConversationId, optimisticMessages, historyCursor, hasMoreHistory);
            setConversationId(nextConversationId);
            window.dispatchEvent(new CustomEvent("dify-refresh", { detail: { advisorType } }));
            router.replace(`/dashboard/advisor/${advisorType}/${nextConversationId}`);
          }

          if (status === "success") {
            const targetConversationId = nextConversationId || conversationId;
            if (targetConversationId) {
              setMessagesState((prev) => {
                const next = [...prev];
                for (let index = next.length - 1; index >= 0; index -= 1) {
                  if (next[index]?.role === "assistant" && !normalizeMessageContent(next[index]?.content || "")) {
                    next[index] = { ...next[index], conversation_id: targetConversationId, content: typeof taskResult?.answer === "string" ? taskResult.answer : next[index].content, agentName: typeof taskResult?.agent_name === "string" ? taskResult.agent_name : next[index].agentName || meta.title };
                    break;
                  }
                }
                const normalizedNext = next.map((message) => ({ ...message, conversation_id: message.conversation_id || targetConversationId }));
                persistConversationCache(targetConversationId, normalizedNext, historyCursor, hasMoreHistory);
                return normalizedNext;
              });
              void invalidateAdvisorConversationQueries(queryClient, advisorType, targetConversationId).then(() => fetchMessages(targetConversationId, { forceRefresh: true, keepCurrentOnError: true, background: true })).catch((error) => console.error("advisor.reconcile.failed", error));
            }
            removePendingAssistantTask(pendingTask.taskId);
            if (!cancelled) setIsLoading(false);
            return;
          }

          if (status === "failed") {
            removePendingAssistantTask(pendingTask.taskId);
            if (!cancelled) {
              setIsLoading(false);
              setMessagesState((prev) => [...prev.filter((message, index, source) => !(index === source.length - 1 && message.role === "assistant" && !message.content.trim())), { id: `advisor_error_${Date.now()}`, conversation_id: conversationId || "", role: "assistant", content: `请求失败：${taskResult?.error || "未知错误"}`, agentName: meta.title }]);
            }
            return;
          }
        } catch (error) {
          console.error("advisor.pending-task.poll.failed", error);
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
      }
    };

    void poll();
    return () => {
      cancelled = true;
    };
  }, [advisorType, conversationId, fetchMessages, hasMoreHistory, historyCursor, meta.title, pendingTaskRefreshKey, persistConversationCache, queryClient, router]);

  const handleCopyMessage = async (messageId: string, content: string) => {
    if (!content.trim() || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      window.setTimeout(() => setCopiedMessageId((current) => (current === messageId ? null : current)), 1200);
    } catch (error) {
      console.error("advisor.copy-message.failed", error);
    }
  };

  const loadOlderMessages = async () => {
    if (!conversationId || !historyCursor || isHistoryLoading) return;
    const viewport = scrollRef.current?.querySelector("[data-slot='scroll-area-viewport']") as HTMLElement | null;
    if (viewport) historyRestoreRef.current = { height: viewport.scrollHeight, top: viewport.scrollTop };
    setIsHistoryLoading(true);
    try {
      await fetchMessages(conversationId, { firstId: historyCursor, append: true });
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const handleSend = async () => {
    if (!inputVal.trim() || isLoading) return;
    const currentQuery = inputVal.trim();
    let taskAccepted = false;
    setInputVal("");
    setIsLoading(true);
    const userMessageId = `temp_usr_${Date.now()}`;
    const assistantMessageId = `temp_asst_${Date.now()}`;

    setMessagesState((prev) => {
      const nextMessages: Message[] = [...prev, { id: userMessageId, conversation_id: conversationId || "", role: "user", content: currentQuery }, { id: assistantMessageId, conversation_id: conversationId || "", role: "assistant", content: "", agentName: meta.title }];
      if (conversationId) persistConversationCache(conversationId, nextMessages, historyCursor, hasMoreHistory);
      return nextMessages;
    });

    try {
      await queryClient.cancelQueries({ queryKey: ["advisor", advisorType, "messages"] });
      const payload: { inputs: { contents: string }; query: string; response_mode: "async"; user: string; advisorType: string; conversation_id?: string } = { inputs: { contents: currentQuery }, query: currentQuery, response_mode: "async", user, advisorType };
      if (conversationId) payload.conversation_id = conversationId;
      const response = await fetch("/api/dify/chat-messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(String(errorData?.details || errorData?.error || `HTTP ${response.status}`));
      }
      const payloadData = (await response.json().catch(() => null)) as { task_id?: string; conversation_id?: string | null } | null;
      if (!payloadData?.task_id) throw new Error("未创建异步任务");
      savePendingAssistantTask({ taskId: payloadData.task_id, scope: "advisor", advisorType, conversationId: payloadData.conversation_id || conversationId, prompt: currentQuery, createdAt: Date.now() });
      taskAccepted = true;
      setPendingTaskRefreshKey(Date.now());
      if (payloadData.conversation_id && !conversationId) {
        persistConversationCache(payloadData.conversation_id, [{ id: userMessageId, conversation_id: payloadData.conversation_id, role: "user", content: currentQuery }, { id: assistantMessageId, conversation_id: payloadData.conversation_id, role: "assistant", content: "", agentName: meta.title }], null, false, 1);
        setConversationId(payloadData.conversation_id);
        window.dispatchEvent(new CustomEvent("dify-refresh", { detail: { advisorType } }));
        router.replace(`/dashboard/advisor/${advisorType}/${payloadData.conversation_id}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      setMessagesState((prev) => prev.map((item) => item.id === assistantMessageId ? { ...item, content: `请求失败：${message}`, agentName: meta.title } : item));
      console.error("advisor.send.failed", error);
    } finally {
      if (!taskAccepted) setIsLoading(false);
    }
  };

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="flex h-full min-h-0 justify-center">
      <section className="flex min-h-0 w-full max-w-6xl flex-col overflow-hidden rounded-b-[28px] rounded-t-none border-x border-b border-t-0 border-border/70 bg-[#f7f7f7] shadow-none">
        <WorkspaceConversationHeader
          title={conversationTitle}
          description={headerDescription}
          variant="inline"
        />

        <div className="min-h-0 flex-1 bg-[#f7f7f7]">
          <ScrollArea ref={scrollRef} className="h-full" viewportClassName="px-3 pb-3 pt-0 lg:px-4 lg:pb-4 lg:pt-0">
            {messagesState.length === 0 ? (
              <div className="mx-auto flex min-h-full w-full max-w-5xl items-center">
                <WorkspaceEmptyState
                  icon={<meta.icon className="h-6 w-6" />}
                  title={meta.emptyTitle}
                  description={meta.emptyDescription}
                  checklist={meta.emptyChecklist}
                  quickStartLabel="快速开始"
                  quickPrompts={meta.quickPrompts}
                  onSelectPrompt={(prompt) => {
                    setInputVal(prompt);
                    composerRef.current?.focus();
                  }}
                />
              </div>
            ) : (
              <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
                {hasMoreHistory ? (
                  <div className="flex justify-center">
                    <Button variant="outline" size="sm" className="rounded-full border-2 border-border bg-background px-4" onClick={() => void loadOlderMessages()} disabled={isHistoryLoading}>
                      {isHistoryLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <History className="mr-1.5 h-3.5 w-3.5" />}加载更早记录
                    </Button>
                  </div>
                ) : null}
                {isConversationLoading ? (
                  <div className="rounded-[24px] border-2 border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      正在恢复顾问会话...
                    </div>
                  </div>
                ) : null}
                {messagesState.map((message, index) => {
                  const isAssistant = message.role === "assistant";
                  const isPendingAssistant = isAssistant && !message.content.trim();
                  return (
                    <WorkspaceMessageFrame
                      key={message.id || index}
                      role={isAssistant ? "assistant" : "user"}
                      className={cn(index === 0 && "border-b border-border/40 bg-transparent pt-5 lg:pt-6")}
                      label={isAssistant ? message.agentName || meta.title : "你"}
                      icon={isAssistant ? <Sparkles className="h-3.5 w-3.5 text-primary" /> : <MessageSquare className="h-3.5 w-3.5" />}
                      action={
                        isAssistant && message.content.trim() ? (
                          <button type="button" onClick={() => void handleCopyMessage(message.id, message.content)} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] tracking-normal transition hover:bg-primary/10 hover:text-foreground">
                            <Copy className="h-3 w-3" />
                            {copiedMessageId === message.id ? "已复制" : "复制回复"}
                          </button>
                        ) : null
                      }
                    >
                      {isPendingAssistant ? (
                        <WorkspaceLoadingMessage
                          label={
                            <span className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Loader2 className="h-4 w-4 animate-spin text-primary" />
                              正在等待顾问返回结果...
                            </span>
                          }
                        />
                      ) : (
                        <div className={cn("rounded-[24px] border-2 px-4 py-3.5", isAssistant ? "border-border bg-background text-foreground" : "border-primary bg-primary text-primary-foreground")}>
                          <div className={cn("break-words leading-7 [&_a]:underline [&_a]:underline-offset-4 [&_code]:rounded [&_code]:px-1.5 [&_code]:py-0.5 [&_h1]:my-3 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:my-3 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:my-2 [&_h3]:font-semibold [&_li]:my-1 [&_ol]:my-2 [&_p]:my-2 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:p-3 [&_ul]:my-2 first:[&_p]:mt-0 last:[&_p]:mb-0", isAssistant ? "text-foreground [&_code]:bg-accent/6 [&_pre]:bg-accent [&_pre]:text-accent-foreground" : "text-primary-foreground [&_code]:bg-black/10 [&_pre]:bg-black/10 [&_pre]:text-primary-foreground")}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code({ className, children, ...props }) { const match = /language-(\w+)/.exec(className || ""); if (!match && !className) return <code className={className} {...props}>{children}</code>; return <CodeBlock language={match?.[1]}>{String(children).replace(/\n$/, "")}</CodeBlock>; } }}>{message.content}</ReactMarkdown>
                          </div>
                        </div>
                      )}
                    </WorkspaceMessageFrame>
                  );
                })}
                <div ref={messagesEndRef} className="h-1 w-full" />
              </div>
            )}
          </ScrollArea>
        </div>

        <div className="border-t border-border/70 bg-[#f7f7f7] px-3 py-2.5 lg:px-4 lg:py-3">
          <div className="mx-auto w-full max-w-5xl">
            <WorkspaceComposerPanel
              className="rounded-[24px] border-2 border-border bg-card p-2"
              cardClassName="rounded-[18px] border-2 border-border bg-background"
              bodyClassName="px-2"
              footer={
                <>
                  <p className="text-[11px] leading-5 text-muted-foreground">Enter 发送，Shift + Enter 换行</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="rounded-full border-2 border-border bg-background px-2.5 py-1 text-[10px] text-foreground">{conversationId ? "持续跟进中" : "新线程"}</Badge>
                    <Button className="h-10 rounded-full px-4" onClick={() => void handleSend()} disabled={!inputVal.trim() || isLoading}>{isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}发送</Button>
                  </div>
                </>
              }
            >
              <Textarea ref={composerRef} value={inputVal} onChange={(event) => setInputVal(event.target.value)} onKeyDown={handleComposerKeyDown} placeholder={meta.composerPlaceholder} disabled={isLoading} className="min-h-[80px] border-0 bg-transparent px-2 py-2 text-[14px] leading-6 shadow-none focus-visible:ring-0" />
            </WorkspaceComposerPanel>
          </div>
        </div>
      </section>
    </div>
  );
}
