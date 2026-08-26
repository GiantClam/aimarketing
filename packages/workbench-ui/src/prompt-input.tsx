"use client";

import React, { useId, useState, type ReactNode } from "react";
import { AttachmentInfo, AttachmentPreview, Attachments, ModelSelector, ModelSelectorTrigger, PromptInput, PromptInputActionMenuContent, PromptInputActionMenuItem, PromptInputActionMenuTrigger, PromptInputBody, PromptInputFooter, PromptInputSelect, PromptInputSubmit, PromptInputTextarea, PromptInputTools, PromptInputHeader } from "./ai-elements/index";

export type WorkbenchAttachmentItem = { readonly id: string; readonly name: string; readonly mediaType?: string; readonly uri?: string; readonly status?: "queued" | "uploading" | "ready" | "failed" };
export type WorkbenchModelOption = { readonly id: string; readonly label: string; readonly provider?: string; readonly description?: string };

export function WorkbenchAttachments({ attachments, variant = "inline", onRemove, locale = "zh" }: { attachments: readonly WorkbenchAttachmentItem[]; variant?: "grid" | "inline" | "list"; onRemove?: (id: string) => void; locale?: "zh" | "en" }) {
  if (!attachments.length) return null;
  return <Attachments variant={variant} items={attachments} onRemove={onRemove}><>{attachments.map((attachment) => <div className="ai-elements-attachment wb-ai-attachment" key={attachment.id}><AttachmentPreview item={attachment} /><AttachmentInfo item={attachment} />{onRemove ? <button type="button" className="ai-elements-attachment-remove wb-ai-attachment-remove" onClick={() => onRemove(attachment.id)} aria-label={`${locale === "zh" ? "移除附件" : "Remove attachment"}: ${attachment.name}`} title={locale === "zh" ? "移除附件" : "Remove attachment"}>×</button> : null}</div>)}</></Attachments>;
}

export function WorkbenchModelSelector({ models, value, onChange, disabled = false, locale = "zh" }: { models: readonly WorkbenchModelOption[]; value?: string; onChange: (value: string) => void; disabled?: boolean; locale?: "zh" | "en" }) {
  return <div aria-disabled={disabled || undefined}><ModelSelector models={models} value={value} onValueChange={onChange} triggerProps={{ disabled, "aria-label": locale === "zh" ? `选择模型${value ? `：${models.find((model) => model.id === value)?.label ?? ""}` : ""}` : undefined }} /></div>;
}

export function WorkbenchPromptInput({ value, onValueChange, onSubmit, attachments = [], onAddAttachments, onRemoveAttachment, models = [], model, onModelChange, placeholder, status = "ready", onStop, disabled = false, locale = "zh", submitLabel, children }: { value: string; onValueChange: (value: string) => void; onSubmit: () => void; attachments?: readonly WorkbenchAttachmentItem[]; onAddAttachments?: (files: FileList | null) => void; onRemoveAttachment?: (id: string) => void; models?: readonly WorkbenchModelOption[]; model?: string; onModelChange?: (value: string) => void; placeholder?: string; status?: "ready" | "streaming" | "error"; onStop?: () => void; disabled?: boolean; locale?: "zh" | "en"; submitLabel?: string; children?: ReactNode }) {
  const promptId = useId().replace(/:/gu, "");
  const [menuOpen, setMenuOpen] = useState(false);
  const headerChildren: ReactNode[] = [];
  const toolChildren: ReactNode[] = [];
  React.Children.forEach(children, (child) => {
    if (React.isValidElement<{ className?: string }>(child) && /(?:composer-selected-agent|composer-prompt-chips)/u.test(child.props.className ?? "")) headerChildren.push(child);
    else if (child !== null && child !== undefined) toolChildren.push(child);
  });
  const handleAddFiles = (files: FileList | null) => { onAddAttachments?.(files); setMenuOpen(false); };
  return <PromptInput value={value} onValueChange={onValueChange} onSubmit={onSubmit} onAddAttachments={onAddAttachments} attachments={attachments} onRemoveAttachment={onRemoveAttachment} status={status} onStop={onStop} disabled={disabled} locale={locale}>
    <PromptInputHeader>{headerChildren.length ? <div className="wb-ai-prompt-context">{headerChildren}</div> : null}<WorkbenchAttachments attachments={attachments} variant="inline" onRemove={onRemoveAttachment} locale={locale} /></PromptInputHeader>
    <PromptInputBody><PromptInputTextarea value={value} onChange={(event) => onValueChange(event.target.value)} placeholder={placeholder} /></PromptInputBody>
    <PromptInputFooter><PromptInputTools>
      {onAddAttachments ? <div className="ai-elements-prompt-input-action-menu"><PromptInputActionMenuTrigger aria-haspopup="menu" aria-expanded={menuOpen} aria-controls={`${promptId}-file-menu`} onClick={() => setMenuOpen((current) => !current)} /><span className="sr-only">{locale === "zh" ? "添加附件" : "Add attachment"}</span>{menuOpen ? <PromptInputActionMenuContent id={`${promptId}-file-menu`}><label role="menuitem" tabIndex={0}><span>{locale === "zh" ? "上传本地文件" : "Upload local file"}</span><input type="file" multiple className="sr-only" onChange={(event) => { handleAddFiles(event.target.files); event.currentTarget.value = ""; }} /></label><PromptInputActionMenuItem onClick={() => setMenuOpen(false)}>Cancel</PromptInputActionMenuItem></PromptInputActionMenuContent> : null}</div> : null}
      {models.length && onModelChange ? <PromptInputSelect className="wb-ai-prompt-model-select"><WorkbenchModelSelector models={models} value={model} onChange={onModelChange} disabled={disabled || status === "streaming"} locale={locale} /></PromptInputSelect> : null}
      {toolChildren.length ? <div className="wb-ai-prompt-custom-tools" data-slot="prompt-input-custom-tools">{toolChildren}</div> : null}
    </PromptInputTools><div className="wb-ai-prompt-trailing"><PromptInputSubmit aria-label={submitLabel || (status === "streaming" ? (locale === "zh" ? "停止生成" : "Stop generating") : (locale === "zh" ? "发送" : "Send"))} onClick={status === "streaming" ? onStop : undefined} /></div></PromptInputFooter>
  </PromptInput>;
}
