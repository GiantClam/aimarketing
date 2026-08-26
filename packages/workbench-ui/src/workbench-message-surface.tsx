import React, { type ReactNode } from "react";
import {
  Artifact,
  Attachments,
  AudioPlayer,
  CodeBlock,
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  Image,
  InlineCitation,
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
  Reasoning,
  Source,
  Sources,
  Task,
  Tool,
} from "./ai-elements";
import type { DesktopArtifactData, DesktopUIMessage, DesktopUIMessagePart, DesktopRunStatus } from "@aimarketing/workbench-client";

export type WorkbenchMessageSurfaceProps = {
  readonly messages: readonly DesktopUIMessage[];
  readonly locale?: "zh" | "en";
  readonly pendingMessageId?: string;
  readonly className?: string;
  readonly onCopy?: (message: DesktopUIMessage) => void | Promise<void>;
  readonly onRetry?: (message: DesktopUIMessage) => void | Promise<void>;
  readonly onArtifactOpen?: (artifact: DesktopArtifactData) => void;
  readonly onArtifactDownload?: (artifactId: string) => void;
  readonly onMediaOpen?: (media: Extract<DesktopUIMessagePart, { type: "data-media" }>["data"]) => void;
  readonly emptyState?: ReactNode;
};

function status(value: DesktopRunStatus): "queued" | "running" | "waiting" | "completed" | "failed" | "cancelled" {
  return value;
}

function textParts(message: DesktopUIMessage) {
  return message.parts.filter((part): part is Extract<DesktopUIMessagePart, { type: "text" }> => part.type === "text");
}

function isProcessPart(part: DesktopUIMessagePart) {
  return part.type === "reasoning" || part.type === "dynamic-tool" || part.type === "data-task" || part.type === "data-status";
}

function mediaPart(part: Extract<DesktopUIMessagePart, { type: "data-media" }>, onOpen?: WorkbenchMessageSurfaceProps["onMediaOpen"]) {
  const media = part.data;
  if (media.kind === "image" && media.relativePath) return <button type="button" className="wb-ai-media-result" onClick={() => onOpen?.(media)}><Image src={media.relativePath} alt={media.title} /></button>;
  if (media.kind === "audio" && media.relativePath) return <AudioPlayer src={media.relativePath} title={media.title} />;
  return <button type="button" className="wb-ai-media-result wb-ai-media-result-unavailable" onClick={() => onOpen?.(media)}><strong>{media.title}</strong><small>{media.mimeType}</small></button>;
}

function artifactMedia(artifact: DesktopArtifactData, onOpen?: WorkbenchMessageSurfaceProps["onArtifactOpen"]) {
  if (artifact.mimeType.startsWith("image/")) return <button type="button" className="wb-ai-media-result" onClick={() => onOpen?.(artifact)}><Image src={artifact.relativePath} alt={artifact.title} /></button>;
  if (artifact.mimeType.startsWith("video/")) return <div className="wb-ai-media-result"><video controls preload="metadata" src={artifact.relativePath} aria-label={artifact.title} /><button type="button" onClick={() => onOpen?.(artifact)}>{artifact.title}</button></div>;
  if (artifact.mimeType.startsWith("audio/")) return <AudioPlayer src={artifact.relativePath} title={artifact.title} />;
  return null;
}

function ProcessParts({ message, locale }: { message: DesktopUIMessage; locale: "zh" | "en" }) {
  const process = message.parts.filter(isProcessPart);
  if (!process.length) return null;
  return <section className="wb-ai-execution-process" data-slot="execution-process" aria-label={locale === "zh" ? "执行过程" : "Execution process"}>
    {process.map((part) => {
      if (part.type === "reasoning") return <Reasoning key={`reasoning:${part.providerMetadata?.aimarketing?.partId ?? "assistant"}`} text={part.text} status={part.state === "done" ? "completed" : "running"} isStreaming={part.state !== "done"} locale={locale} />;
      if (part.type === "data-task") return <Task key={part.id} title={part.data.title} status={status(part.data.status)} isStreaming={part.data.status === "running" || part.data.status === "waiting"} locale={locale} steps={part.data.steps?.map((step) => ({ ...step, status: step.status }))} />;
      if (part.type === "dynamic-tool") return <Tool key={`tool:${part.toolCallId}`} toolName={part.toolName} toolCallId={part.toolCallId} input={part.input} output={part.state === "output-available" ? part.output : undefined} error={part.state === "output-error" ? part.errorText : undefined} status={part.state === "approval-requested" ? "waiting" : part.state === "output-available" ? "completed" : part.state === "output-error" ? "failed" : "running"} locale={locale} />;
      return <div key={part.id} className="wb-ai-run-status" data-status={part.data.status}><strong>{locale === "zh" ? "任务状态" : "Task status"}</strong><span>{part.data.message ?? part.data.status}</span></div>;
    })}
  </section>;
}

function MessageParts({ message, locale, onArtifactOpen, onArtifactDownload, onMediaOpen }: Pick<WorkbenchMessageSurfaceProps, "locale" | "onArtifactOpen" | "onArtifactDownload" | "onMediaOpen"> & { message: DesktopUIMessage }) {
  const sources = message.parts.filter((part): part is Extract<DesktopUIMessagePart, { type: "source-url" | "source-document" }> => part.type === "source-url" || part.type === "source-document");
  const artifacts = message.parts.filter((part): part is Extract<DesktopUIMessagePart, { type: "data-artifact" }> => part.type === "data-artifact");
  const media = message.parts.filter((part): part is Extract<DesktopUIMessagePart, { type: "data-media" }> => part.type === "data-media");
  const files = message.parts.filter((part): part is Extract<DesktopUIMessagePart, { type: "file" }> => part.type === "file");
  const reports = message.parts.filter((part): part is Extract<DesktopUIMessagePart, { type: "data-report" }> => part.type === "data-report");
  return <>
    {message.role === "assistant" ? <ProcessParts message={message} locale={locale ?? "zh"} /> : null}
    {files.length ? <Attachments variant="grid" items={files.map((part, index) => ({ id: `file:${index}`, name: part.filename ?? "Attachment", mediaType: part.mediaType, uri: part.url }))} /> : null}
    {media.length ? <div className="wb-ai-media-results" data-slot="media-results">{media.map((part) => <div key={part.id}>{mediaPart(part, onMediaOpen)}</div>)}</div> : null}
    {textParts(message).map((part, index) => <MessageResponse key={`text:${index}`} content={part.text} />)}
    {sources.length ? <Sources>{sources.map((part) => { const title = part.type === "source-url" ? part.title ?? part.url : part.title; const href = part.type === "source-url" ? part.url : undefined; return <Source key={part.sourceId} title={title} href={href}><InlineCitation title={title} href={href}>{title}</InlineCitation></Source>; })}</Sources> : null}
    {reports.length ? <div className="wb-ai-report-results" data-slot="report-results">{reports.map((part) => <section key={part.id} className="wb-ai-report"><strong>{part.data.title}</strong>{part.data.body ? <><MessageResponse content={part.data.body} /><CodeBlock code={part.data.body} language="markdown" /></> : null}</section>)}</div> : null}
    {artifacts.length ? <div className="wb-ai-artifact-results" data-slot="artifact-results">{artifacts.map((part) => <div key={part.id}>{artifactMedia(part.data, onArtifactOpen)}<Artifact title={part.data.title} description={part.data.mimeType} onOpen={() => onArtifactOpen?.(part.data)} actions={<button type="button" onClick={() => onArtifactDownload?.(part.data.id)}>{locale === "zh" ? "下载" : "Download"}</button>}><span>{part.data.relativePath}</span></Artifact></div>)}</div> : null}
    {message.parts.some((part) => part.type.startsWith("data-") && !["data-task", "data-status", "data-artifact", "data-media", "data-warning", "data-usage", "data-attachment", "data-workflow", "data-report"].includes(part.type)) ? <div className="wb-ai-unavailable-part" role="status">{locale === "zh" ? "部分内容暂不可用" : "Some content is unavailable"}</div> : null}
  </>;
}

export function WorkbenchMessageSurface({ messages, locale = "zh", pendingMessageId, className = "", onCopy, onRetry, onArtifactOpen, onArtifactDownload, onMediaOpen, emptyState }: WorkbenchMessageSurfaceProps) {
  return <Conversation className={`wb-ai-message-surface ${className}`} data-uimessage-surface="true" scrollButtonLabel={locale === "zh" ? "滚动到最新消息" : "Scroll to latest"}>
    <ConversationContent>
      {!messages.length ? <ConversationEmptyState>{emptyState ?? (locale === "zh" ? "开始一段新的对话" : "Start a new conversation")}</ConversationEmptyState> : messages.map((message) => <Message key={message.id} from={message.role === "user" ? "user" : "assistant"} data-message-id={message.id} data-model-id={message.metadata?.modelId}>
        <MessageContent>
          <MessageParts message={message} locale={locale} onArtifactOpen={onArtifactOpen} onArtifactDownload={onArtifactDownload} onMediaOpen={onMediaOpen} />
          <MessageActions>
            {onCopy ? <MessageAction label={locale === "zh" ? "复制消息" : "Copy message"} onClick={() => void onCopy(message)} /> : null}
            {onRetry && message.role === "assistant" ? <MessageAction label={locale === "zh" ? "重试并创建分支" : "Retry as branch"} onClick={() => void onRetry(message)}>↻</MessageAction> : null}
            {pendingMessageId === message.id ? <span className="wb-ai-streaming-indicator" aria-live="polite">{locale === "zh" ? "生成中…" : "Streaming…"}</span> : null}
          </MessageActions>
        </MessageContent>
      </Message>)}
    </ConversationContent>
  </Conversation>;
}
