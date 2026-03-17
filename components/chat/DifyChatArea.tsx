"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./CodeBlock";
import {
    findAdvisorPendingTask,
    removePendingAssistantTask,
    savePendingAssistantTask,
    updatePendingAssistantTask,
} from "@/lib/assistant-task-store";

interface Message {
    id: string;
    conversation_id: string;
    role: "user" | "assistant";
    content: string;
    agentName?: string;
}

const ADVISOR_LABEL_MAP: Record<string, string> = {
    "brand-strategy": "品牌战略顾问",
    growth: "增长顾问",
    copywriting: "文案写作专家",
};

function getAdvisorLabel(advisorType: string) {
    return ADVISOR_LABEL_MAP[advisorType] || "专家顾问";
}

function sanitizeAssistantContent(raw: string) {
    let text = raw || "";
    while (true) {
        const start = text.indexOf("<think>");
        if (start < 0) break;
        const end = text.indexOf("</think>", start + "<think>".length);
        if (end < 0) {
            text = text.slice(0, start);
            break;
        }
        text = `${text.slice(0, start)}${text.slice(end + "</think>".length)}`;
    }
    return text.trim();
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
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputVal, setInputVal] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [pendingTaskRefreshKey, setPendingTaskRefreshKey] = useState(0);
    const scrollRef = useRef<HTMLDivElement>(null);
    const historyAbortRef = useRef<AbortController | null>(null);
    const router = useRouter();

    const [conversationId, setConversationId] = useState<string | null>(initialConversationId);

    const messagesEndRef = useRef<HTMLDivElement>(null);

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
        if (viewport) {
            viewport.scrollTop = viewport.scrollHeight;
        }
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [messages, isLoading]);

    const fetchMessages = useCallback(async (convId: string, signal?: AbortSignal) => {
        try {
            const res = await fetch(`/api/dify/messages?user=${user}&conversation_id=${convId}&limit=100&advisorType=${advisorType}`, { signal });
            if (!res.ok) {
                const errorData = await res.json().catch(() => null);
                const details = errorData?.details || errorData?.error || `HTTP ${res.status}`;
                throw new Error(String(details));
            }

            const data = await res.json();
            const apiMessages: Message[] = [];
            (data.data || []).reverse().forEach((msg: any) => {
                apiMessages.push({
                    id: `user_${msg.id}`,
                    conversation_id: msg.conversation_id,
                    role: "user",
                    content: msg.query || msg.inputs?.contents || msg.inputs?.sys_query || ""
                });
                apiMessages.push({
                    id: `asst_${msg.id}`,
                    conversation_id: msg.conversation_id,
                    role: "assistant",
                    content: sanitizeAssistantContent(msg.answer || ""),
                    agentName: advisorLabel,
                });
            });
            setMessages(apiMessages);
        } catch (e) {
            if (signal?.aborted) return;
            if (e instanceof TypeError && e.message.includes("Failed to fetch")) return;
            console.error("Failed to fetch messages", e);
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
    }, [advisorLabel, advisorType, user]);

    useEffect(() => {
        historyAbortRef.current?.abort();

        setConversationId(initialConversationId);
        if (initialConversationId) {
            const controller = new AbortController();
            historyAbortRef.current = controller;
            fetchMessages(initialConversationId, controller.signal);
        } else {
            setMessages([]);
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
                        data?: { status?: string; result?: { conversation_id?: string | null; error?: string } | null }
                    } | null;
                    const status = payload?.data?.status;
                    const nextConversationId = typeof payload?.data?.result?.conversation_id === "string"
                        ? payload.data.result.conversation_id
                        : null;

                    if (nextConversationId && pendingTask.conversationId !== nextConversationId) {
                        updatePendingAssistantTask(pendingTask.taskId, { conversationId: nextConversationId });
                        if (!conversationId) {
                            setConversationId(nextConversationId);
                            window.dispatchEvent(new CustomEvent("dify-refresh", { detail: { advisorType } }));
                            router.replace(`/dashboard/advisor/${advisorType}/${nextConversationId}`);
                        }
                    }

                    if (status === "success") {
                        const targetConversationId = nextConversationId || conversationId;
                        if (targetConversationId) {
                            await fetchMessages(targetConversationId);
                            if (!cancelled) {
                                setConversationId(targetConversationId);
                                window.dispatchEvent(new CustomEvent("dify-refresh", { detail: { advisorType } }));
                            }
                        }
                        removePendingAssistantTask(pendingTask.taskId);
                        if (!cancelled) setIsLoading(false);
                        return;
                    }

                    if (status === "failed") {
                        removePendingAssistantTask(pendingTask.taskId);
                        if (!cancelled) {
                            setIsLoading(false);
                            setMessages((prev) => [
                                ...prev,
                                {
                                    id: `advisor_error_${Date.now()}`,
                                    conversation_id: conversationId || "",
                                    role: "assistant",
                                    content: `请求失败：${payload?.data?.result?.error || "未知错误"}`,
                                    agentName: advisorLabel,
                                },
                            ]);
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
    }, [advisorLabel, advisorType, conversationId, fetchMessages, pendingTaskRefreshKey, router]);

    const handleSend = async () => {
        if (!inputVal.trim() || isLoading) return;
        const currentQuery = inputVal;
        setInputVal("");
        setIsLoading(true);

        const userMessageId = `temp_usr_${Date.now()}`;
        const asstMessageId = `temp_asst_${Date.now()}`;

        setMessages((prev) => [
            ...prev,
            { id: userMessageId, conversation_id: conversationId || "", role: "user", content: currentQuery },
            { id: asstMessageId, conversation_id: conversationId || "", role: "assistant", content: "", agentName: advisorLabel }
        ]);

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
                return newArr;
            });
        };

        try {
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
            setPendingTaskRefreshKey(Date.now());

            if (payloadData.conversation_id && !conversationId) {
                setConversationId(payloadData.conversation_id);
                window.dispatchEvent(new CustomEvent("dify-refresh", { detail: { advisorType } }));
                router.replace(`/dashboard/advisor/${advisorType}/${payloadData.conversation_id}`);
            }
        } catch (e) {
            console.error("Message error", e);
            const errorText = e instanceof Error ? e.message : "未知错误";
            patchAssistant(`请求失败：${errorText}`, advisorLabel);
        } finally {
            setIsLoading(false);
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
                    <p>同一会话通过 conversation_id 自动关联上下文，请求仅发送当前消息。</p>
                    <p>AI 生成内容仅供参考。</p>
                </div>
            </div>
        </div>
    );
}
