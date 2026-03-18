"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./CodeBlock";
import {
    ensureWorkspaceQueryData,
    fetchWorkspaceQueryData,
    getAdvisorMessagesPage,
    getAdvisorMessagesQueryKey,
    invalidateAdvisorConversationQueries,
} from "@/lib/query/workspace-cache";
import {
    ADVISOR_SESSION_CACHE_TTL_MS,
    getAdvisorConversationCache,
    isAdvisorConversationCacheFresh,
    mapAdvisorMessagePageToChatMessages,
    saveAdvisorConversationCache,
    type AdvisorChatMessage,
} from "@/lib/advisor/session-store";
import {
    findAdvisorPendingTask,
    removePendingAssistantTask,
    savePendingAssistantTask,
    updatePendingAssistantTask,
} from "@/lib/assistant-task-store";

type Message = AdvisorChatMessage;

const ADVISOR_LABEL_MAP: Record<string, string> = {
    "brand-strategy": "品牌战略顾问",
    growth: "增长顾问",
    "lead-hunter": "海外猎客",
    copywriting: "文案写作专家",
};

const ADVISOR_INITIAL_MESSAGE_LIMIT = 20;
const ADVISOR_HISTORY_PAGE_SIZE = 20;

function getAdvisorLabel(advisorType: string) {
    return ADVISOR_LABEL_MAP[advisorType] || "专家顾问";
}

function normalizeMessageContent(content: string) {
    return content.trim();
}

function getMessageSignature(message: Message) {
    return [
        message.role,
        normalizeMessageContent(message.content),
        message.agentName || "",
    ].join("|");
}

function areMessageListsEquivalent(left: Message[], right: Message[]) {
    if (left.length !== right.length) return false;
    return left.every((message, index) => getMessageSignature(message) === getMessageSignature(right[index]));
}

function isMessageListPrefix(prefix: Message[], full: Message[]) {
    if (prefix.length > full.length) return false;
    return prefix.every((message, index) => getMessageSignature(message) === getMessageSignature(full[index]));
}

export function DifyChatArea({
    user,
    advisorType,
    initialConversationId
}: {
    user: string;
    advisorType: string;
    initialConversationId: string | null;
}) {
    const advisorLabel = getAdvisorLabel(advisorType);
    const isLeadHunter = advisorType === "lead-hunter";
    const queryClient = useQueryClient();
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputVal, setInputVal] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isConversationLoading, setIsConversationLoading] = useState(Boolean(initialConversationId));
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);
    const [hasMoreHistory, setHasMoreHistory] = useState(false);
    const [historyCursor, setHistoryCursor] = useState<string | null>(null);
    const [pendingTaskRefreshKey, setPendingTaskRefreshKey] = useState(0);
    const scrollRef = useRef<HTMLDivElement>(null);
    const historyAbortRef = useRef<AbortController | null>(null);
    const router = useRouter();

    const [conversationId, setConversationId] = useState<string | null>(initialConversationId);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const historyRestoreRef = useRef<{ height: number; top: number } | null>(null);
    const messagesRef = useRef<Message[]>([]);

    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    useEffect(() => {
        if (scrollRef.current) {
            const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;
            if (viewport) {
                viewport.style.overflowY = "auto";
            }
        }
    }, []);

    useEffect(() => {
        const viewport = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;
        if (historyRestoreRef.current && viewport) {
            viewport.scrollTop = viewport.scrollHeight - historyRestoreRef.current.height + historyRestoreRef.current.top;
            historyRestoreRef.current = null;
            return;
        }
        if (viewport) {
            viewport.scrollTop = viewport.scrollHeight;
        }
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [messages, isLoading]);

    const persistConversationCache = useCallback((
        convId: string,
        nextMessages: Message[],
        nextCursor: string | null,
        nextHasMoreHistory: boolean,
        loadedMessageCount?: number,
    ) => {
        saveAdvisorConversationCache(advisorType, convId, {
            messages: nextMessages,
            historyCursor: nextCursor,
            hasMoreHistory: nextHasMoreHistory,
            loadedMessageCount: loadedMessageCount ?? Math.ceil(nextMessages.length / 2),
            updatedAt: Date.now(),
        });
    }, [advisorType]);

    const fetchMessages = useCallback(async (
        convId: string,
        options?: { firstId?: string | null; append?: boolean; keepCurrentOnError?: boolean; forceRefresh?: boolean; background?: boolean },
    ) => {
        try {
            const limit = options?.append ? ADVISOR_HISTORY_PAGE_SIZE : ADVISOR_INITIAL_MESSAGE_LIMIT;
            const queryKey = getAdvisorMessagesQueryKey(advisorType, convId, limit, options?.firstId);
            const shouldForceRefresh = Boolean(options?.append || options?.forceRefresh);
            const data = shouldForceRefresh
                ? await fetchWorkspaceQueryData(queryClient, {
                    queryKey,
                    queryFn: () => getAdvisorMessagesPage(user, advisorType, convId, limit, options?.firstId),
                })
                : await ensureWorkspaceQueryData(queryClient, {
                    queryKey,
                    queryFn: () => getAdvisorMessagesPage(user, advisorType, convId, limit, options?.firstId),
                });

            const rawMessages = Array.isArray(data.data) ? data.data : [];
            const nextCursor = Boolean(data?.has_more) && rawMessages.length > 0 ? rawMessages[0]?.id ?? null : null;
            setHistoryCursor(nextCursor);
            setHasMoreHistory(Boolean(data?.has_more) && Boolean(nextCursor));
            const serverMessages = mapAdvisorMessagePageToChatMessages(data, advisorLabel);
            setMessages((current) => {
                let resolvedMessages = options?.append ? [...serverMessages, ...current] : serverMessages;

                if (!options?.append && options?.background) {
                    if (areMessageListsEquivalent(current, serverMessages)) {
                        resolvedMessages = current;
                    } else if (isMessageListPrefix(serverMessages, current)) {
                        // Keep the optimistic tail until the backend catches up.
                        resolvedMessages = current;
                    }
                }

                persistConversationCache(
                    convId,
                    resolvedMessages,
                    nextCursor,
                    Boolean(data?.has_more) && Boolean(nextCursor),
                    options?.append ? Math.ceil(resolvedMessages.length / 2) : rawMessages.length,
                );
                return resolvedMessages;
            });
        } catch (e) {
            if (e instanceof TypeError && e.message.includes("Failed to fetch")) return;
            console.error("Failed to fetch messages", e);
            if (options?.append || options?.keepCurrentOnError) {
                return;
            }
            const errorText = e instanceof Error ? e.message : "未知错误";
            setMessages([
                {
                    id: `history_error_${Date.now()}`,
                    conversation_id: convId,
                    role: "assistant",
                    content: `历史消息加载失败：${errorText}`,
                    agentName: advisorLabel,
                },
            ]);
        }
    }, [advisorLabel, advisorType, persistConversationCache, queryClient, user]);

    useEffect(() => {
        historyAbortRef.current?.abort();

        setConversationId(initialConversationId);
        setHistoryCursor(null);
        setHasMoreHistory(false);
        if (initialConversationId) {
            const cachedConversation = getAdvisorConversationCache(advisorType, initialConversationId);
            if (cachedConversation) {
                setMessages(cachedConversation.messages);
                setHistoryCursor(cachedConversation.historyCursor);
                setHasMoreHistory(Boolean(cachedConversation.hasMoreHistory));
                setIsConversationLoading(false);
            } else {
                setMessages([]);
                setIsConversationLoading(true);
            }

            void fetchMessages(initialConversationId, {
                keepCurrentOnError: Boolean(cachedConversation),
                forceRefresh: Boolean(cachedConversation),
                background: Boolean(cachedConversation),
            }).finally(() => setIsConversationLoading(false));
        } else {
            setMessages([]);
            setIsConversationLoading(false);
        }

        return () => {
            historyAbortRef.current?.abort();
        };
    }, [fetchMessages, initialConversationId]);

    useEffect(() => {
        const pendingTask = findAdvisorPendingTask({ advisorType, conversationId });
        if (!pendingTask) return;

        let cancelled = false;
        setIsLoading(true);

        const poll = async () => {
            while (!cancelled) {
                try {
                    const response = await fetch(`/api/tasks/${pendingTask.taskId}`);
                    const payload = await response.json().catch(() => null) as {
                        data?: {
                            status?: string;
                            result?: {
                                conversation_id?: string | null;
                                answer?: string;
                                agent_name?: string;
                                error?: string;
                            } | null
                        }
                    } | null;
                    const status = payload?.data?.status;
                    const taskResult = payload?.data?.result || null;
                    const nextConversationId = typeof payload?.data?.result?.conversation_id === "string"
                        ? payload.data.result.conversation_id
                        : null;

                    if (nextConversationId && pendingTask.conversationId !== nextConversationId) {
                        updatePendingAssistantTask(pendingTask.taskId, { conversationId: nextConversationId });
                        if (!conversationId) {
                            const optimisticMessages = messagesRef.current.map((message) => ({
                                ...message,
                                conversation_id: nextConversationId,
                            }));
                            persistConversationCache(nextConversationId, optimisticMessages, historyCursor, hasMoreHistory);
                            setConversationId(nextConversationId);
                            window.dispatchEvent(new CustomEvent("dify-refresh", { detail: { advisorType } }));
                            router.replace(`/dashboard/advisor/${advisorType}/${nextConversationId}`);
                        }
                    }

                    if (status === "success") {
                        const targetConversationId = nextConversationId || conversationId;
                        if (targetConversationId) {
                            setMessages((prev) => {
                                const next = [...prev];
                                let patchedAssistant = false;

                                for (let index = next.length - 1; index >= 0; index -= 1) {
                                    if (next[index]?.role === "assistant" && !normalizeMessageContent(next[index]?.content || "")) {
                                        next[index] = {
                                            ...next[index],
                                            conversation_id: targetConversationId,
                                            content: typeof taskResult?.answer === "string" ? taskResult.answer : next[index].content,
                                            agentName: typeof taskResult?.agent_name === "string" ? taskResult.agent_name : (next[index].agentName || advisorLabel),
                                        };
                                        patchedAssistant = true;
                                        break;
                                    }
                                }

                                const normalizedNext = next.map((message) => ({
                                    ...message,
                                    conversation_id: message.conversation_id || targetConversationId,
                                }));

                                if (targetConversationId) {
                                    persistConversationCache(targetConversationId, normalizedNext, historyCursor, hasMoreHistory);
                                }

                                if (!patchedAssistant) {
                                    return normalizedNext;
                                }

                                return normalizedNext;
                            });

                            void invalidateAdvisorConversationQueries(queryClient, advisorType, targetConversationId)
                                .then(() => fetchMessages(targetConversationId, {
                                    forceRefresh: true,
                                    keepCurrentOnError: true,
                                    background: true,
                                }))
                                .catch((error) => {
                                    console.error("advisor.messages.reconcile-failed", error);
                                });
                            if (!cancelled) {
                                setConversationId(targetConversationId);
                                window.dispatchEvent(new CustomEvent("dify-refresh", { detail: { advisorType } }));
                                setIsLoading(false);
                            }
                        }
                        removePendingAssistantTask(pendingTask.taskId);
                        if (!targetConversationId && !cancelled) setIsLoading(false);
                        return;
                    }

                    if (status === "failed") {
                        removePendingAssistantTask(pendingTask.taskId);
                        if (!cancelled) {
                            setIsLoading(false);
                            setMessages((prev) => {
                                const next = [...prev];
                                for (let index = next.length - 1; index >= 0; index -= 1) {
                                    if (next[index]?.role === "assistant" && !next[index]?.content?.trim()) {
                                        next[index] = {
                                            ...next[index],
                                            content: `请求失败：${payload?.data?.result?.error || "未知错误"}`,
                                            agentName: advisorLabel,
                                        };
                                        return next;
                                    }
                                }
                                return [
                                    ...prev,
                                    {
                                        id: `advisor_error_${Date.now()}`,
                                        conversation_id: conversationId || "",
                                        role: "assistant",
                                        content: `请求失败：${payload?.data?.result?.error || "未知错误"}`,
                                        agentName: advisorLabel,
                                    },
                                ];
                            });
                        }
                        return;
                    }
                } catch (error) {
                    console.error("advisor.pending-task.poll-failed", error);
                }

                await new Promise((resolve) => window.setTimeout(resolve, 1200));
            }
        };

        void poll();
        return () => {
            cancelled = true;
        };
    }, [advisorLabel, advisorType, conversationId, fetchMessages, pendingTaskRefreshKey, queryClient, router]);

    const loadOlderMessages = async () => {
        if (!conversationId || !historyCursor || isHistoryLoading) return;

        const viewport = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
        if (viewport) {
            historyRestoreRef.current = {
                height: viewport.scrollHeight,
                top: viewport.scrollTop,
            };
        }

        setIsHistoryLoading(true);
        try {
            await fetchMessages(conversationId, { firstId: historyCursor, append: true });
        } catch (error) {
            console.error("advisor.messages.load-more-failed", error);
            historyRestoreRef.current = null;
        } finally {
            setIsHistoryLoading(false);
        }
    };

    const handleSend = async () => {
        if (!inputVal.trim() || isLoading) return;
        const currentQuery = inputVal;
        let taskAccepted = false;
        setInputVal("");
        setIsLoading(true);

        const userMessageId = `temp_usr_${Date.now()}`;
        const asstMessageId = `temp_asst_${Date.now()}`;

        setMessages((prev) => {
            const nextMessages: Message[] = [
                ...prev,
                { id: userMessageId, conversation_id: conversationId || "", role: "user", content: currentQuery },
                { id: asstMessageId, conversation_id: conversationId || "", role: "assistant", content: "", agentName: advisorLabel },
            ];
            if (conversationId) {
                persistConversationCache(conversationId, nextMessages, historyCursor, hasMoreHistory);
            }
            return nextMessages;
        });

        const patchAssistant = (content: string, agentName?: string) => {
            setMessages((prev) => {
                const newArr = [...prev];
                const idx = newArr.findIndex((m) => m.id === asstMessageId);
                if (idx > -1) {
                    newArr[idx] = {
                        ...newArr[idx],
                        content,
                        agentName: agentName || newArr[idx].agentName || advisorLabel,
                    };
                }
                if (conversationId) {
                    persistConversationCache(conversationId, newArr, historyCursor, hasMoreHistory);
                }
                return newArr;
            });
        };

        try {
            await queryClient.cancelQueries({
                queryKey: ["advisor", advisorType, "messages"],
            });

            const payload: any = {
                inputs: { contents: currentQuery },
                query: currentQuery,
                response_mode: "async",
                user,
                advisorType,
            };
            if (conversationId) {
                payload.conversation_id = conversationId;
            }

            const res = await fetch("/api/dify/chat-messages", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => null);
                const details = errorData?.details || errorData?.error || `HTTP ${res.status}`;
                throw new Error(String(details));
            }
            const payloadData = await res.json().catch(() => null) as {
                task_id?: string;
                conversation_id?: string | null;
            } | null;
            if (!payloadData?.task_id) {
                throw new Error("未创建异步任务");
            }

            savePendingAssistantTask({
                taskId: payloadData.task_id,
                scope: "advisor",
                advisorType,
                conversationId: payloadData.conversation_id || conversationId,
                prompt: currentQuery,
                createdAt: Date.now(),
            });
            taskAccepted = true;
            setPendingTaskRefreshKey(Date.now());

            if (payloadData.conversation_id && !conversationId) {
                persistConversationCache(
                    payloadData.conversation_id,
                    [
                        { id: userMessageId, conversation_id: payloadData.conversation_id, role: "user", content: currentQuery },
                        { id: asstMessageId, conversation_id: payloadData.conversation_id, role: "assistant", content: "", agentName: advisorLabel },
                    ] satisfies Message[],
                    null,
                    false,
                    1,
                );
                setConversationId(payloadData.conversation_id);
                window.dispatchEvent(new CustomEvent("dify-refresh", { detail: { advisorType } }));
                router.replace(`/dashboard/advisor/${advisorType}/${payloadData.conversation_id}`);
            }
        } catch (e) {
            console.error("Message error", e);
            const errorText = e instanceof Error ? e.message : "未知错误";
            patchAssistant(`请求失败：${errorText}`, advisorLabel);
        } finally {
            if (!taskAccepted) {
                setIsLoading(false);
            }
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="flex flex-col h-full w-full bg-background relative">
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto scrollbar-hide p-4 sm:p-6 lg:p-8"
            >
                {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-70 space-y-4 pt-20">
                        <MessageSquare className="w-12 h-12 mb-2 opacity-20" />
                        <p>请在下方输入框开始一段新的对话。</p>
                    </div>
                ) : (
                    <div className="space-y-6 max-w-3xl mx-auto pb-6">
                        {hasMoreHistory ? (
                            <div className="flex justify-center">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="rounded-full"
                                    onClick={() => void loadOlderMessages()}
                                    disabled={isHistoryLoading}
                                >
                                    {isHistoryLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                                    加载更多历史
                                </Button>
                            </div>
                        ) : null}
                        {isConversationLoading ? (
                            <div className="flex w-full justify-start">
                                <div className="px-4 py-3 rounded-2xl bg-muted rounded-bl-sm flex items-center gap-2 text-muted-foreground text-sm border border-border/60">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    正在恢复会话...
                                </div>
                            </div>
                        ) : null}
                        {messages.map((msg, idx) => (
                            <div
                                key={msg.id || idx}
                                className={cn(
                                    "flex w-full",
                                    msg.role === "user" ? "justify-end" : "justify-start"
                                )}
                            >
                                <div
                                    className={cn(
                                        "px-4 py-3 rounded-2xl max-w-[90%] md:max-w-[85%] text-sm leading-relaxed shadow-sm",
                                        msg.role === "user"
                                            ? "bg-primary text-primary-foreground rounded-br-sm"
                                            : "bg-card rounded-bl-sm border border-border/60"
                                    )}
                                >
                                    {msg.role === "assistant" && msg.agentName && (
                                        <div className="text-[11px] mb-1 text-muted-foreground font-medium">
                                            {msg.agentName}
                                        </div>
                                    )}
                                    <div
                                        className={cn(
                                            "break-words leading-7 [&_a]:underline [&_a]:underline-offset-4 [&_code]:rounded [&_code]:bg-black/10 [&_code]:px-1.5 [&_code]:py-0.5 [&_h1]:my-3 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:my-3 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:my-2 [&_h3]:font-semibold [&_li]:my-1 [&_ol]:my-2 [&_p]:my-2 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-black/10 [&_pre]:p-3 [&_ul]:my-2 first:[&_p]:mt-0 last:[&_p]:mb-0",
                                            msg.role === "assistant" ? "text-foreground" : "text-primary-foreground"
                                        )}
                                    >
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            components={{
                                                code({ className, children, ...props }) {
                                                    const match = /language-(\w+)/.exec(className || "");
                                                    const isInline = !match && !className;
                                                    if (isInline) {
                                                        return (
                                                            <code className={className} {...props}>
                                                                {children}
                                                            </code>
                                                        );
                                                    }
                                                    return (
                                                        <CodeBlock language={match?.[1]}>
                                                            {String(children).replace(/\n$/, "")}
                                                        </CodeBlock>
                                                    );
                                                },
                                            }}
                                        >
                                            {msg.content}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="flex w-full justify-start">
                                <div className="px-4 py-3 rounded-2xl bg-muted rounded-bl-sm flex items-center gap-2 text-muted-foreground text-sm border-2 border-primary/10">
                                    <span className="animate-pulse">思考中...</span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} className="h-1 w-full" />
                    </div>
                )}
            </div>

            <div className="p-4 border-t bg-background/80 backdrop-blur-sm sticky bottom-0">
                <div className="max-w-3xl mx-auto relative flex items-center gap-2">
                    <Input
                        placeholder="想聊点什么..."
                        value={inputVal}
                        onChange={(e) => setInputVal(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={isLoading}
                        className="pr-12 py-6 rounded-full border-2 transition-colors border-primary/20 focus-visible:ring-primary/50 text-foreground bg-background"
                    />
                    {isLoading ? (
                        <Button
                            size="icon"
                            variant="outline"
                            className="absolute right-1 w-10 h-10 rounded-full"
                            disabled
                        >
                            <Loader2 className="w-4 h-4 animate-spin" />
                        </Button>
                    ) : (
                        <Button
                            size="icon"
                            className="absolute right-1 w-10 h-10 rounded-full transition-all"
                            onClick={handleSend}
                            disabled={!inputVal.trim()}
                        >
                            <Send className="w-4 h-4" />
                        </Button>
                    )}
                </div>
                <div className="text-center mt-2 text-[10px] text-muted-foreground opacity-60 font-manrope space-y-1">
                    <p>{isLeadHunter ? "海外猎客每次仅根据当前搜索条件触发 workflow，历史记录只用于展示。" : "同一会话通过 conversation_id 自动关联上下文，请求仅发送当前消息。"}</p>
                    <p>AI 生成内容仅供参考。</p>
                </div>
            </div>
        </div>
    );
}
