"use client";

import React, { useEffect, useRef, type ReactNode } from "react";
import { Attachment, AttachmentInfo, AttachmentPreview, AttachmentRemove, Attachments, ModelSelector, ModelSelectorContent, ModelSelectorEmpty, ModelSelectorGroup, ModelSelectorInput, ModelSelectorItem, ModelSelectorList, ModelSelectorLogo, ModelSelectorName, ModelSelectorTrigger, PromptInput, PromptInputActionAddAttachments, PromptInputActionMenu, PromptInputActionMenuContent, PromptInputActionMenuTrigger, PromptInputBody, PromptInputFooter, PromptInputSelect, PromptInputSubmit, PromptInputTextarea, PromptInputTools, PromptInputHeader } from "./ai-elements/index";

export type WorkbenchAttachmentItem = { readonly id: string; readonly name: string; readonly mediaType?: string; readonly uri?: string; readonly status?: "queued" | "uploading" | "ready" | "failed"; readonly error?: string };
export type WorkbenchModelOption = { readonly id: string; readonly label: string; readonly provider?: string; readonly description?: string };

function modelBadge(provider?: string) {
  const normalized = provider?.trim();
  if (!normalized || /[\u3400-\u9fff]/u.test(normalized)) return "AI";
  return normalized.slice(0, 2).toUpperCase();
}

export function WorkbenchAttachments({ attachments, variant = "inline", onRemove, onRetry, locale = "zh" }: { attachments: readonly WorkbenchAttachmentItem[]; variant?: "grid" | "inline" | "list"; onRemove?: (id: string) => void; onRetry?: (id: string) => void; locale?: "zh" | "en" }) {
  if (!attachments.length) return null;
  const retry = (id: string) => {
    if (onRetry) onRetry(id);
    else if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("coworkany:attachment-retry", { detail: { id } }));
  };
  return <Attachments variant={variant} items={attachments}><>{attachments.map((attachment) => <Attachment key={attachment.id} item={attachment} onRemove={onRemove ? () => onRemove(attachment.id) : undefined} className={attachment.status === "failed" ? "is-failed" : undefined}><AttachmentPreview /><AttachmentInfo />{attachment.status === "failed" ? <button type="button" className="ai-elements-attachment-retry wb-ai-attachment-retry" onClick={() => retry(attachment.id)} aria-label={`${locale === "zh" ? "重试附件" : "Retry attachment"}: ${attachment.name}`}>{locale === "zh" ? "重试" : "Retry"}</button> : null}<AttachmentRemove label={locale === "zh" ? "移除附件" : "Remove attachment"} /></Attachment>)}</></Attachments>;
}

export function WorkbenchModelSelector({ models, value, onChange, disabled = false, locale = "zh" }: { models: readonly WorkbenchModelOption[]; value?: string; onChange: (value: string) => void; disabled?: boolean; locale?: "zh" | "en" }) {
  const selected = models.find((model) => model.id === value);
  const [query, setQuery] = React.useState("");
  const filtered = React.useMemo(() => models.filter((model) => `${model.label} ${model.provider ?? ""} ${model.id}`.toLowerCase().includes(query.trim().toLowerCase())), [models, query]);
  const groups = React.useMemo(() => Object.entries(filtered.reduce<Record<string, WorkbenchModelOption[]>>((result, model) => { const provider = model.provider ?? (locale === "zh" ? "模型" : "Models"); (result[provider] ??= []).push(model); return result; }, {})), [filtered, locale]);
  return <div aria-disabled={disabled || undefined}><ModelSelector>
    <ModelSelectorTrigger asChild disabled={disabled}>
      <button type="button" className="ai-elements-model-selector-trigger wb-ai-model-trigger" aria-haspopup="dialog" aria-label={locale === "zh" ? `选择模型${value ? `：${selected?.label ?? ""}` : ""}` : `Select model${value ? `: ${selected?.label ?? ""}` : ""}`}>
        <span className="wb-ai-model-trigger-value">{selected ? <><ModelSelectorLogo>{modelBadge(selected.provider)}</ModelSelectorLogo><ModelSelectorName>{selected.label}</ModelSelectorName></> : locale === "zh" ? "选择模型" : "Select model"}</span><span aria-hidden="true">⌄</span>
      </button>
    </ModelSelectorTrigger>
    <ModelSelectorContent>
      <ModelSelectorInput value={query} onValueChange={setQuery} autoFocus />
      <ModelSelectorList>{groups.map(([provider, providerModels]) => <ModelSelectorGroup key={provider} heading={provider}>{providerModels.map((model) => <ModelSelectorItem key={model.id} value={`${model.label} ${model.provider ?? ""} ${model.id}`} onSelect={() => { onChange(model.id); setQuery(""); }}><span><strong>{model.label}</strong>{model.description ? <small>{model.description}</small> : null}</span>{model.id === value ? <span aria-label={locale === "zh" ? "已选择" : "Selected"}>✓</span> : null}</ModelSelectorItem>)}</ModelSelectorGroup>)}{!filtered.length ? <ModelSelectorEmpty>{locale === "zh" ? "没有匹配的模型" : "No matching models"}</ModelSelectorEmpty> : null}</ModelSelectorList>
    </ModelSelectorContent>
  </ModelSelector></div>;
}

export function WorkbenchPromptInput({ value, onValueChange, onSubmit, attachments = [], onAddAttachments, onRemoveAttachment, models = [], model, onModelChange, placeholder, status = "ready", onStop, disabled = false, locale = "zh", submitLabel, children }: { value: string; onValueChange: (value: string) => void; onSubmit: () => void; attachments?: readonly WorkbenchAttachmentItem[]; onAddAttachments?: (files: FileList | null) => void; onRemoveAttachment?: (id: string) => void; models?: readonly WorkbenchModelOption[]; model?: string; onModelChange?: (value: string) => void; placeholder?: string; status?: "ready" | "streaming" | "error"; onStop?: () => void; disabled?: boolean; locale?: "zh" | "en"; submitLabel?: string; children?: ReactNode }) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const textareaWasFocused = useRef(false);
  const headerChildren: ReactNode[] = [];
  const toolChildren: ReactNode[] = [];
  React.Children.forEach(children, (child) => {
    if (React.isValidElement<{ className?: string }>(child) && /composer-selected-agent/u.test(child.props.className ?? "")) headerChildren.push(child);
    else if (React.isValidElement<{ className?: string }>(child) && /composer-prompt-chips/u.test(child.props.className ?? "")) return;
    else if (child !== null && child !== undefined) toolChildren.push(child);
  });
  useEffect(() => {
    if (status === "streaming" || !textareaWasFocused.current) return;
    const frame = window.requestAnimationFrame(() => textareaRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [status]);
  return <PromptInput value={value} onValueChange={onValueChange} onSubmit={onSubmit} onAddAttachments={onAddAttachments} attachments={attachments} onRemoveAttachment={onRemoveAttachment} status={status} onStop={onStop} disabled={disabled} locale={locale}>
    <PromptInputHeader>{headerChildren.length ? <div className="wb-ai-prompt-context">{headerChildren}</div> : null}<WorkbenchAttachments attachments={attachments} variant="inline" onRemove={onRemoveAttachment} locale={locale} /></PromptInputHeader>
    <PromptInputBody><PromptInputTextarea ref={textareaRef} value={value} onFocus={() => { textareaWasFocused.current = true; }} onChange={(event) => onValueChange(event.target.value)} placeholder={placeholder} /></PromptInputBody>
    <PromptInputFooter><PromptInputTools>
      {onAddAttachments ? <PromptInputActionMenu><PromptInputActionMenuTrigger aria-label={locale === "zh" ? "添加附件" : "Add attachment"} /><PromptInputActionMenuContent><PromptInputActionAddAttachments label={locale === "zh" ? "上传本地文件" : "Upload local file"} /></PromptInputActionMenuContent></PromptInputActionMenu> : null}
      {models.length && onModelChange ? <PromptInputSelect className="wb-ai-prompt-model-select"><WorkbenchModelSelector models={models} value={model} onChange={onModelChange} disabled={disabled || status === "streaming"} locale={locale} /></PromptInputSelect> : null}
      {toolChildren.length ? <div className="wb-ai-prompt-custom-tools" data-slot="prompt-input-custom-tools">{toolChildren}</div> : null}
    </PromptInputTools><div className="wb-ai-prompt-trailing"><PromptInputSubmit aria-label={submitLabel || (status === "streaming" ? (locale === "zh" ? "停止生成" : "Stop generating") : (locale === "zh" ? "发送" : "Send"))} onClick={status === "streaming" ? onStop : undefined} /></div></PromptInputFooter>
  </PromptInput>;
}
