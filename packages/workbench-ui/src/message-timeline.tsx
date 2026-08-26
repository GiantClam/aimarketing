"use client";

import React, { useState, type ReactNode } from "react";
import type { WorkbenchArtifact, WorkbenchMessage, WorkbenchMessagePart } from "@aimarketing/workbench-client";
import { renderWorkbenchProcessPart } from "./process-parts";
import { Artifact, Checkpoint, Conversation, ConversationContent, ConversationEmptyState, Message, MessageAction, MessageActions, MessageContent, MessageResponse, Source, Shimmer } from "./ai-elements/index";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export type WorkbenchMessageTimelineProps<TMessage extends WorkbenchMessage = WorkbenchMessage> = {
  messages: readonly TMessage[];
  locale?: "zh" | "en";
  pendingMessageId?: string;
  className?: string;
  onCopy?: (message: TMessage) => void | Promise<void>;
  onArtifactOpen?: (artifact: WorkbenchArtifact) => void;
  onToolApproval?: (part: Extract<WorkbenchMessagePart, { type: "tool-call" }>, decision: "approve" | "reject") => void;
  checkpoints?: readonly { readonly id: string; readonly title: string; readonly description?: string }[];
  onCheckpointRestore?: (checkpointId: string) => void;
  onCheckpointBranch?: (checkpointId: string) => void;
  labels?: { readonly user?: string; readonly assistant?: string };
  renderMessage?: (message: TMessage, index: number) => ReactNode;
};

function formatTimelineTime(value: string, locale: "zh" | "en") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString(locale === "zh" ? "zh-CN" : "en-US", { hour: "2-digit", minute: "2-digit" });
}

function orderedParts(message: WorkbenchMessage): readonly WorkbenchMessagePart[] {
  if (message.parts?.length) {
    return message.parts.map((part, index) => ({ part, index })).sort((left, right) => {
      if (left.part.sequence === undefined || right.part.sequence === undefined) return left.index - right.index;
      return left.part.sequence === right.part.sequence ? left.index - right.index : left.part.sequence - right.part.sequence;
    }).map(({ part }) => part);
  }
  return message.content ? [{ id: `${message.id}:text`, type: "text", text: message.content }] : [];
}

function TimelinePart({ part, locale, user = false, onArtifactOpen, onToolApproval }: { part: WorkbenchMessagePart; locale: "zh" | "en"; user?: boolean; onArtifactOpen?: (artifact: WorkbenchArtifact) => void; onToolApproval?: (part: Extract<WorkbenchMessagePart, { type: "tool-call" }>, decision: "approve" | "reject") => void }) {
  const metadata = {
    ...(typeof part.sequence === "number" ? { "data-sequence": part.sequence } : {}),
    ...(part.createdAt ? { "data-created-at": part.createdAt } : {}),
  };
  if (part.type === "text") return <MessageResponse className={`${user ? "wb-chat-user-body" : "assistant-body"} wb-timeline-text`} content={part.text} {...metadata} />;
  if (part.type === "reasoning") return <div className="wb-timeline-process-part" {...metadata}>{renderWorkbenchProcessPart(part, locale, { onToolApproval })}</div>;
  if (part.type === "plan" || part.type === "task" || part.type === "tool-call") return renderWorkbenchProcessPart(part, locale, { onToolApproval });
  if (part.type === "attachment") return <div className="wb-message-attachment" {...metadata}><span aria-hidden="true">{part.mediaType.startsWith("image/") ? "▧" : "⌕"}</span><span>{part.name}</span><small>{part.mediaType}</small></div>;
  if (part.type === "warning") return <div className="wb-message-event wb-timeline-event" data-status="warning" {...metadata}><span className="wb-event-dot wb-event-running" /><span><strong>{locale === "zh" ? "运行提示" : "Runtime warning"}</strong>{part.message ? ` · ${part.message}` : ""}</span>{part.createdAt ? <time dateTime={part.createdAt}>{formatTimelineTime(part.createdAt, locale)}</time> : null}</div>;
  if (part.type === "tool") return <div className="wb-message-event wb-timeline-event" data-status={part.status} {...metadata}><span className={`wb-event-dot wb-event-${part.status}`} /><span><strong>{part.tool}</strong>{part.message ? ` · ${part.message}` : ""}</span>{part.createdAt ? <time dateTime={part.createdAt}>{formatTimelineTime(part.createdAt, locale)}</time> : null}</div>;
  if (part.type === "status") return <div className="wb-message-event wb-timeline-event" data-status={part.status} {...metadata}><span className={`wb-event-dot wb-event-${part.status}`} /><span>{part.message || part.status}</span>{part.createdAt ? <time dateTime={part.createdAt}>{formatTimelineTime(part.createdAt, locale)}</time> : null}</div>;
  if (part.type === "usage") {
    const inputTokens = part.usage.inputTokens ?? 0;
    const outputTokens = part.usage.outputTokens ?? 0;
    return <div className="wb-message-event wb-timeline-event" data-status="completed" {...metadata}><span className="wb-event-dot wb-event-completed" /><span>{part.usage.model} · {inputTokens} + {outputTokens} {locale === "zh" ? "tokens" : "tokens"}</span>{part.createdAt ? <time dateTime={part.createdAt}>{formatTimelineTime(part.createdAt, locale)}</time> : null}</div>;
  }
  if (part.type === "artifact") return <Artifact title={part.artifact.title || part.artifact.relativePath} className="wb-artifact-card-wrapper" onOpen={() => onArtifactOpen?.(part.artifact)}><button type="button" className="wb-artifact-card" aria-label={`${locale === "zh" ? "打开产物" : "Open artifact"}: ${part.artifact.title}`} onClick={(event) => { event.stopPropagation(); onArtifactOpen?.(part.artifact); }} {...metadata}><span className="wb-artifact-name">{part.artifact.title || part.artifact.relativePath}</span><small>{part.artifact.mimeType}</small>{part.createdAt ? <time dateTime={part.createdAt}>{formatTimelineTime(part.createdAt, locale)}</time> : null}</button></Artifact>;
  if (part.type === "source") return <Source title={part.title} href={part.href} excerpt={part.excerpt} className="wb-message-source" {...metadata} />;
  if (part.type === "report") return <section className="wb-message-report" {...metadata}><strong>{part.title}</strong>{part.body ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.body}</ReactMarkdown> : null}</section>;
  return null;
}

function MessageProcess({ parts, locale, pending, onToolApproval }: { parts: readonly WorkbenchMessagePart[]; locale: "zh" | "en"; pending: boolean; onToolApproval?: (part: Extract<WorkbenchMessagePart, { type: "tool-call" }>, decision: "approve" | "reject") => void }) {
  if (!parts.length) return null;
  const completed = parts.filter((part) => (part.type === "tool" && part.status === "completed") || (part.type === "tool-call" && (part.status === "completed" || part.status === "succeeded")) || (part.type === "reasoning" && part.status === "completed") || (part.type === "plan" && (part.status === "completed" || part.status === "succeeded")) || (part.type === "task" && (part.status === "completed" || part.status === "succeeded")) || (part.type === "status" && part.status === "succeeded") || part.type === "warning" || part.type === "usage").length;
  const hasFailure = parts.some((part) => (part.type === "tool" && part.status === "failed") || (part.type === "tool-call" && part.status === "failed") || (part.type === "reasoning" && part.status === "failed") || (part.type === "plan" && part.status === "failed") || (part.type === "task" && part.status === "failed") || (part.type === "status" && (part.status === "failed" || part.status === "cancelled")));
  const label = locale === "zh" ? "执行过程" : "Process";
  return <details className="wb-message-process" open={pending || hasFailure} data-status={hasFailure ? "failed" : pending ? "running" : "completed"}>
    <summary><span className={`wb-event-dot wb-event-${hasFailure ? "failed" : pending ? "running" : "completed"}`} /><span>{label}</span><small>{completed}/{parts.length}</small></summary>
    <div className="wb-message-process-list">{parts.map((part) => <TimelinePart key={part.id} part={part} locale={locale} onToolApproval={onToolApproval} />)}</div>
  </details>;
}

function DefaultTimelineMessage({ message, locale, pending, copied, onCopy, onArtifactOpen, onToolApproval, labels }: { message: WorkbenchMessage; locale: "zh" | "en"; pending: boolean; copied: boolean; onCopy?: (message: WorkbenchMessage) => void | Promise<void>; onArtifactOpen?: (artifact: WorkbenchArtifact) => void; onToolApproval?: (part: Extract<WorkbenchMessagePart, { type: "tool-call" }>, decision: "approve" | "reject") => void; labels?: { readonly user?: string; readonly assistant?: string } }) {
  const user = message.role === "user";
  const label = user ? (labels?.user || (locale === "zh" ? "你的指令" : "Your Command")) : (labels?.assistant || "AI RESPONSE");
  const copyLabel = locale === "zh" ? "复制回复" : "Copy reply";
  const parts = orderedParts(message);
  const processParts = parts.filter((part) => part.type === "tool" || part.type === "tool-call" || part.type === "reasoning" || part.type === "plan" || part.type === "task" || part.type === "warning" || part.type === "status" || part.type === "usage");
  const textParts = parts.filter((part) => part.type === "text");
  const artifactParts = parts.filter((part) => part.type === "artifact");
  const reportParts = parts.filter((part) => part.type === "report");
  const sourceParts = parts.filter((part) => part.type === "source");
  const bodyParts = textParts;
  const resultParts = [...artifactParts, ...reportParts];
  const processLabel = locale === "zh" ? "生成产物" : "Generated artifacts";
  const sourceLabel = locale === "zh" ? "参考来源" : "References";
  return <Message from={user ? "user" : "assistant"} className={`wb-cloud-message wb-cloud-message-${user ? "user" : "assistant"}`} data-cloud-surface="message" data-message-id={message.id} data-status={message.status}>
    {!user ? <div className="ai-avatar">AI</div> : null}
    <MessageContent className={user ? "message-card-user" : "message-card assistant-message"}>
      <div className={`message-header ${user ? "wb-chat-user-header" : "assistant-message-header"}`}>
        <div className="min-w-0 flex-1"><div className={`dashboard-kicker ${user ? "text-primary" : "text-foreground"}`}>{label}</div><div className="message-time"><time dateTime={message.createdAt}>{formatTimelineTime(message.createdAt, locale)}</time></div></div>
        {!user && message.content ? <MessageActions className="message-actions message-feedback"><MessageAction label={copyLabel} title={copyLabel} onClick={() => void onCopy?.(message)} className="message-feedback-btn">{copied ? "✓" : "⧉"}</MessageAction></MessageActions> : null}
      </div>
      {!user ? <MessageProcess parts={processParts} locale={locale} pending={pending} onToolApproval={onToolApproval} /> : null}
      {pending && !bodyParts.length ? <div className="wb-chat-pending"><span className="wb-chat-pending-dot" /><Shimmer>{locale === "zh" ? "正在生成…" : "Generating…"}</Shimmer></div> : bodyParts.map((part) => <TimelinePart key={part.id} part={part} locale={locale} user={user} onArtifactOpen={onArtifactOpen} onToolApproval={onToolApproval} />)}
      {resultParts.length ? <section className="wb-message-results wb-artifact-section"><div className="wb-artifact-title">✦ {processLabel}</div><div className="wb-artifact-grid">{resultParts.map((part) => <TimelinePart key={part.id} part={part} locale={locale} onArtifactOpen={onArtifactOpen} />)}</div></section> : null}
      {sourceParts.length ? <section className="wb-message-sources"><div className="wb-message-section-title">{sourceLabel}</div>{sourceParts.map((part) => <TimelinePart key={part.id} part={part} locale={locale} onArtifactOpen={onArtifactOpen} />)}</section> : null}
    </MessageContent>
    {user ? <div className="ai-avatar wb-chat-user-avatar" aria-label={label}>U</div> : null}
  </Message>;
}

export function WorkbenchMessageTimeline<TMessage extends WorkbenchMessage = WorkbenchMessage>({ messages, locale = "zh", pendingMessageId, className = "", onCopy, onArtifactOpen, onToolApproval, checkpoints = [], onCheckpointRestore, onCheckpointBranch, labels, renderMessage }: WorkbenchMessageTimelineProps<TMessage>) {
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const copyMessage = async (message: TMessage) => {
    if (!onCopy) return;
    await onCopy(message);
    setCopiedMessageId(message.id);
    globalThis.setTimeout(() => setCopiedMessageId((current) => current === message.id ? null : current), 1400);
  };
  return <Conversation className={`wb-message-timeline ${className}`.trim()} data-cloud-surface="message-timeline" scrollButtonLabel={locale === "zh" ? "滚动到最新消息" : "Scroll to latest"}><ConversationContent>{messages.length ? messages.map((message, index) => renderMessage ? <div className="wb-message-timeline-item" key={message.id}>{renderMessage(message, index)}</div> : <DefaultTimelineMessage key={message.id} message={message} locale={locale} pending={message.id === pendingMessageId} copied={copiedMessageId === message.id} onCopy={copyMessage as ((message: WorkbenchMessage) => void | Promise<void>) | undefined} onArtifactOpen={onArtifactOpen} onToolApproval={onToolApproval} labels={labels} />) : <ConversationEmptyState>{locale === "zh" ? "从第一条指令开始" : "Start with your first instruction"}</ConversationEmptyState>}</ConversationContent>{checkpoints.length ? <div className="ai-elements-checkpoints">{checkpoints.map((checkpoint) => <Checkpoint key={checkpoint.id} title={checkpoint.title} description={checkpoint.description} onRestore={() => onCheckpointRestore?.(checkpoint.id)} onBranch={() => onCheckpointBranch?.(checkpoint.id)} />)}</div> : null}</Conversation>;
}
