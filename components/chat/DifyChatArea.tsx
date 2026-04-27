"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, FileText, History, Loader2, MessageSquare, Paperclip, Radar, Send, Sparkles, Target, TrendingUp } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useI18n } from "@/components/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ScrollToBottomButton } from "@/components/ui/scroll-to-bottom-button";
import { Textarea } from "@/components/ui/textarea";
import { TextMorph } from "@/components/ui/text-morph";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TypingIndicator } from "@/components/ui/typing-indicator";
import {
  WorkspaceComposerPanel,
  WorkspaceEmptyState,
} from "@/components/workspace/workspace-primitives";
import {
  WorkspaceLoadingMessage,
  WorkspaceMessageFrame,
  WorkspaceTaskEvents,
  WorkspaceConversationSkeleton,
} from "@/components/workspace/workspace-message-primitives";
import { ensureWorkspaceQueryData, fetchWorkspaceQueryData, getAdvisorMessagesPage, getAdvisorMessagesQueryKey, invalidateAdvisorConversationQueries } from "@/lib/query/workspace-cache";
import { getAdvisorConversationCache, mapAdvisorMessagePageToChatMessages, saveAdvisorConversationCache, type AdvisorChatMessage } from "@/lib/advisor/session-store";
import { findAdvisorPendingTask, removePendingAssistantTask, savePendingAssistantTask, updatePendingAssistantTask } from "@/lib/assistant-task-store";
import { arePendingTaskEventsEqual, normalizePendingTaskEvents, type PendingTaskEvent } from "@/lib/assistant-task-events";
import { buildSessionRecoveryPlan } from "@/lib/session-recovery";
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

type LocalizedAdvisorUi = {
  historyLoadFailedPrefix: string;
  unknownError: string;
  requestFailedPrefix: string;
  taskCreatedFailed: string;
  requestSubmitted: string;
  waitingAdvisorResponse: string;
  restoringConversation: string;
  quickStart: string;
  loadEarlierMessages: string;
  enterToSendHint: string;
  contextActive: string;
  newThread: string;
  send: string;
  you: string;
  copyReply: string;
  copied: string;
  copyAssistantReply: string;
  copiedToClipboard: string;
  scrollToLatest: string;
};

const ADVISOR_UI_COPY: Record<"zh" | "en", LocalizedAdvisorUi> = {
  zh: {
    historyLoadFailedPrefix: "加载会话历史失败：",
    unknownError: "未知错误",
    requestFailedPrefix: "请求失败：",
    taskCreatedFailed: "任务创建失败。",
    requestSubmitted: "请求已提交，正在准备分析...",
    waitingAdvisorResponse: "正在等待顾问回复...",
    restoringConversation: "正在恢复顾问会话...",
    quickStart: "快速开始",
    loadEarlierMessages: "加载更早消息",
    enterToSendHint: "Enter 发送，Shift + Enter 换行",
    contextActive: "上下文已激活",
    newThread: "新会话",
    send: "发送",
    you: "你",
    copyReply: "复制回复",
    copied: "已复制",
    copyAssistantReply: "复制助手回复",
    copiedToClipboard: "已复制到剪贴板",
    scrollToLatest: "滚动到最新消息",
  },
  en: {
    historyLoadFailedPrefix: "Failed to load conversation history: ",
    unknownError: "Unknown error",
    requestFailedPrefix: "Request failed: ",
    taskCreatedFailed: "Task was not created.",
    requestSubmitted: "Request submitted, preparing analysis...",
    waitingAdvisorResponse: "Waiting for advisor response...",
    restoringConversation: "Restoring advisor conversation...",
    quickStart: "Quick Start",
    loadEarlierMessages: "Load earlier messages",
    enterToSendHint: "Enter to send, Shift + Enter for newline",
    contextActive: "Context active",
    newThread: "New thread",
    send: "Send",
    you: "You",
    copyReply: "Copy reply",
    copied: "Copied",
    copyAssistantReply: "Copy assistant reply",
    copiedToClipboard: "Copied to clipboard",
    scrollToLatest: "Scroll to latest message",
  },
};

const WORKSPACE_META: Record<string, WorkspaceMeta> = {
  "brand-strategy": {
    icon: Target,
    eyebrow: "Brand Strategy Workspace",
    title: "Brand Strategy Advisor",
    description: "Refine positioning, narrative, and campaign direction within one continuous thread.",
    contextMode: "Multi-turn strategy discussion",
    outputMode: "Decision framework + recommendations",
    focus: ["Positioning and audience", "Value proposition and differentiation", "Homepage message hierarchy"],
    deliverables: ["Positioning assessment", "Narrative structure", "Next-step validation plan"],
    promptTips: ["What do you offer", "Who is your audience", "What problem is most urgent"],
    quickPrompts: [
      "Help me reframe our homepage positioning and value proposition.",
      "Assess whether our target audience is too broad and suggest a clearer narrative.",
      "For a new launch, propose the core brand claim and hero section direction.",
    ],
    composerPlaceholder:
      "Describe your brand, product, target audience, market context, and current challenge.",
    workflowNote: "This advisor keeps context across turns for iterative strategy refinement.",
    complianceNote: "Press Enter for newline, Ctrl/Cmd + Enter to send.",
    emptyTitle: "Keep brand decisions in one continuous thread",
    emptyDescription: "Start with your background, then narrow positioning and narrative step by step.",
    emptyChecklist: ["Brand or product background", "Target audience", "Current messaging issue"],
  },
  growth: {
    icon: TrendingUp,
    eyebrow: "Growth Workspace",
    title: "Growth Advisor",
    description: "Break down goals, channels, experiments, and execution rhythm in one thread.",
    contextMode: "Multi-turn growth planning",
    outputMode: "Strategy decisions + actions",
    focus: ["Channel priority", "Conversion path", "Experiment cadence"],
    deliverables: ["Growth strategy map", "Experiment list", "Action priorities"],
    promptTips: ["Goal and timeframe", "Current channels and constraints", "Biggest bottleneck"],
    quickPrompts: [
      "How can we improve trial signups by 30% in 8 weeks?",
      "Design a 3-week experiment plan for social + website conversion.",
      "We have traffic but unstable qualified leads. Help diagnose and fix.",
    ],
    composerPlaceholder:
      "Describe your growth target, timeline, channels, resource constraints, and current blockers.",
    workflowNote: "This advisor supports continuous follow-up and iteration.",
    complianceNote: "Press Enter for newline, Ctrl/Cmd + Enter to send.",
    emptyTitle: "Keep one growth problem in one continuous thread",
    emptyDescription: "Start from goals and current state, then converge on actions and cadence.",
    emptyChecklist: ["Target metric", "Channel and budget context", "Largest blocker"],
  },
  "lead-hunter": {
    icon: Radar,
    eyebrow: "Lead Search Workspace",
    title: "Lead Hunter",
    description: "Define the lead profile clearly and the workflow returns target leads.",
    contextMode: "Current search criteria only",
    outputMode: "Lead list + next-iteration suggestions",
    focus: ["Region and market", "Industry, company size, role", "Filters and output fields"],
    deliverables: ["Lead list", "Target profile", "Next filtering suggestions"],
    promptTips: ["Be specific", "State required fields", "State exclusions"],
    quickPrompts: [
      "Find DTC beauty brands in US/Canada, 11-200 employees, founder or growth lead.",
      "Search mid-sized AI automation software firms in Germany/Netherlands, CTO or Head of Operations.",
      "Find Australian cross-border e-commerce service firms with a performance marketing lead, excluding agencies.",
    ],
    composerPlaceholder:
      "Provide target profile, region, industry, role, company size, exclusions, and required fields.",
    workflowNote: "Each run uses current search criteria only and does not resend previous context.",
    complianceNote: "Press Enter for newline, Ctrl/Cmd + Enter to send.",
    emptyTitle: "Define this search clearly, then run workflow",
    emptyDescription: "This workspace is optimized for structured retrieval, not open-ended chat.",
    emptyChecklist: ["Region scope", "Industry and role", "Keep/exclude conditions"],
  },
};

WORKSPACE_META["company-search"] = {
  ...WORKSPACE_META["lead-hunter"],
  title: "Company Search",
};

WORKSPACE_META["contact-mining"] = {
  ...WORKSPACE_META["lead-hunter"],
  title: "Contact Mining",
};

const WORKSPACE_META_ZH_OVERRIDES: Record<string, Partial<WorkspaceMeta>> = {
  "brand-strategy": {
    eyebrow: "品牌策略工作台",
    title: "品牌策略顾问",
    description: "在同一条连续对话中迭代品牌定位、叙事与传播方向。",
    contextMode: "多轮策略讨论",
    outputMode: "决策框架 + 建议",
    focus: ["定位与受众", "价值主张与差异化", "首页信息层级"],
    deliverables: ["定位评估", "叙事结构", "下一步验证计划"],
    promptTips: ["你做什么", "目标受众是谁", "当前最紧迫的问题是什么"],
    quickPrompts: [
      "帮我重构首页定位和价值主张。",
      "评估我们的目标受众是否过宽，并给出更清晰的叙事方向。",
      "针对一次新发布，给出品牌核心主张与 Hero 区方向。",
    ],
    composerPlaceholder: "请描述品牌、产品、目标受众、市场背景和当前挑战。",
    workflowNote: "该顾问会跨轮保存上下文，支持持续策略迭代。",
    complianceNote: "Enter 换行，Ctrl/Cmd + Enter 发送。",
    emptyTitle: "把品牌决策放在一条连续会话里",
    emptyDescription: "从背景信息开始，逐步收敛定位与叙事。",
    emptyChecklist: ["品牌或产品背景", "目标受众", "当前信息表达问题"],
  },
  growth: {
    eyebrow: "增长工作台",
    title: "增长顾问",
    description: "在同一会话内拆解目标、渠道、实验与执行节奏。",
    contextMode: "多轮增长规划",
    outputMode: "策略判断 + 行动建议",
    focus: ["渠道优先级", "转化路径", "实验节奏"],
    deliverables: ["增长策略地图", "实验清单", "行动优先级"],
    promptTips: ["目标与时间窗口", "当前渠道与约束", "最大瓶颈"],
    quickPrompts: [
      "我们想在 8 周内把试用注册提升 30%，如何推进？",
      "给我一份为期 3 周的社媒 + 官网转化实验计划。",
      "我们有流量但合格线索不稳定，帮我诊断并给出修复动作。",
    ],
    composerPlaceholder: "请描述增长目标、时间、渠道、资源约束与当前阻塞点。",
    workflowNote: "该顾问支持连续追问与迭代。",
    complianceNote: "Enter 换行，Ctrl/Cmd + Enter 发送。",
    emptyTitle: "把一个增长问题放在一条连续会话里",
    emptyDescription: "先明确目标与现状，再收敛到动作和节奏。",
    emptyChecklist: ["目标指标", "渠道与预算背景", "最大阻塞点"],
  },
  "lead-hunter": {
    eyebrow: "线索检索工作台",
    title: "海外猎客",
    description: "先定义清晰画像，再触发 workflow 返回目标线索。",
    contextMode: "仅使用当前检索条件",
    outputMode: "线索列表 + 下一轮筛选建议",
    focus: ["区域与市场", "行业/公司规模/职位", "筛选条件与输出字段"],
    deliverables: ["线索列表", "目标画像", "下一轮筛选建议"],
    promptTips: ["尽量具体", "说明必需字段", "说明排除条件"],
    quickPrompts: [
      "搜索美国/加拿大 DTC 美妆品牌，11-200 人规模，创始人或增长负责人。",
      "搜索德国/荷兰中型 AI 自动化软件公司，CTO 或运营负责人。",
      "搜索澳洲跨境电商服务商，要求绩效营销负责人，排除代理机构。",
    ],
    composerPlaceholder: "请提供目标画像、区域、行业、职位、公司规模、排除条件和必需字段。",
    workflowNote: "每次仅按当前检索条件执行，不会重复发送历史上下文。",
    complianceNote: "Enter 换行，Ctrl/Cmd + Enter 发送。",
    emptyTitle: "先定义这次检索，再执行 workflow",
    emptyDescription: "该工作台用于结构化检索，不是开放式闲聊。",
    emptyChecklist: ["区域范围", "行业与职位", "保留/排除条件"],
  },
  "company-search": {
    title: "公司搜索",
  },
  "contact-mining": {
    title: "联系人挖掘",
  },
};

function resolveWorkspaceMeta(advisorType: string, locale: "zh" | "en"): WorkspaceMeta {
  const base = WORKSPACE_META[advisorType] ?? WORKSPACE_META["brand-strategy"];
  if (locale !== "zh") return base;
  const leadHunterOverride =
    advisorType === "company-search" || advisorType === "contact-mining"
      ? WORKSPACE_META_ZH_OVERRIDES["lead-hunter"] ?? {}
      : {};
  const override = { ...leadHunterOverride, ...(WORKSPACE_META_ZH_OVERRIDES[advisorType] ?? {}) };
  return {
    ...base,
    ...override,
  };
}

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

function isStaleAssistantSnapshot(server: Message[], current: Message[]) {
  if (server.length > current.length) return false;
  let sawStaleAssistant = false;

  for (let index = 0; index < server.length; index += 1) {
    const serverMessage = server[index];
    const currentMessage = current[index];
    if (!currentMessage || serverMessage.role !== currentMessage.role) return false;

    if (serverMessage.role !== "assistant") {
      if (getMessageSignature(serverMessage) !== getMessageSignature(currentMessage)) return false;
      continue;
    }

    const serverText = normalizeMessageContent(serverMessage.content);
    const currentText = normalizeMessageContent(currentMessage.content);
    const sameAgent = (serverMessage.agentName || "") === (currentMessage.agentName || "");

    if (serverText === currentText && sameAgent) continue;
    if (!serverText && Boolean(currentText)) {
      sawStaleAssistant = true;
      continue;
    }
    return false;
  }

  return sawStaleAssistant;
}

function hasPendingAssistantPlaceholder(messages: Message[]) {
  const latest = messages.at(-1);
  return Boolean(latest && latest.role === "assistant" && !normalizeMessageContent(latest.content));
}

function needsAssistantReconcile(messages: Message[]) {
  if (messages.length === 0) return false;
  if (hasPendingAssistantPlaceholder(messages)) return true;
  const latest = messages.at(-1);
  if (!latest) return false;
  if (latest.role === "assistant" && normalizeMessageContent(latest.content)) {
    return false;
  }
  return true;
}

function extractSseDataBlock(block: string) {
  const raw = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n")
    .trim();
  if (!raw || raw === "[DONE]") return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function consumeSseBuffer(buffer: string) {
  const blocks = buffer.split(/\r?\n\r?\n/);
  const rest = blocks.pop() ?? "";
  const events = blocks.map(extractSseDataBlock).filter((event): event is Record<string, unknown> => Boolean(event));
  return { events, rest };
}

function flushSseBuffer(buffer: string) {
  const trimmed = buffer.trim();
  if (!trimmed) return [] as Record<string, unknown>[];
  const event = extractSseDataBlock(trimmed);
  return event ? [event] : [];
}

function extractText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map(extractText).find((item) => item.length > 0) || "";
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).map(extractText).find((item) => item.length > 0) || "";
  }
  return "";
}

function getObjectRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

const FILE_LINK_EXTENSIONS = new Set([
  "csv",
  "doc",
  "docx",
  "json",
  "pdf",
  "ppt",
  "pptx",
  "txt",
  "xls",
  "xlsx",
  "zip",
])

function getLinkText(children: ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children)
  if (Array.isArray(children)) return children.map(getLinkText).join("")
  return ""
}

function getFileExtensionFromPathname(pathname: string) {
  const match = /\.([a-z0-9]{2,8})$/i.exec(pathname)
  return match?.[1]?.toLowerCase() || ""
}

function getFileNameFromPath(path: string) {
  const decodedPath = decodeURIComponent(path)
  return decodedPath.split(/[\\/]/).filter(Boolean).at(-1) || ""
}

function getFileNameFromSearchParams(searchParams: URLSearchParams) {
  for (const key of ["filename", "file", "key", "name", "download"]) {
    const value = searchParams.get(key)
    if (!value) continue
    const fileName = getFileNameFromPath(value)
    if (fileName) return fileName
  }
  return ""
}

function buildFileLinkMeta(href: unknown, label: string) {
  if (typeof href !== "string" || !href.trim()) return null
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null

  const decodedPathname = decodeURIComponent(url.pathname)
  const pathName = getFileNameFromPath(decodedPathname)
  const searchParamFileName = getFileNameFromSearchParams(url.searchParams)
  const labelName = label.trim()
  const extension =
    getFileExtensionFromPathname(decodedPathname) ||
    getFileExtensionFromPathname(searchParamFileName) ||
    getFileExtensionFromPathname(labelName)
  const looksLikeFile =
    FILE_LINK_EXTENSIONS.has(extension) ||
    /(^|\/)(files?|attachments?|downloads?)(\/|$)/i.test(url.pathname) ||
    url.searchParams.has("filename") ||
    url.searchParams.has("download") ||
    Boolean(searchParamFileName && FILE_LINK_EXTENSIONS.has(getFileExtensionFromPathname(searchParamFileName)))

  if (!looksLikeFile) return null

  return {
    fileName:
      labelName && labelName !== href && !/^https?:\/\//i.test(labelName)
        ? labelName
        : searchParamFileName || pathName || url.hostname,
    extension: extension ? extension.toUpperCase() : "FILE",
    host: url.hostname,
  }
}

function getDifyWorkflowFinishedOutput(payload: Record<string, unknown>) {
  const event = typeof payload.event === "string" ? payload.event : "";
  if (event !== "workflow_finished") return "";
  const data = getObjectRecord(payload.data);
  return extractText(data?.outputs || data?.output || data?.result || payload.output || payload.result);
}

function getDifyStreamChunk(payload: Record<string, unknown>) {
  const data = getObjectRecord(payload.data);
  return extractText(payload.answer) || extractText(data?.text);
}

function getDifyStreamConversationId(payload: Record<string, unknown>) {
  const direct = typeof payload.conversation_id === "string" ? payload.conversation_id : "";
  if (direct.trim()) return direct.trim();
  const data = getObjectRecord(payload.data);
  const nested = typeof data?.conversation_id === "string" ? data.conversation_id : "";
  return nested.trim() || null;
}

function getDifyStreamAgentName(payload: Record<string, unknown>) {
  const direct = typeof payload.agent_name === "string" ? payload.agent_name.trim() : "";
  if (direct) return direct;
  const metadata = getObjectRecord(payload.metadata);
  if (metadata && typeof metadata.agent_name === "string" && metadata.agent_name.trim()) {
    return metadata.agent_name.trim();
  }
  const data = getObjectRecord(payload.data);
  const nestedMetadata = getObjectRecord(data?.metadata);
  if (nestedMetadata && typeof nestedMetadata.agent_name === "string" && nestedMetadata.agent_name.trim()) {
    return nestedMetadata.agent_name.trim();
  }
  return null;
}

function getDifyStreamError(payload: Record<string, unknown>) {
  const direct = extractText(payload.error);
  if (direct.trim()) return direct.trim();
  const data = getObjectRecord(payload.data);
  const nested = extractText(data?.error || data?.message || payload.message);
  return nested.trim() || null;
}

function mapDifyStreamEventToTaskEvent(payload: Record<string, unknown>): PendingTaskEvent | null {
  const event = typeof payload.event === "string" ? payload.event : "";
  if (!event || event === "message" || event === "agent_message" || event === "text_chunk" || event === "ping") {
    return null;
  }
  const now = Date.now();
  const data = getObjectRecord(payload.data);
  const nodeTitle =
    extractText(data?.title || data?.node_name || data?.node_title || data?.node_id || data?.node_type).trim() || "";
  if (event === "workflow_started") {
    return { type: event, label: "Workflow started", status: "running", at: now };
  }
  if (event === "workflow_finished") {
    const error = getDifyStreamError(payload);
    return {
      type: event,
      label: error ? "Workflow failed" : "Workflow completed",
      detail: error || undefined,
      status: error ? "failed" : "completed",
      at: now,
    };
  }
  if (event === "node_started") {
    return {
      type: event,
      label: nodeTitle ? `Node started: ${nodeTitle}` : "Node started",
      status: "running",
      at: now,
    };
  }
  if (event === "node_finished") {
    const error = getDifyStreamError(payload);
    return {
      type: event,
      label: error ? (nodeTitle ? `Node failed: ${nodeTitle}` : "Node failed") : nodeTitle ? `Node completed: ${nodeTitle}` : "Node completed",
      detail: error || undefined,
      status: error ? "failed" : "completed",
      at: now,
    };
  }
  if (event === "message_end") {
    return { type: event, label: "Text generation completed", status: "completed", at: now };
  }
  if (event === "error") {
    const error = getDifyStreamError(payload);
    return {
      type: event,
      label: "Workflow returned an error",
      detail: error || undefined,
      status: "failed",
      at: now,
    };
  }
  return null;
}

export function DifyChatArea({ user, advisorType, initialConversationId }: { user: string; advisorType: string; initialConversationId: string | null }) {
  const { locale } = useI18n();
  const localeKey = locale === "zh" ? "zh" : "en";
  const ui = ADVISOR_UI_COPY[localeKey];
  const meta = useMemo(() => resolveWorkspaceMeta(advisorType, localeKey), [advisorType, localeKey]);
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
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [pendingTaskEvents, setPendingTaskEvents] = useState<PendingTaskEvent[]>([]);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const historyRestoreRef = useRef<{ height: number; top: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<Message[]>([]);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const unsupportedAttachmentInputRef = useRef<HTMLInputElement | null>(null);
  const getViewport = useCallback(
    () => scrollRef.current?.querySelector("[data-slot='scroll-area-viewport']") as HTMLElement | null,
    [],
  );

  const handleUnsupportedAttachment = useCallback((fileList: FileList | null) => {
    if (!fileList?.length) return;
    if (unsupportedAttachmentInputRef.current) unsupportedAttachmentInputRef.current.value = "";
    setMessagesState((prev) => [
      ...prev,
      {
        id: `advisor_attachment_unsupported_${Date.now()}`,
        conversation_id: conversationId || "",
        role: "assistant",
        content: localeKey === "zh" ? "当前顾问工作流暂不支持附件上传或识别，请改用文字描述。" : "This advisor workflow does not support file upload or recognition yet. Please describe the content in text.",
        agentName: meta.title,
      },
    ]);
  }, [conversationId, localeKey, meta.title]);

  useEffect(() => {
    messagesRef.current = messagesState;
  }, [messagesState]);

  useEffect(() => {
    const viewport = getViewport();
    if (!viewport) return;

    if (historyRestoreRef.current) {
      viewport.scrollTop = viewport.scrollHeight - historyRestoreRef.current.height + historyRestoreRef.current.top;
      historyRestoreRef.current = null;
      return;
    }

    if (isNearBottom || isLoading) {
      viewport.scrollTop = viewport.scrollHeight;
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [getViewport, isLoading, isNearBottom, messagesState]);

  useEffect(() => {
    const viewport = getViewport();
    if (!viewport) return;

    const updateNearBottom = () => {
      const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      setIsNearBottom(distanceFromBottom <= 120);
    };

    updateNearBottom();
    viewport.addEventListener("scroll", updateNearBottom, { passive: true });
    return () => viewport.removeEventListener("scroll", updateNearBottom);
  }, [getViewport]);

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
        if (
          !options?.append &&
          options?.background &&
          (
            areMessageListsEquivalent(current, serverMessages) ||
            isMessageListPrefix(serverMessages, current) ||
            isStaleAssistantSnapshot(serverMessages, current)
          )
        ) {
          resolvedMessages = current;
        }
        persistConversationCache(convId, resolvedMessages, nextCursor, Boolean(data?.has_more) && Boolean(nextCursor), options?.append ? Math.ceil(resolvedMessages.length / 2) : rawMessages.length);
        return resolvedMessages;
      });
    } catch (error) {
      if (error instanceof TypeError && error.message.includes("Failed to fetch")) return;
      console.error("advisor.fetch-messages.failed", error);
      if (options?.append || options?.keepCurrentOnError) return;
      setMessagesState([{ id: `history_error_${Date.now()}`, conversation_id: convId, role: "assistant", content: `${ui.historyLoadFailedPrefix}${error instanceof Error ? error.message : ui.unknownError}`, agentName: meta.title }]);
    }
  }, [advisorType, meta.title, persistConversationCache, queryClient, ui.historyLoadFailedPrefix, ui.unknownError, user]);

  useEffect(() => {
    let cancelled = false;
    setConversationId(initialConversationId);
    setHistoryCursor(null);
    setHasMoreHistory(false);
    if (!initialConversationId) {
      setMessagesState([]);
      setIsConversationLoading(false);
      return () => {
        cancelled = true;
      };
    }
    const cached = getAdvisorConversationCache(advisorType, initialConversationId);
    const recovery = buildSessionRecoveryPlan({
      hasCache: Boolean(cached),
      hasVisibleContent: Boolean(cached?.messages.length),
    });
    if (cached) {
      setMessagesState(cached.messages);
      setHistoryCursor(cached.historyCursor);
      setHasMoreHistory(Boolean(cached.hasMoreHistory));
    } else {
      setMessagesState([]);
    }
    setIsConversationLoading(recovery.showLoadingState);
    void fetchMessages(initialConversationId, {
      keepCurrentOnError: recovery.keepCurrentOnError,
      forceRefresh: recovery.forceRefresh,
      background: recovery.reconcileInBackground,
    }).finally(() => setIsConversationLoading(false));
    const shouldStartAssistantReconcile = cached
      ? needsAssistantReconcile(cached.messages)
      : true;

    if (shouldStartAssistantReconcile) {
      void (async () => {
        for (let attempt = 0; attempt < 24 && !cancelled; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, attempt < 8 ? 2500 : 5000));
          if (cancelled) return;
          if (!needsAssistantReconcile(messagesRef.current)) return;
          await fetchMessages(initialConversationId, {
            forceRefresh: true,
            keepCurrentOnError: true,
            background: true,
          });
        }
      })();
    }

    return () => {
      cancelled = true;
    };
  }, [advisorType, fetchMessages, initialConversationId]);

  useEffect(() => {
    const pendingTask = findAdvisorPendingTask({ advisorType, conversationId });
    if (!pendingTask) {
      setPendingTaskEvents([]);
      return;
    }
    let cancelled = false;
    setIsLoading(true);

    const poll = async () => {
      while (!cancelled) {
        try {
          const response = await fetch(`/api/tasks/${pendingTask.taskId}`);
          const payload = (await response.json().catch(() => null)) as { data?: { status?: string; result?: { conversation_id?: string | null; answer?: string; agent_name?: string; error?: string; events?: unknown } | null } } | null;
          const status = payload?.data?.status;
          const taskResult = payload?.data?.result || null;
          const normalizedEvents = normalizePendingTaskEvents(taskResult?.events);
          if (normalizedEvents.length > 0) {
            setPendingTaskEvents((current) => (arePendingTaskEventsEqual(current, normalizedEvents) ? current : normalizedEvents));
          }
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
              window.dispatchEvent(new CustomEvent("dify-refresh", { detail: { advisorType } }));
            }
            removePendingAssistantTask(pendingTask.taskId);
            if (!cancelled) setIsLoading(false);
            setPendingTaskEvents([]);
            return;
          }

          if (status === "failed") {
            removePendingAssistantTask(pendingTask.taskId);
            if (!cancelled) {
              setIsLoading(false);
              setMessagesState((prev) => [...prev.filter((message, index, source) => !(index === source.length - 1 && message.role === "assistant" && !message.content.trim())), { id: `advisor_error_${Date.now()}`, conversation_id: conversationId || "", role: "assistant", content: `${ui.requestFailedPrefix}${taskResult?.error || ui.unknownError}`, agentName: meta.title }]);
            }
            setPendingTaskEvents([]);
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
  }, [advisorType, conversationId, fetchMessages, hasMoreHistory, historyCursor, meta.title, pendingTaskRefreshKey, persistConversationCache, queryClient, router, ui.requestFailedPrefix, ui.unknownError]);

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
    const viewport = getViewport();
    if (viewport) historyRestoreRef.current = { height: viewport.scrollHeight, top: viewport.scrollTop };
    setIsHistoryLoading(true);
    try {
      await fetchMessages(conversationId, { firstId: historyCursor, append: true });
    } finally {
      setIsHistoryLoading(false);
    }
  };

  const handleScrollToBottom = useCallback(() => {
    const viewport = getViewport();
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
    setIsNearBottom(true);
  }, [getViewport]);

  const handleSend = async () => {
    if (!inputVal.trim() || isLoading) return;
    const currentQuery = inputVal.trim();
    setInputVal("");
    setIsLoading(true);
    setPendingTaskEvents([
      {
        type: "request_submitted",
        label: ui.requestSubmitted,
        status: "running",
        at: Date.now(),
      },
    ]);
    const userMessageId = `temp_usr_${Date.now()}`;
    const assistantMessageId = `temp_asst_${Date.now()}`;
    let resolvedConversationId = conversationId;

    setMessagesState((prev) => {
      const nextMessages: Message[] = [...prev, { id: userMessageId, conversation_id: conversationId || "", role: "user", content: currentQuery }, { id: assistantMessageId, conversation_id: conversationId || "", role: "assistant", content: "", agentName: meta.title }];
      if (conversationId) persistConversationCache(conversationId, nextMessages, historyCursor, hasMoreHistory);
      return nextMessages;
    });

    let pendingRouteConversationId: string | null = null;
    let shouldNavigateAfterStream = false;

    const syncConversationId = (nextConversationId: string | null | undefined, options?: { navigate?: boolean }) => {
      const normalized = typeof nextConversationId === "string" ? nextConversationId.trim() : "";
      if (!normalized) return;
      const isFirstConversation = !conversationId && !resolvedConversationId;
      resolvedConversationId = normalized;

      setMessagesState((prev) => {
        const normalizedMessages = prev.map((message) => ({
          ...message,
          conversation_id: message.conversation_id || normalized,
        }));
        persistConversationCache(normalized, normalizedMessages, historyCursor, hasMoreHistory);
        return normalizedMessages;
      });

      if (isFirstConversation) {
        setConversationId(normalized);
        if (options?.navigate) {
          window.dispatchEvent(new CustomEvent("dify-refresh", { detail: { advisorType } }));
          router.replace(`/dashboard/advisor/${advisorType}/${normalized}`);
        } else {
          shouldNavigateAfterStream = true;
          pendingRouteConversationId = normalized;
        }
      }
    };

    const patchAssistantMessage = (content: string, agentName?: string | null, persist = false) => {
      setMessagesState((prev) => {
        let matchedByTempId = false;
        const nextMessages = prev.map((item) => {
          if (item.id !== assistantMessageId) return item;
          matchedByTempId = true;
          return {
            ...item,
            content,
            agentName: agentName || item.agentName || meta.title,
            conversation_id: item.conversation_id || resolvedConversationId || "",
          };
        });

        if (!matchedByTempId) {
          let patchedExistingAssistant = false;
          for (let index = nextMessages.length - 1; index >= 0; index -= 1) {
            const candidate = nextMessages[index];
            if (candidate?.role !== "assistant") continue;
            nextMessages[index] = {
              ...candidate,
              content,
              agentName: agentName || candidate.agentName || meta.title,
              conversation_id: candidate.conversation_id || resolvedConversationId || "",
            };
            patchedExistingAssistant = true;
            break;
          }

          if (!patchedExistingAssistant) {
            nextMessages.push({
              id: `stream_asst_${Date.now()}`,
              conversation_id: resolvedConversationId || "",
              role: "assistant",
              content,
              agentName: agentName || meta.title,
            });
          }
        }

        if (persist && resolvedConversationId) {
          persistConversationCache(resolvedConversationId, nextMessages, historyCursor, hasMoreHistory);
        }
        return nextMessages;
      });
    };

    const submitWithAsyncTaskFallback = async () => {
      let taskAccepted = false;
      try {
        const payload: { inputs: { contents: string }; query: string; response_mode: "async"; user: string; advisorType: string; conversation_id?: string } = { inputs: { contents: currentQuery }, query: currentQuery, response_mode: "async", user, advisorType };
        if (resolvedConversationId) payload.conversation_id = resolvedConversationId;
        const response = await fetch("/api/dify/chat-messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(String(errorData?.details || errorData?.error || `HTTP ${response.status}`));
        }
        const payloadData = (await response.json().catch(() => null)) as { task_id?: string; conversation_id?: string | null } | null;
        if (!payloadData?.task_id) throw new Error(ui.taskCreatedFailed);
        savePendingAssistantTask({ taskId: payloadData.task_id, scope: "advisor", advisorType, conversationId: payloadData.conversation_id || resolvedConversationId, prompt: currentQuery, createdAt: Date.now() });
        taskAccepted = true;
        setPendingTaskRefreshKey(Date.now());
        if (payloadData.conversation_id) {
          syncConversationId(payloadData.conversation_id, { navigate: true });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : ui.unknownError;
        patchAssistantMessage(`${ui.requestFailedPrefix}${message}`, meta.title, true);
        setPendingTaskEvents([]);
        console.error("advisor.send.failed", error);
      } finally {
        if (!taskAccepted) {
          setIsLoading(false);
          setPendingTaskEvents([]);
        }
      }
    };

    try {
      await queryClient.cancelQueries({ queryKey: ["advisor", advisorType, "messages"] });
      const payload: { inputs: { contents: string }; query: string; response_mode: "streaming"; user: string; advisorType: string; conversation_id?: string } = { inputs: { contents: currentQuery }, query: currentQuery, response_mode: "streaming", user, advisorType };
      if (resolvedConversationId) payload.conversation_id = resolvedConversationId;
      const response = await fetch("/api/dify/chat-messages", { method: "POST", headers: { "Content-Type": "application/json", Accept: "text/event-stream" }, body: JSON.stringify(payload) });
      if (!response.ok || !response.body) {
        const errorData = await response.json().catch(() => null);
        throw new Error(String(errorData?.details || errorData?.error || `HTTP ${response.status}`));
      }

      syncConversationId(response.headers.get("x-conversation-id"));

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let accumulated = "";
      let activeAgentName: string | null = meta.title;
      let streamTerminalEventSeen = false;

      const processStreamEvent = (eventPayload: Record<string, unknown>) => {
        const streamedConversationId = getDifyStreamConversationId(eventPayload);
        if (streamedConversationId) {
          syncConversationId(streamedConversationId);
        }

        const agentName = getDifyStreamAgentName(eventPayload);
        if (agentName) {
          activeAgentName = agentName;
        }

        const eventName = typeof eventPayload.event === "string" ? eventPayload.event : "";
        if (eventName === "error") {
          throw new Error(getDifyStreamError(eventPayload) || ui.unknownError);
        }

        const chunk = getDifyStreamChunk(eventPayload);
        if (chunk) {
          accumulated += chunk;
          patchAssistantMessage(accumulated, activeAgentName, false);
          setPendingTaskEvents((current) => {
            const nextEvent: PendingTaskEvent = {
              type: "response_streaming",
              label: ui.waitingAdvisorResponse,
              detail: `${accumulated.length} chars`,
              status: "running",
              at: Date.now(),
            };
            const base = current.filter((item) => item.type !== "response_streaming");
            return [...base, nextEvent];
          });
        }

        const workflowFinishedOutput = getDifyWorkflowFinishedOutput(eventPayload);
        if (!chunk && workflowFinishedOutput && !normalizeMessageContent(accumulated)) {
          accumulated = workflowFinishedOutput;
          patchAssistantMessage(accumulated, activeAgentName, false);
        }

        const mappedEvent = mapDifyStreamEventToTaskEvent(eventPayload);
        if (mappedEvent) {
          setPendingTaskEvents((current) => {
            const base = current.filter((item) => item.type !== mappedEvent.type);
            return [...base, mappedEvent];
          });
        }

        if (eventName === "message_end") {
          streamTerminalEventSeen = true;
        }
      };

      const processEvents = (events: Record<string, unknown>[]) => {
        for (const eventPayload of events) {
          processStreamEvent(eventPayload);
          if (streamTerminalEventSeen) {
            return true;
          }
        }
        return false;
      };

      while (!streamTerminalEventSeen) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = consumeSseBuffer(buffer);
        buffer = parsed.rest;
        if (processEvents(parsed.events)) {
          break;
        }
      }

      if (!streamTerminalEventSeen) {
        buffer += decoder.decode();
        processEvents(flushSseBuffer(buffer));
      }

      if (!normalizeMessageContent(accumulated)) {
        throw new Error("advisor_empty_stream_response");
      }

      if (!resolvedConversationId) {
        try {
          const params = new URLSearchParams({
            user,
            advisorType,
            limit: "1",
          });
          const conversationRes = await fetch(`/api/dify/conversations?${params.toString()}`, { cache: "no-store" });
          if (conversationRes.ok) {
            const payloadData = (await conversationRes.json().catch(() => null)) as { data?: Array<{ id?: string | number | null }> } | null;
            const fallbackConversationId = payloadData?.data?.[0]?.id;
            if (fallbackConversationId != null) {
              syncConversationId(String(fallbackConversationId));
            }
          }
        } catch (error) {
          console.error("advisor.stream.resolve-conversation.failed", error);
        }
      }

      patchAssistantMessage(accumulated, activeAgentName, true);
      setPendingTaskEvents([]);
      setIsLoading(false);

      if (shouldNavigateAfterStream && (pendingRouteConversationId || resolvedConversationId)) {
        const targetConversationId = pendingRouteConversationId || resolvedConversationId;
        if (targetConversationId) {
          setConversationId(targetConversationId);
          window.dispatchEvent(new CustomEvent("dify-refresh", { detail: { advisorType } }));
          router.replace(`/dashboard/advisor/${advisorType}/${targetConversationId}`);
        }
      }

      if (resolvedConversationId) {
        void invalidateAdvisorConversationQueries(queryClient, advisorType, resolvedConversationId)
          .then(() =>
            fetchMessages(resolvedConversationId!, {
              forceRefresh: true,
              keepCurrentOnError: true,
              background: true,
            }),
          )
          .catch((error) => console.error("advisor.stream.reconcile.failed", error));
        window.dispatchEvent(new CustomEvent("dify-refresh", { detail: { advisorType } }));
      }
      return;
    } catch (streamError) {
      console.error("advisor.stream.failed", streamError);
      await submitWithAsyncTaskFallback();
    }
  };

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const shouldRenderConversationSkeleton =
    isConversationLoading && Boolean(conversationId) && messagesState.length === 0;

  return (
    <div className="flex h-full min-h-0 justify-center">
      <section className="flex min-h-0 w-full max-w-6xl flex-col overflow-hidden rounded-b-[28px] rounded-t-none border-x border-b border-t-0 border-border/70 bg-[#f7f7f7] shadow-none">
        <div className="relative min-h-0 flex-1 bg-[#f7f7f7]">
          <ScrollArea ref={scrollRef} className="h-full" viewportClassName="px-3 pb-3 pt-0 lg:px-4 lg:pb-4 lg:pt-0">
            {messagesState.length === 0 ? (
              <div className="mx-auto flex min-h-full w-full max-w-5xl items-center">
                {shouldRenderConversationSkeleton ? (
                      <WorkspaceConversationSkeleton rows={3} loadingLabel={ui.restoringConversation} className="w-full" />
                ) : (
                  <WorkspaceEmptyState
                    icon={<meta.icon className="h-6 w-6" />}
                    title={meta.emptyTitle}
                    description={meta.emptyDescription}
                    checklist={meta.emptyChecklist}
                    quickStartLabel={ui.quickStart}
                    quickPrompts={meta.quickPrompts}
                    onSelectPrompt={(prompt) => {
                      setInputVal(prompt);
                      composerRef.current?.focus();
                    }}
                  />
                )}
              </div>
            ) : (
              <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
                {hasMoreHistory ? (
                  <div className="flex justify-center">
                    <Button variant="outline" size="sm" className="rounded-full border-2 border-border bg-background px-4" onClick={() => void loadOlderMessages()} disabled={isHistoryLoading}>
                      {isHistoryLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <History className="mr-1.5 h-3.5 w-3.5" />}{ui.loadEarlierMessages}
                    </Button>
                  </div>
                ) : null}
                {isConversationLoading ? (
                  <div className="rounded-[24px] border-2 border-dashed border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      {ui.restoringConversation}
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
                      label={isAssistant ? message.agentName || meta.title : ui.you}
                      icon={isAssistant ? <Sparkles className="h-3.5 w-3.5 text-primary" /> : <MessageSquare className="h-3.5 w-3.5" />}
                      action={
                        isAssistant && message.content.trim() ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button type="button" onClick={() => void handleCopyMessage(message.id, message.content)} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] tracking-normal transition hover:bg-primary/10 hover:text-foreground">
                                  <Copy className="h-3 w-3" />
                                  <TextMorph text={copiedMessageId === message.id ? ui.copied : ui.copyReply} />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {copiedMessageId === message.id ? ui.copiedToClipboard : ui.copyAssistantReply}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : null
                      }
                    >
                      {isPendingAssistant ? (
                        <WorkspaceLoadingMessage
                          showTypingIndicator={false}
                          label={
                            <div className="space-y-2 text-sm text-muted-foreground">
                              <span className="flex items-center gap-2">
                                <TypingIndicator />
                                {ui.waitingAdvisorResponse}
                              </span>
                              <WorkspaceTaskEvents events={pendingTaskEvents} limit={4} />
                            </div>
                          }
                        />
                      ) : (
                        <div className={cn("rounded-[24px] border-2 px-4 py-3.5", isAssistant ? "border-border bg-background text-foreground" : "border-primary bg-primary text-primary-foreground")}>
                          <div className={cn("break-words leading-7 [&_a]:underline [&_a]:underline-offset-4 [&_code]:rounded [&_code]:px-1.5 [&_code]:py-0.5 [&_h1]:my-3 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:my-3 [&_h2]:text-base [&_h2]:font-semibold [&_h3]:my-2 [&_h3]:font-semibold [&_li]:my-1 [&_ol]:my-2 [&_p]:my-2 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:p-3 [&_ul]:my-2 first:[&_p]:mt-0 last:[&_p]:mb-0", isAssistant ? "text-foreground [&_code]:bg-accent/6 [&_pre]:bg-accent [&_pre]:text-accent-foreground" : "text-primary-foreground [&_code]:bg-black/10 [&_pre]:bg-black/10 [&_pre]:text-primary-foreground")}>
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                a({ href, children, ...props }) {
                                  const fileLink = buildFileLinkMeta(href, getLinkText(children));
                                  if (fileLink) {
                                    return (
                                      <a
                                        href={href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="my-1 inline-flex max-w-full items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 text-sm text-foreground no-underline shadow-sm transition hover:border-primary/60 hover:bg-primary/5"
                                        {...props}
                                      >
                                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                                          <FileText className="h-4 w-4" />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                          <span className="block truncate font-medium">{fileLink.fileName}</span>
                                          <span className="block truncate text-[11px] leading-4 text-muted-foreground">
                                            {fileLink.extension} · {fileLink.host}
                                          </span>
                                        </span>
                                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                      </a>
                                    );
                                  }
                                  return <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>;
                                },
                                code({ className, children, ...props }) { const match = /language-(\w+)/.exec(className || ""); if (!match && !className) return <code className={className} {...props}>{children}</code>; return <CodeBlock language={match?.[1]}>{String(children).replace(/\n$/, "")}</CodeBlock>; },
                              }}
                            >
                              {message.content}
                            </ReactMarkdown>
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
          <div className="pointer-events-none absolute bottom-4 right-4 z-20">
            <ScrollToBottomButton
              visible={!isNearBottom && messagesState.length > 0}
              onClick={handleScrollToBottom}
              className="pointer-events-auto"
              ariaLabel={ui.scrollToLatest}
            />
          </div>
        </div>

        <div className="border-t border-border/70 bg-[#f7f7f7] px-3 py-2.5 lg:px-4 lg:py-3">
          <div className="mx-auto w-full max-w-5xl">
            <WorkspaceComposerPanel
              className="rounded-[24px] border-2 border-border bg-card p-2"
              cardClassName="rounded-[18px] border-2 border-border bg-background"
              bodyClassName="px-2"
              footer={
                <>
                  <p className="text-[11px] leading-5 text-muted-foreground">{ui.enterToSendHint}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="rounded-full border-2 border-border bg-background px-2.5 py-1 text-[10px] text-foreground">{conversationId ? ui.contextActive : ui.newThread}</Badge>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 rounded-full px-3"
                      onClick={() => unsupportedAttachmentInputRef.current?.click()}
                      disabled={isLoading}
                      aria-label={localeKey === "zh" ? "上传附件" : "Upload attachment"}
                    >
                      <Paperclip className="h-4 w-4" />
                    </Button>
                    <Button className="h-10 rounded-full px-4" onClick={() => void handleSend()} disabled={!inputVal.trim() || isLoading}>{isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}{ui.send}</Button>
                  </div>
                </>
              }
            >
              <input
                ref={unsupportedAttachmentInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => handleUnsupportedAttachment(event.target.files)}
              />
              <Textarea ref={composerRef} value={inputVal} onChange={(event) => setInputVal(event.target.value)} onKeyDown={handleComposerKeyDown} placeholder={meta.composerPlaceholder} disabled={isLoading} className="min-h-[80px] border-0 bg-transparent px-2 py-2 text-[14px] leading-6 shadow-none focus-visible:ring-0" />
            </WorkspaceComposerPanel>
          </div>
        </div>
      </section>
    </div>
  );
}
