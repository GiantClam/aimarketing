"use client";

import React, { createContext, forwardRef, useContext, useEffect, useId, useMemo, useRef, useState, type ButtonHTMLAttributes, type FormEvent, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import remarkGfm from "remark-gfm";
import { Streamdown } from "streamdown";
import { Check, ChevronDown, Copy, Download, ExternalLink, FileText, LoaderCircle, Plus, Search, Send, Square, X } from "lucide-react";

export type AIElementStatus = "queued" | "running" | "streaming" | "waiting" | "blocked" | "completed" | "succeeded" | "failed" | "cancelled" | "denied";

export type AttachmentItem = {
  readonly id: string;
  readonly name: string;
  readonly mediaType?: string;
  readonly uri?: string;
  readonly status?: "queued" | "uploading" | "ready" | "failed";
};

export type ModelOption = {
  readonly id: string;
  readonly label: string;
  readonly provider?: string;
  readonly description?: string;
};

export type PlanStep = { readonly id: string; readonly title: string; readonly status?: AIElementStatus; readonly detail?: string };
export type TaskStep = PlanStep & { readonly toolName?: string };

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function statusLabel(status: AIElementStatus | undefined, locale: "zh" | "en") {
  if (locale === "en") {
    return status === "failed" ? "Failed" : status === "completed" || status === "succeeded" ? "Completed" : status === "denied" ? "Denied" : status === "cancelled" ? "Cancelled" : status === "waiting" ? "Waiting" : status === "queued" ? "Queued" : "Running";
  }
  return status === "failed" ? "失败" : status === "completed" || status === "succeeded" ? "已完成" : status === "denied" ? "已拒绝" : status === "cancelled" ? "已取消" : status === "waiting" ? "等待操作" : status === "queued" ? "排队中" : "运行中";
}

function formatValue(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function Attachments({ items = [], variant = "inline", onRemove, children, className }: { items?: readonly AttachmentItem[]; variant?: "grid" | "inline" | "list"; onRemove?: (id: string) => void; children?: ReactNode; className?: string }) {
  if (!items.length && !children) return null;
  return <div className={cx("ai-elements-attachments", `ai-elements-attachments-${variant}`, "wb-ai-attachments", `wb-ai-attachments-${variant}`, className)} data-slot="attachments" aria-label="Attachments">{children ?? items.map((item) => <Attachment key={item.id} item={item} onRemove={onRemove} />)}</div>;
}

export function Attachment({ item, onRemove, children }: { item: AttachmentItem; onRemove?: (id: string) => void; children?: ReactNode }) {
  return <div className="ai-elements-attachment wb-ai-attachment" data-attachment-id={item.id} data-status={item.status ?? "ready"}>{children ?? <><AttachmentPreview item={item} /><AttachmentInfo item={item} />{onRemove ? <AttachmentRemove name={item.name} onClick={() => onRemove(item.id)} /> : null}</>}</div>;
}

export function AttachmentPreview({ item }: { item: AttachmentItem }) {
  const image = item.mediaType?.startsWith("image/");
  return <span className="ai-elements-attachment-preview wb-ai-attachment-preview" aria-hidden="true">{image && item.uri ? <img src={item.uri} alt="" /> : image ? "▧" : item.mediaType?.startsWith("video/") ? "▣" : <FileText size={16} />}</span>;
}

export function AttachmentInfo({ item }: { item: AttachmentItem }) {
  return <span className="ai-elements-attachment-info wb-ai-attachment-info"><strong>{item.name}</strong>{item.mediaType ? <small>{item.mediaType}</small> : null}{item.status && item.status !== "ready" ? <small>{item.status}</small> : null}</span>;
}

export function AttachmentRemove({ name, onClick }: { name: string; onClick: () => void }) {
  return <button type="button" className="ai-elements-attachment-remove wb-ai-attachment-remove" onClick={onClick} aria-label={`Remove attachment: ${name}`} title="Remove attachment"><X size={14} aria-hidden="true" /></button>;
}

export function AttachmentHoverCard({ children }: { children: ReactNode }) {
  return <div className="ai-elements-attachment-hover-card">{children}</div>;
}

type PromptInputContextValue = { status: "ready" | "streaming" | "error"; disabled: boolean; maxHeight?: number | string; attachments: readonly AttachmentItem[]; onRemoveAttachment?: (id: string) => void; onStop?: () => void; locale: "zh" | "en" };
const PromptInputContext = createContext<PromptInputContextValue | null>(null);
function usePromptInputContext() {
  const context = useContext(PromptInputContext);
  if (!context) throw new Error("PromptInput children must be rendered inside PromptInput");
  return context;
}

export function usePromptInputAttachments() {
  const [files, setFiles] = useState<AttachmentItem[]>([]);
  const addAttachments = (incoming: FileList | readonly File[]) => {
    const next = Array.from(incoming).map((file) => ({ id: `${file.name}:${file.size}:${file.lastModified}`, name: file.name, mediaType: file.type || undefined, status: "queued" as const }));
    setFiles((current) => [...current, ...next.filter((file) => !current.some((item) => item.id === file.id))]);
  };
  const removeAttachment = (id: string) => setFiles((current) => current.filter((file) => file.id !== id));
  return { files, addAttachments, removeAttachment };
}

export function PromptInput({ value, onValueChange, onSubmit, onAddAttachments, attachments = [], onRemoveAttachment, status = "ready", isLoading = false, maxHeight, onStop, disabled = false, locale = "zh", children, className, ...props }: { value: string; onValueChange: (value: string) => void; onSubmit: () => void; onAddAttachments?: (files: FileList | null) => void; attachments?: readonly AttachmentItem[]; onRemoveAttachment?: (id: string) => void; status?: "ready" | "streaming" | "error"; isLoading?: boolean; maxHeight?: number | string; onStop?: () => void; disabled?: boolean; locale?: "zh" | "en"; children?: ReactNode; className?: string } & Omit<HTMLAttributes<HTMLFormElement>, "onSubmit">) {
  const resolvedStatus = isLoading ? "streaming" : status;
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (resolvedStatus === "streaming" || disabled || (!value.trim() && !attachments.length)) return;
    onSubmit();
  };
  const dragDepth = useRef(0);
  const [dragActive, setDragActive] = useState(false);
  return <PromptInputContext.Provider value={{ status: resolvedStatus, disabled, maxHeight, attachments, onRemoveAttachment, onStop, locale }}><form {...props} className={cx("ai-elements-prompt-input", "wb-ai-prompt-input", className)} onSubmit={handleSubmit} data-slot="prompt-input" data-status={resolvedStatus} data-drag-active={dragActive ? "true" : undefined} data-dropzone="prompt-input" onDragEnter={(event) => { if (!onAddAttachments || !event.dataTransfer.types.includes("Files")) return; event.preventDefault(); dragDepth.current += 1; setDragActive(true); }} onDragOver={(event) => { if (!onAddAttachments || !event.dataTransfer.types.includes("Files")) return; event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }} onDragLeave={(event) => { if (!onAddAttachments || !event.dataTransfer.types.includes("Files")) return; event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragActive(false); }} onDrop={(event) => { if (!onAddAttachments || !event.dataTransfer.types.includes("Files")) return; event.preventDefault(); dragDepth.current = 0; setDragActive(false); onAddAttachments(event.dataTransfer.files); }}>{children}</form></PromptInputContext.Provider>;
}

export function PromptInputHeader({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div {...props} className={cx("ai-elements-prompt-input-header", "wb-ai-prompt-header", className)} data-slot="prompt-input-header">{children}</div>; }
export function PromptInputBody({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div {...props} className={cx("ai-elements-prompt-input-body", "wb-ai-prompt-body", className)} data-slot="prompt-input-body">{children}</div>; }
export function PromptInputFooter({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div {...props} className={cx("ai-elements-prompt-input-footer", "wb-ai-prompt-footer", className)} data-slot="prompt-input-footer">{children}</div>; }
export function PromptInputTools({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div {...props} className={cx("ai-elements-prompt-input-tools", "wb-ai-prompt-tools", className)} data-slot="prompt-input-tools">{children}</div>; }
export function PromptInputActions({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div {...props} className={cx("ai-elements-prompt-input-actions", "wb-ai-prompt-actions", className)}>{children}</div>; }
export function PromptInputAction({ children, tooltip, className }: { children: ReactNode; tooltip?: ReactNode; className?: string }) { return <span className={cx("ai-elements-prompt-input-action", className)} title={typeof tooltip === "string" ? tooltip : undefined}>{children}</span>; }

export const PromptInputTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function PromptInputTextarea({ className, onKeyDown, style, ...props }, ref) {
  const { status, disabled, maxHeight, locale } = usePromptInputContext();
  return <textarea {...props} ref={ref} className={cx("ai-elements-prompt-input-textarea", "wb-ai-prompt-textarea", className)} style={{ ...style, ...(maxHeight !== undefined ? { maxHeight: typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight } : {}) }} disabled={disabled || status === "streaming"} aria-label={props["aria-label"] ?? (locale === "zh" ? "消息输入" : "Message input")} aria-busy={status === "streaming"} onKeyDown={(event) => { onKeyDown?.(event); if (event.defaultPrevented) return; if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />;
});

export function PromptInputSubmit({ children, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { status, disabled, locale, onStop } = usePromptInputContext();
  if (status === "streaming") return <button {...props} type="button" className={cx("ai-elements-prompt-input-submit", "wb-ai-prompt-stop", className)} aria-label={props["aria-label"] ?? (locale === "zh" ? "停止生成" : "Stop generating")} onClick={props.onClick ?? onStop}><Square size={14} fill="currentColor" aria-hidden="true" />{children}</button>;
  return <button {...props} type="submit" className={cx("ai-elements-prompt-input-submit", "wb-ai-prompt-submit", className)} disabled={disabled || props.disabled} aria-label={props["aria-label"] ?? (locale === "zh" ? "发送" : "Send")}>{children ?? <Send size={16} aria-hidden="true" />}</button>;
}

export function PromptInputButton({ children, className, type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) { return <button {...props} type={type} className={cx("ai-elements-prompt-input-button", "wb-ai-prompt-icon-button", className)}>{children}</button>; }

export function PromptInputActionMenu({ children }: { children: ReactNode }) { return <div className="ai-elements-prompt-input-action-menu">{children}</div>; }
export function PromptInputActionMenuTrigger({ children, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) { return <PromptInputButton {...props} className={cx("ai-elements-prompt-input-action-menu-trigger", className)}>{children ?? <Plus size={16} aria-hidden="true" />}</PromptInputButton>; }
export function PromptInputActionMenuContent({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div {...props} className={cx("ai-elements-prompt-input-action-menu-content", "wb-ai-prompt-file-menu", className)} role="menu">{children}</div>; }
export function PromptInputActionMenuItem({ children, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) { return <button {...props} type="button" role="menuitem" className={cx("ai-elements-prompt-input-action-menu-item", className)}>{children}</button>; }

export function PromptInputSelect({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div {...props} className={cx("ai-elements-prompt-input-select", className)}>{children}</div>; }
export function PromptInputSelectTrigger({ children, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) { return <button {...props} type="button" className={cx("ai-elements-prompt-input-select-trigger", "wb-ai-model-trigger", className)}>{children ?? <><span>Select</span><ChevronDown size={14} aria-hidden="true" /></>}</button>; }
export function PromptInputSelectContent({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div {...props} className={cx("ai-elements-prompt-input-select-content", className)} role="listbox">{children}</div>; }
export function PromptInputSelectItem({ children, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) { return <button {...props} type="button" role="option" className={cx("ai-elements-prompt-input-select-item", className)}>{children}</button>; }
export function PromptInputSelectValue({ children }: { children?: ReactNode }) { return <span>{children}</span>; }

type ModelSelectorContextValue = { models: readonly ModelOption[]; value?: string; onValueChange: (value: string) => void; open: boolean; setOpen: (open: boolean) => void; query: string; setQuery: (query: string) => void; triggerRef: React.MutableRefObject<HTMLButtonElement | null> };
const ModelSelectorContext = createContext<ModelSelectorContextValue | null>(null);
function useModelSelectorContext() { const context = useContext(ModelSelectorContext); if (!context) throw new Error("ModelSelector children must be rendered inside ModelSelector"); return context; }

export function ModelSelector({ models, value, onValueChange, children, defaultOpen = false, triggerProps }: { models: readonly ModelOption[]; value?: string; onValueChange: (value: string) => void; children?: ReactNode; defaultOpen?: boolean; triggerProps?: ButtonHTMLAttributes<HTMLButtonElement> }) {
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const selectorRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target && !selectorRef.current?.contains(target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
  }, [open]);
  const context = { models, value, onValueChange, open, setOpen, query, setQuery, triggerRef };
  return <ModelSelectorContext.Provider value={context}><div ref={selectorRef} className="ai-elements-model-selector wb-ai-model-selector" data-slot="model-selector">{children ?? <><ModelSelectorTrigger {...triggerProps} /><ModelSelectorContent /></>}</div></ModelSelectorContext.Provider>;
}

export function ModelSelectorTrigger({ children, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { models, value, open, setOpen, triggerRef } = useModelSelectorContext();
  const selected = models.find((model) => model.id === value);
  return <button {...props} ref={triggerRef} type="button" className={cx("ai-elements-model-selector-trigger", "wb-ai-model-trigger", className)} aria-haspopup="listbox" aria-expanded={open} aria-label={props["aria-label"] ?? `Select model${selected ? `: ${selected.label}` : ""}`} onClick={() => setOpen(!open)}>{children ?? <><span>{selected?.label ?? "Select model"}</span><ChevronDown size={14} aria-hidden="true" /></>}</button>;
}

export function ModelSelectorContent({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const { open, query, setQuery, models, value, onValueChange, setOpen, triggerRef } = useModelSelectorContext();
  const filtered = useMemo(() => models.filter((model) => `${model.label} ${model.provider ?? ""} ${model.id}`.toLowerCase().includes(query.trim().toLowerCase())), [models, query]);
  if (!open) return null;
  return <div {...props} className={cx("ai-elements-model-selector-content", "wb-ai-model-popover", className)} role="dialog" aria-label="Select model" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); setOpen(false); triggerRef.current?.focus(); } if (event.key === "ArrowDown") { event.preventDefault(); event.currentTarget.querySelector<HTMLButtonElement>('[role="option"]')?.focus(); } }}><ModelSelectorInput value={query} onValueChange={setQuery} autoFocus />{children ?? <ModelSelectorList>{Object.entries(filtered.reduce<Record<string, ModelOption[]>>((groups, model) => { const provider = model.provider ?? "Models"; (groups[provider] ??= []).push(model); return groups; }, {})).map(([provider, providerModels]) => <ModelSelectorGroup key={provider} heading={provider}>{providerModels.map((model) => <ModelSelectorItem key={model.id} model={model} selected={model.id === value} onSelect={() => { onValueChange(model.id); setOpen(false); setQuery(""); triggerRef.current?.focus(); }} />)}</ModelSelectorGroup>)}{!filtered.length ? <ModelSelectorEmpty /> : null}</ModelSelectorList>}</div>;
}

export function ModelSelectorInput({ value, onValueChange, className, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & { value: string; onValueChange: (value: string) => void }) { return <div className="ai-elements-model-selector-input-wrap"><Search size={14} aria-hidden="true" /><input {...props} value={value} onChange={(event) => onValueChange(event.target.value)} className={cx("ai-elements-model-selector-input", "wb-ai-model-search", className)} placeholder={props.placeholder ?? "Search models…"} aria-label={props["aria-label"] ?? "Search models"} /></div>; }
export function ModelSelectorList({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div {...props} className={cx("ai-elements-model-selector-list", "wb-ai-model-list", className)} role="listbox">{children}</div>; }
export function ModelSelectorEmpty({ children }: { children?: ReactNode }) { return <div className="ai-elements-model-selector-empty wb-ai-model-empty">{children ?? "No matching models"}</div>; }
export function ModelSelectorGroup({ heading, children }: { heading: string; children: ReactNode }) { return <div className="ai-elements-model-selector-group wb-ai-model-group"><div className="ai-elements-model-selector-group-heading wb-ai-model-group-label">{heading}</div>{children}</div>; }
export function ModelSelectorItem({ model, selected, onSelect }: { model: ModelOption; selected?: boolean; onSelect: () => void }) { const { setOpen, setQuery, triggerRef } = useModelSelectorContext(); return <button type="button" role="option" aria-selected={selected} className="ai-elements-model-selector-item wb-ai-model-option" onClick={() => { onSelect(); setOpen(false); setQuery(""); triggerRef.current?.focus(); }}><span><strong>{model.label}</strong>{model.description ? <small>{model.description}</small> : null}</span>{selected ? <Check size={14} aria-hidden="true" /> : null}</button>; }
export function ModelSelectorShortcut({ children }: { children: ReactNode }) { return <kbd className="ai-elements-model-selector-shortcut">{children}</kbd>; }
export function ModelSelectorSeparator() { return <div className="ai-elements-model-selector-separator" role="separator" />; }
export function ModelSelectorLogo({ children }: { children: ReactNode }) { return <span className="ai-elements-model-selector-logo">{children}</span>; }
export function ModelSelectorLogoGroup({ children }: { children: ReactNode }) { return <span className="ai-elements-model-selector-logo-group">{children}</span>; }
export function ModelSelectorName({ children }: { children: ReactNode }) { return <span className="ai-elements-model-selector-name">{children}</span>; }

export function Conversation({ children, className, autoScroll = true, scrollButtonLabel, ...props }: HTMLAttributes<HTMLDivElement> & { autoScroll?: boolean; scrollButtonLabel?: string }) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !autoScroll) return;
    const isNearBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 96;
    if (isNearBottom) viewport.scrollTop = viewport.scrollHeight;
  }, [children, autoScroll]);
  return <div {...props} className={cx("ai-elements-conversation", "wb-message-conversation", className)} data-slot="conversation"><div ref={viewportRef} className="ai-elements-conversation-viewport" onScroll={(event) => { const viewport = event.currentTarget; setShowScrollButton(viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight > 96); }}>{children}</div>{showScrollButton ? <ConversationScrollButton aria-label={scrollButtonLabel} title={scrollButtonLabel} onClick={() => { const viewport = viewportRef.current; if (viewport) viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" }); }} /> : null}</div>;
}
export function ConversationContent({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div {...props} className={cx("ai-elements-conversation-content", className)} data-slot="conversation-content">{children}</div>; }
export function ConversationScrollButton({ className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) { return <button {...props} type="button" className={cx("ai-elements-conversation-scroll-button", className)} aria-label={props["aria-label"] ?? "Scroll to latest"} data-slot="conversation-scroll-button">{children ?? <ChevronDown size={16} strokeWidth={2.25} aria-hidden="true" />}</button>; }
export function ConversationDownload({ onClick, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) { return <button {...props} type="button" className={cx("ai-elements-conversation-download", className)} onClick={onClick} aria-label={props["aria-label"] ?? "Download conversation"}><Download size={14} aria-hidden="true" /></button>; }
export function ConversationEmptyState({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div {...props} className={cx("ai-elements-conversation-empty-state", className)} data-slot="conversation-empty-state">{children}</div>; }

export function Message({ from, children, className, ...props }: HTMLAttributes<HTMLElement> & { from: "user" | "assistant" }) { return <article {...props} className={cx("ai-elements-message", `ai-elements-message-${from}`, "wb-ai-message", `wb-ai-message-${from}`, className)} data-message-role={from} data-from={from}>{children}</article>; }
export function MessageContent({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div {...props} className={cx("ai-elements-message-content", "wb-ai-message-content", className)}>{children}</div>; }
export function MessageResponse({ content, children, className, ...props }: HTMLAttributes<HTMLDivElement> & { content?: string }) { return <div {...props} className={cx("ai-elements-message-response", "message-body", className)}>{children ?? <Streamdown mode="static" remarkPlugins={[remarkGfm]}>{content ?? ""}</Streamdown>}</div>; }
export function MessageActions({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div {...props} className={cx("ai-elements-message-actions", className)} data-slot="message-actions">{children}</div>; }
export function MessageAction({ label, children, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label?: string }) { return <button {...props} type="button" className={cx("ai-elements-message-action", className)} aria-label={props["aria-label"] ?? label}>{children ?? <Copy size={14} aria-hidden="true" />}</button>; }
export function MessageBranch({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div {...props} className={cx("ai-elements-message-branch", className)} data-slot="message-branch">{children}</div>; }

export function Reasoning({ children, text, isStreaming = false, status = "running", locale = "zh", className }: { children?: ReactNode; text?: string; isStreaming?: boolean; status?: AIElementStatus; locale?: "zh" | "en"; className?: string }) { if (!text?.trim() && !children) return null; return <details className={cx("ai-elements-reasoning", "wb-ai-process", "wb-ai-reasoning", className)} open={isStreaming || status === "running" || status === "failed"} data-status={status}><summary><span className="wb-ai-process-icon" aria-hidden="true">◉</span><strong>{locale === "zh" ? "推理过程" : "Reasoning"}</strong><span className="wb-ai-process-status">{statusLabel(status, locale)}</span></summary><div className="ai-elements-reasoning-content wb-ai-process-body">{children ?? text}</div></details>; }
export function ChainOfThought({ steps, isStreaming = false, className }: { steps: readonly PlanStep[]; isStreaming?: boolean; className?: string }) { return <details className={cx("ai-elements-chain-of-thought", "wb-ai-process", className)} open={isStreaming}><summary>Chain of Thought <span>{steps.length}</span></summary><ol>{steps.map((step) => <li key={step.id} data-status={step.status}><span>{step.title}</span><small>{statusLabel(step.status, "en")}</small></li>)}</ol></details>; }
export function Plan({ title = "Plan", description, steps, isStreaming = false, status = "running", locale = "zh", className }: { title?: string; description?: string; steps: readonly PlanStep[]; isStreaming?: boolean; status?: AIElementStatus; locale?: "zh" | "en"; className?: string }) { return <details className={cx("ai-elements-plan", "wb-ai-process", "wb-ai-plan", className)} open={isStreaming || status === "running" || status === "failed"} data-status={status}><summary><span className="wb-ai-process-icon" aria-hidden="true">☷</span><strong>{title}</strong><span className="wb-ai-process-status">{statusLabel(status, locale)}</span></summary>{description ? <p>{description}</p> : null}<ol className="wb-ai-plan-steps">{steps.map((step) => <li key={step.id} data-status={step.status}><span aria-hidden="true">{step.status === "completed" || step.status === "succeeded" ? "✓" : step.status === "failed" ? "!" : "·"}</span><span><strong>{step.title}</strong>{step.detail ? <small>{step.detail}</small> : null}</span><em>{statusLabel(step.status, locale)}</em></li>)}</ol></details>; }
export function Task({ title, description, steps = [], status = "running", isStreaming = false, locale = "zh", className }: { title: string; description?: string; steps?: readonly TaskStep[]; status?: AIElementStatus; isStreaming?: boolean; locale?: "zh" | "en"; className?: string }) { return <details className={cx("ai-elements-task", "wb-ai-process", "wb-ai-task", className)} open={isStreaming || status === "running" || status === "failed"} data-status={status}><summary><span className="wb-ai-process-icon" aria-hidden="true">□</span><strong>{title}</strong><span className="wb-ai-process-status">{statusLabel(status, locale)}</span></summary>{description ? <p>{description}</p> : null}{steps.length ? <ol className="wb-ai-plan-steps">{steps.map((step) => <li key={step.id} data-status={step.status}><span aria-hidden="true">{step.status === "completed" || step.status === "succeeded" ? "✓" : "·"}</span><span><strong>{step.title}</strong>{step.toolName ? <small>{step.toolName}</small> : null}</span><em>{statusLabel(step.status, locale)}</em></li>)}</ol> : null}</details>; }
export function Tool({ toolName, toolCallId, input, output, error, status = "running", locale = "zh", children, className }: { toolName: string; toolCallId?: string; input?: unknown; output?: unknown; error?: string; status?: AIElementStatus; locale?: "zh" | "en"; children?: ReactNode; className?: string }) { return <details className={cx("ai-elements-tool", "wb-ai-process", "wb-ai-tool", className)} open={status === "running" || status === "failed" || status === "waiting"} data-status={status}><summary><span className="wb-ai-process-icon" aria-hidden="true">⚒</span><strong>{toolName}</strong><span className="wb-ai-process-status">{status === "waiting" ? (locale === "zh" ? "等待审批" : "Awaiting approval") : statusLabel(status, locale)}</span></summary><div className="ai-elements-tool-body wb-ai-tool-body">{toolCallId ? <small>{toolCallId}</small> : null}{input !== undefined ? <pre><code>{formatValue(input)}</code></pre> : null}{output !== undefined ? <pre><code>{formatValue(output)}</code></pre> : null}{error ? <div className="wb-ai-tool-error">{error}</div> : null}{children}</div></details>; }
export function Shimmer({ children, duration = 1.5, className }: { children: ReactNode; duration?: number; className?: string }) { return <span className={cx("ai-elements-shimmer", className)} style={{ animationDuration: `${duration}s` }}>{children}</span>; }
export function Suggestion({ children, onClick, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) { return <button {...props} type="button" onClick={onClick} className={cx("ai-elements-suggestion", className)}>{children}</button>; }
export function Suggestions({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) { return <div {...props} className={cx("ai-elements-suggestions", className)}>{children}</div>; }

export function Confirmation({ status = "approval-requested", children, onApprove, onReject, className }: { status?: "approval-requested" | "approval-responded" | "output-denied" | "output-available"; children?: ReactNode; onApprove?: () => void; onReject?: () => void; className?: string }) { return <section className={cx("ai-elements-confirmation", className)} data-status={status}><div>{children ?? (status === "approval-requested" ? "Approval required" : status === "output-denied" ? "Tool denied" : "Tool result")}</div>{status === "approval-requested" ? <div className="ai-elements-confirmation-actions"><button type="button" onClick={onReject}>Reject</button><button type="button" onClick={onApprove}>Approve</button></div> : null}</section>; }
export function Queue({ items, children, className }: { items?: readonly { id: string; title: string; status?: AIElementStatus }[]; children?: ReactNode; className?: string }) { return <section className={cx("ai-elements-queue", className)}>{children ?? items?.map((item) => <div key={item.id} data-status={item.status ?? "queued"}><span>{item.title}</span><small>{statusLabel(item.status ?? "queued", "en")}</small></div>)}</section>; }
export function Checkpoint({ title = "Checkpoint", description, onRestore, onBranch, className }: { title?: string; description?: string; onRestore?: () => void; onBranch?: () => void; className?: string }) { return <section className={cx("ai-elements-checkpoint", className)}><strong>{title}</strong>{description ? <p>{description}</p> : null}<div><button type="button" onClick={onRestore}>Restore</button><button type="button" onClick={onBranch}>Branch</button></div></section>; }
export function CheckpointIcon({ children }: { children?: ReactNode }) { return <span className="ai-elements-checkpoint-icon">{children ?? "↺"}</span>; }
export function Context({ maxTokens, usedTokens, usage, modelId, children, className }: { maxTokens?: number; usedTokens?: number; usage?: { inputTokens?: number; outputTokens?: number; reasoningTokens?: number; cachedTokens?: number; cost?: number }; modelId?: string; children?: ReactNode; className?: string }) { const percentage = maxTokens && usedTokens !== undefined ? Math.min(100, Math.round((usedTokens / maxTokens) * 100)) : undefined; return <section className={cx("ai-elements-context", className)} data-model-id={modelId}>{children ?? <><strong>Context</strong>{percentage !== undefined ? <span>{percentage}% used</span> : null}{usage ? <small>{usage.inputTokens ?? 0} input · {usage.outputTokens ?? 0} output{usage.reasoningTokens ? ` · ${usage.reasoningTokens} reasoning` : ""}</small> : null}</>}</section>; }
export function Sources({ children, className }: { children: ReactNode; className?: string }) { return <section className={cx("ai-elements-sources", className)}>{children}</section>; }
export function Source({ title, href, excerpt, children, className, ...props }: HTMLAttributes<HTMLElement> & { title: string; href?: string; excerpt?: string; children?: ReactNode; className?: string }) { return <article {...props} className={cx("ai-elements-source", className)}>{href ? <a href={href}>{title}</a> : <strong>{title}</strong>}{excerpt ? <p>{excerpt}</p> : null}{children}</article>; }
export function InlineCitation({ title, href, children }: { title: string; href?: string; children?: ReactNode }) { return <a className="ai-elements-inline-citation" href={href}>{children ?? title}</a>; }
export function Artifact({ title, description, children, actions, onOpen, className }: { title: string; description?: string; children?: ReactNode; actions?: ReactNode; onOpen?: () => void; className?: string }) { return <article className={cx("ai-elements-artifact", className)}><header><strong>{title}</strong>{description ? <small>{description}</small> : null}{actions}</header><div className="ai-elements-artifact-content" onClick={onOpen}>{children}</div></article>; }
export function CodeBlock({ code, language = "text", children, className }: { code?: string; language?: string; children?: ReactNode; className?: string }) { return <pre className={cx("ai-elements-code-block", className)} data-language={language}><code>{children ?? code}</code></pre>; }
export function Image({ src, alt = "Generated image", className }: { src: string; alt?: string; className?: string }) { return <figure className={cx("ai-elements-image", className)}><img src={src} alt={alt} /></figure>; }
export function OpenInChat({ href, label = "Open in chat", children }: { href: string; label?: string; children?: ReactNode }) { return <a className="ai-elements-open-in-chat" href={href} target="_blank" rel="noreferrer">{children ?? <>{label}<ExternalLink size={14} aria-hidden="true" /></>}</a>; }

export function Branch({ children, className }: { children: ReactNode; className?: string }) { return <section className={cx("ai-elements-branch", className)} data-slot="branch">{children}</section>; }
export function BranchMessages({ children }: { children: ReactNode }) { return <div className="ai-elements-branch-messages">{children}</div>; }
export function BranchSelector({ children }: { children: ReactNode }) { return <div className="ai-elements-branch-selector" role="group">{children}</div>; }
export function BranchPrevious({ onClick, disabled = false, children }: { onClick?: () => void; disabled?: boolean; children?: ReactNode }) { return <button type="button" onClick={onClick} disabled={disabled} aria-label="Previous branch">{children ?? "←"}</button>; }
export function BranchNext({ onClick, disabled = false, children }: { onClick?: () => void; disabled?: boolean; children?: ReactNode }) { return <button type="button" onClick={onClick} disabled={disabled} aria-label="Next branch">{children ?? "→"}</button>; }
export function BranchPage({ current, total }: { current: number; total: number }) { return <span aria-live="polite">{current} / {total}</span>; }

export function FileTree({ children, className }: { children: ReactNode; className?: string }) { return <nav className={cx("ai-elements-file-tree", className)} aria-label="Files">{children}</nav>; }
export function FileTreeItem({ name, path, children }: { name: string; path?: string; children?: ReactNode }) { return <div className="ai-elements-file-tree-item" data-path={path}><span>{name}</span>{children}</div>; }
export function Terminal({ children, title = "Terminal", className }: { children?: ReactNode; title?: string; className?: string }) { return <section className={cx("ai-elements-terminal", className)}><header>{title}</header><pre>{children}</pre></section>; }
export function TestResults({ results, children, className }: { results?: readonly { id: string; name: string; status: "passed" | "failed" | "skipped"; detail?: string }[]; children?: ReactNode; className?: string }) { return <section className={cx("ai-elements-test-results", className)}>{children ?? results?.map((result) => <div key={result.id} data-status={result.status}><strong>{result.name}</strong>{result.detail ? <small>{result.detail}</small> : null}</div>)}</section>; }
export function SchemaDisplay({ schema, children, className }: { schema?: unknown; children?: ReactNode; className?: string }) { return <pre className={cx("ai-elements-schema-display", className)}>{children ?? JSON.stringify(schema, null, 2)}</pre>; }
export function StackTrace({ error, children, className }: { error?: string; children?: ReactNode; className?: string }) { return <pre className={cx("ai-elements-stack-trace", className)}>{children ?? error}</pre>; }
export function WebPreview({ src, title = "Web preview", children, className }: { src?: string; title?: string; children?: ReactNode; className?: string }) { return <section className={cx("ai-elements-web-preview", className)}><header>{title}</header>{children ?? (src ? <iframe title={title} src={src} /> : <span>Preview unavailable</span>)}</section>; }
export function Sandbox({ children, className }: { children: ReactNode; className?: string }) { return <section className={cx("ai-elements-sandbox", className)}>{children}</section>; }
export function JSXPreview({ children, className }: { children: ReactNode; className?: string }) { return <section className={cx("ai-elements-jsx-preview", className)}>{children}</section>; }
export function DataTable({ columns, rows, className }: { columns: readonly string[]; rows: readonly (readonly ReactNode[])[]; className?: string }) { return <div className={cx("ai-elements-data-table", className)}><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>; }

export function Agent({ children, className, ...props }: HTMLAttributes<HTMLElement> & { children: ReactNode }) { return <section {...props} className={cx("ai-elements-agent", className)}>{children}</section>; }
export function AgentHeader({ name, model, children }: { name: string; model?: string; children?: ReactNode }) { return <header className="ai-elements-agent-header"><div><strong>{name}</strong>{model ? <small>{model}</small> : null}</div>{children}</header>; }
export function AgentInstructions({ children }: { children: ReactNode }) { return <div className="ai-elements-agent-instructions">{children}</div>; }
export function AgentTools({ children }: { children: ReactNode }) { return <details className="ai-elements-agent-tools"><summary>Tools</summary>{children}</details>; }
export function AgentTool({ name, description, children }: { name: string; description?: string; children?: ReactNode }) { return <details className="ai-elements-agent-tool"><summary>{name}</summary>{description ? <p>{description}</p> : null}{children}</details>; }
export function AgentOutput({ children }: { children: ReactNode }) { return <details className="ai-elements-agent-output"><summary>Output schema</summary>{children}</details>; }

export type AudioPlayerProps = { src?: string; title?: string; className?: string };
export function AudioPlayer({ src, title = "Audio", className }: AudioPlayerProps) { return <div className={cx("ai-elements-audio-player", className)}><span>{title}</span>{src ? <audio controls src={src} /> : <small>Audio unavailable</small>}</div>; }
export function MicSelector({ devices = [], value, onValueChange, className }: { devices?: readonly { id: string; label: string }[]; value?: string; onValueChange?: (value: string) => void; className?: string }) { return <label className={cx("ai-elements-mic-selector", className)}>Microphone<select value={value} onChange={(event) => onValueChange?.(event.target.value)}><option value="">Default microphone</option>{devices.map((device) => <option key={device.id} value={device.id}>{device.label}</option>)}</select></label>; }
export function SpeechInput({ onTranscript, disabled = false, className }: { onTranscript?: (text: string) => void; disabled?: boolean; className?: string }) { return <button type="button" className={cx("ai-elements-speech-input", className)} disabled={disabled} onClick={() => onTranscript?.("")} aria-label="Start speech input">Speak</button>; }
export function Transcription({ lines, onSeek, className }: { lines: readonly { id: string; text: string; start: number }[]; onSeek?: (start: number) => void; className?: string }) { return <ol className={cx("ai-elements-transcription", className)}>{lines.map((line) => <li key={line.id}><button type="button" onClick={() => onSeek?.(line.start)}>{line.text}</button></li>)}</ol>; }
export function VoiceSelector({ voices = [], value, onValueChange, className }: { voices?: readonly { id: string; name: string; provider?: string }[]; value?: string; onValueChange?: (value: string) => void; className?: string }) { return <label className={cx("ai-elements-voice-selector", className)}>Voice<select value={value} onChange={(event) => onValueChange?.(event.target.value)}><option value="">Select voice</option>{voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.provider ? `${voice.provider} · ` : ""}{voice.name}</option>)}</select></label>; }
export function Persona({ state = "idle", label = "AI", className }: { state?: "idle" | "listening" | "thinking" | "speaking" | "asleep"; label?: string; className?: string }) { return <div className={cx("ai-elements-persona", className)} data-state={state} aria-label={label}>{label}</div>; }

export function Canvas({ children, className, ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) { return <div {...props} className={cx("ai-elements-canvas", className)}>{children}</div>; }
export function Node({ title, description, children, className, bare = false, ...props }: HTMLAttributes<HTMLElement> & { title?: string; description?: string; children?: ReactNode; bare?: boolean }) { return <article {...props} className={cx("ai-elements-node", className)}>{bare ? children : <><header><strong>{title}</strong>{description ? <small>{description}</small> : null}</header>{children}</>}</article>; }
export function Edge({ animated = false, as = "div", children, className, ...props }: { animated?: boolean; as?: "div" | "g"; children?: ReactNode; className?: string } & HTMLAttributes<HTMLElement>) {
  const edgeClassName = cx("ai-elements-edge", animated && "is-animated", className);
  if (as === "g") return <g {...(props as React.SVGProps<SVGGElement>)} className={edgeClassName}>{children}</g>;
  return <div {...props} className={edgeClassName}>{children}</div>;
}
export function Connection({ children, className, ...props }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) { return <div {...props} className={cx("ai-elements-connection", className)}>{children}</div>; }
export function Controls({ children, className, ...props }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) { return <div {...props} className={cx("ai-elements-controls", className)}>{children}</div>; }
export function Panel({ children, position = "top-right", className, ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode; position?: string }) { return <div {...props} className={cx(`ai-elements-panel ai-elements-panel-${position}`, className)}>{children}</div>; }
export function Toolbar({ children, className, ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) { return <div {...props} className={cx("ai-elements-toolbar", className)}>{children}</div>; }

export function copyTextAction(text: string) { return async () => { if (typeof navigator !== "undefined" && navigator.clipboard) await navigator.clipboard.writeText(text); }; }
export const AIElementsIcons = { Check, ChevronDown, Copy, Download, ExternalLink, LoaderCircle, Plus, Search, Send, Square, X };
