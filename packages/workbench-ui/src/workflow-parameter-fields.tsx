"use client";

import React from "react";
import { workflowNodeRegistry, type WorkflowDefinitionNodeV2, type WorkflowFieldDefinition } from "@coworkany/workflow-core";
import { resolveWorkbenchMediaFeature, type WorkbenchMediaField } from "./media";

type WorkflowParameterValue = string | number | boolean;

export type WorkbenchWorkflowModelOption = {
  value: string;
  label: string;
};

export type WorkbenchWorkflowParameterFieldsProps = {
  locale: "zh" | "en";
  node: WorkflowDefinitionNodeV2;
  modelOptions?: readonly WorkbenchWorkflowModelOption[];
  onUpdate: (key: string, value: WorkflowParameterValue) => void;
  className?: string;
};

function isVisible(field: WorkflowFieldDefinition, config: Record<string, unknown>) {
  return !field.visibleWhen || config[field.visibleWhen.fieldId] === field.visibleWhen.equals;
}

function valueForField(field: WorkflowFieldDefinition, config: Record<string, unknown>) {
  const value = config[field.id] ?? field.defaultValue;
  if (value === undefined || value === null || typeof value === "object") return "";
  return value as WorkflowParameterValue;
}

function renderMediaField(field: WorkbenchMediaField, node: WorkflowDefinitionNodeV2, locale: "zh" | "en", onUpdate: (key: string, value: WorkflowParameterValue) => void) {
  const rawValue = node.config[field.id] ?? field.defaultValue ?? "";
  const value = typeof rawValue === "string" || typeof rawValue === "number" || typeof rawValue === "boolean" ? rawValue : "";
  const controlType = field.type === "select" ? "select" : field.type === "textarea" ? "textarea" : "input";
  return <label key={"media-" + field.id} className={`workflow-editor-field workflow-editor-field-${controlType}`} data-field-id={field.id}>
    <span>{field.label}</span>
    {field.type === "select" && field.options?.length ? (
      <select aria-label={field.label} title={field.label} value={String(value)} onChange={(event) => onUpdate(field.id, event.target.value)}>
        {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    ) : field.type === "textarea" ? (
      <textarea aria-label={field.label} value={String(value)} onChange={(event) => onUpdate(field.id, event.target.value)} placeholder={field.placeholder} />
    ) : (
      <input aria-label={field.label} type={field.type === "number" ? "number" : field.type === "url" ? "url" : "text"} value={String(value)} onChange={(event) => onUpdate(field.id, field.type === "number" ? Number(event.target.value) : event.target.value)} placeholder={field.placeholder} min={field.min} max={field.max} step={field.step} required={field.required} />
    )}
    {field.required && !String(value).trim() ? <small className="muted">{locale === "zh" ? "必填" : "Required"}</small> : null}
  </label>;
}

/**
 * Host-neutral renderer for the portable workflow schema. Hosts can keep
 * asset, agent, and dataset pickers as extensions while standard controls
 * remain identical wherever a workflow definition is edited.
 */
export function WorkbenchWorkflowParameterFields({ locale, node, modelOptions = [], onUpdate, className = "" }: WorkbenchWorkflowParameterFieldsProps) {
  const fields = workflowNodeRegistry.get(node.type)?.configSchema ?? [];
  const hasModelField = fields.some((field) => field.id === "model" || field.id === "selectedModelId");
  const visibleFields = fields.filter((field) => isVisible(field, node.config) && !(modelOptions.length > 0 && hasModelField && field.id === "selectedProviderId"));
  const workflowVideoMode = typeof node.config.mode === "string" ? node.config.mode : "text-to-video";
  const workflowVideoFeatureId = workflowVideoMode === "image-to-video" || workflowVideoMode === "reference-to-video" || workflowVideoMode === "video-edit"
    ? workflowVideoMode
    : "text-to-video";
  const workflowVideoFeature = node.type === "video_generate"
    ? resolveWorkbenchMediaFeature({
        id: workflowVideoFeatureId,
        group: "video",
        title: "",
        summary: "",
        submitLabel: "",
        fields: [{ id: "model", label: "模型", type: "select", defaultValue: String(node.config.model ?? ""), options: modelOptions.map((option) => ({ value: option.value, label: option.label })) }],
      }, String(node.config.model ?? ""))
    : null;
  const dynamicVideoFields = workflowVideoFeature?.fields.filter((field) => field.id !== "model" && !fields.some((candidate) => candidate.id === field.id)) ?? [];

  const renderField = (field: WorkflowFieldDefinition) => {
    const value = valueForField(field, node.config);
    const label = field.label[locale] ?? field.label.en ?? field.id;
    const textarea = field.rendererId === "textarea" || ["prompt", "script", "text", "query", "systemPrompt", "scenePrompt"].includes(field.id);
    const modelSelect = (field.id === "model" || field.id === "selectedModelId") && modelOptions.length > 0;
    const controlType = modelSelect || field.rendererId === "select" ? "select" : field.rendererId === "toggle" || field.valueType === "boolean" ? "toggle" : textarea ? "textarea" : "input";
    if (field.rendererId === "asset" || field.rendererId === "agent" || field.rendererId === "dataset" || field.rendererId === "custom") {
      return <div key={field.id} className="workflow-editor-readonly"><span>{label}</span><small>{locale === "zh" ? "请通过相应的工作区选择此配置。" : "Select this configuration in its workspace."}</small></div>;
    }
    return (
      <label key={field.id} className={`workflow-editor-field workflow-editor-field-${controlType}`} data-field-id={field.id}>
        <span>{label}</span>
        {modelSelect ? (
          <select aria-label={label} title={label} value={String(value)} onChange={(event) => onUpdate(field.id, event.target.value)}>
            {modelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        ) : field.rendererId === "select" && field.options?.length ? (
          <select aria-label={label} title={label} value={String(value)} onChange={(event) => onUpdate(field.id, event.target.value)}>
            {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        ) : field.rendererId === "toggle" || field.valueType === "boolean" ? (
          <span className="workflow-toggle-field"><input aria-label={label} type="checkbox" checked={Boolean(value)} onChange={(event) => onUpdate(field.id, event.target.checked)} /><span>{value ? (locale === "zh" ? "已启用" : "Enabled") : (locale === "zh" ? "未启用" : "Disabled")}</span></span>
        ) : textarea ? (
          <textarea aria-label={label} value={String(value)} onChange={(event) => onUpdate(field.id, event.target.value)} />
        ) : (
          <input aria-label={label} type={field.valueType === "number" ? "number" : "text"} min={field.min} max={field.max} step={field.step} value={String(value)} onChange={(event) => onUpdate(field.id, field.valueType === "number" ? Number(event.target.value) : event.target.value)} />
        )}
      </label>
    );
  };

  return (
    <div className={`workflow-node-parameter-list ${className}`.trim()}>
      {visibleFields.map(renderField)}
      {dynamicVideoFields.map((field) => renderMediaField(field, node, locale, onUpdate))}
      {!visibleFields.length ? <small className="muted">{locale === "zh" ? "此节点没有可编辑参数" : "No editable parameters"}</small> : null}
    </div>
  );
}
