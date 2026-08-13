import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { formatWorkbenchModelLabel, WORKBENCH_HOME_COPY, WORKBENCH_HOME_GROUPS, WORKBENCH_MEDIA_FEATURES, WORKBENCH_MESSAGE_FRAME, WORKBENCH_ROUTE_MANIFEST, WORKBENCH_THEME, WORKBENCH_WRITER_CONTENT_TYPES, WORKBENCH_WRITER_LANGUAGES, WORKBENCH_WRITER_MODES, WORKBENCH_WRITER_PLATFORMS, WORKBENCH_WRITER_QUICK_PROMPTS, WorkbenchChatMessage, WorkbenchRouteIcon, WorkbenchShell, WorkbenchWriterMessage, type WorkbenchMediaFeatureId } from "@aimarketing/workbench-ui";
import { validateWorkflowDefinition, workflowNodeRegistry, type WorkflowDefinitionEnvelope, type WorkflowDefinitionNodeV2 } from "@aimarketing/workflow-core";
import type { WorkbenchArtifact, WorkbenchKnowledgeResult, WorkbenchRun, WorkbenchRunDetail, WorkbenchWorkflow } from "@aimarketing/workbench-client";
import { tauriBridge } from "./tauri";
import { createDesktopWorkbenchClient } from "./workbench-client";
import { capabilityEnglish, desktopCopy, mediaEnglish, mediaFieldEnglish, mediaOptionEnglish, mediaPlaceholderEnglish, mediaSubmitEnglish, mediaSummaryEnglish, quickPromptsForDesktopRoute, resolveDesktopLocale, workflowActionEnglish, writerContentTypeEnglish, writerLanguageEnglish, writerModeEnglish, writerPlatformEnglish, type DesktopLocalePreference } from "./i18n";
import { capabilityForWorkflowAction, configuredModelOptions, isMediaProviderConfigured, modelOptionsForProvider, preferredConfiguredModel, providerForCapability, providerForId, requiresConfiguredProviderForWorkflowAction, type DesktopProviderConfig, type DesktopProviderDefaults, type DesktopProviderProfiles } from "./provider-config";
import { createSessionRecoverySnapshot } from "./session-recovery";
import { sanitizeWorkflowDefinitionForStorage } from "./workflow-storage";
import { parseWorkflowImportText, serializeWorkflowExport } from "./workflow-portability";

type WorkspaceMode = "chat" | "writer" | "workflow" | "library";
type SkillId = "auto" | "content-writing" | "marketing-analysis" | "ppt-master" | "obsidian-rag";
type WorkflowAction = "upload" | "text_input" | "file_create" | "writer" | "llm_generate" | "agent_execute" | "ppt_generate" | "image_generate" | "video_generate" | "digital_human" | "music_generate" | "voice_synthesis" | "voice_clone" | "audio_generate" | "knowledge_retrieve" | "knowledge_write" | "product_store" | "foreach" | "collect" | "output";
type MediaFeatureId = WorkbenchMediaFeatureId;
type EmbeddingConfig = { mode: "local" | "remote"; baseUrl?: string; model?: string; apiKey?: string };
type DesktopConfig = { schemaVersion: 1; locale?: DesktopLocalePreference; workspacePath: string; obsidianVaultPath?: string; obsidianIndexPath?: string; embedding?: EmbeddingConfig; provider: DesktopProviderConfig & { model: string; skillId?: SkillId }; providers?: DesktopProviderProfiles; defaults?: DesktopProviderDefaults; runtime: { source: "system" | "private"; nodePath?: string; opencodePath?: string; pythonPath?: string; hostPath?: string; skillsPath?: string; fontsPath?: string; lancedbPath?: string; embeddingPath?: string }; offlineRuntimeZipPath?: string };
let activeProviderModels: readonly string[] = [];
let activeMediaProviderConfigured = false;
let openWorkflowProviderSettings = () => undefined;
function embeddingPayload(config: DesktopConfig): EmbeddingConfig {
  return config.embedding?.mode === "remote"
    ? { mode: "remote", baseUrl: config.embedding.baseUrl, model: config.embedding.model, apiKey: config.embedding.apiKey }
    : { mode: "local", baseUrl: "http://127.0.0.1:11434", model: "nomic-embed-text" };
}
type SavedWorkflow = { id: string; name: string; definition_json: string; updated_at: string };
type ArtifactRow = { id: string; relative_path: string; mime_type: string; byte_length: number; sha256: string; created_at: string; available?: boolean };
type RunRow = { id: string; conversation_id?: string | null; status: string; model?: string | null; started_at: string; finished_at?: string | null };
type RunDetail = { run: RunRow; nodes: Array<{ node_key: string; status: string; output_json?: string | null; updated_at: string }>; events: Array<{ sequence: number; event_type: string; payload_json: string; created_at: string }>; usage: Array<{ provider?: string | null; model: string; input_tokens?: number | null; output_tokens?: number | null; provider_cost?: number | null; estimated_cost?: number | null; created_at: string }> };
type WorkflowRetryState = { completed: Record<string, Record<string, unknown>>; recoveryDefinitionHash: string };
type KnowledgeResult = WorkbenchKnowledgeResult;
type LocalMessageRow = { role: string; content: string; created_at?: string };
type DesktopConversationMessage = { id: string; role: "user" | "assistant"; content: string; created_at?: string };
type LocalAttachment = { id: string; name: string; size: number; mediaType: string; relativePath?: string };

type DesktopRoute = { path: string; label: string; description: string; mode: WorkspaceMode; section?: string; glyph?: string; iconKey?: string; placement?: "main" | "footer" | "hidden" };

function toSavedWorkflow(workflow: WorkbenchWorkflow): SavedWorkflow {
  return { id: workflow.id, name: workflow.title, definition_json: JSON.stringify(workflow.definition), updated_at: workflow.updatedAt };
}

function toArtifactRow(artifact: WorkbenchArtifact): ArtifactRow {
  return { id: artifact.id, relative_path: artifact.relativePath, mime_type: artifact.mimeType, byte_length: artifact.byteLength, sha256: artifact.sha256, created_at: artifact.createdAt ?? new Date(0).toISOString(), available: artifact.available };
}

function toRunRow(run: WorkbenchRun): RunRow {
  return { id: run.id, conversation_id: run.conversationId || null, status: run.status, model: run.model ?? null, started_at: run.startedAt, finished_at: run.finishedAt ?? null };
}

function toRunDetail(detail: WorkbenchRunDetail): RunDetail {
  return {
    run: toRunRow(detail.run),
    nodes: detail.nodes.map((node) => ({ node_key: node.nodeKey, status: node.status, output_json: node.outputJson, updated_at: node.updatedAt })),
    events: detail.events.map((event) => ({ sequence: event.sequence, event_type: event.eventType, payload_json: event.payloadJson, created_at: event.createdAt })),
    usage: detail.usage.map((item) => ({ provider: item.provider, model: item.model, input_tokens: item.inputTokens, output_tokens: item.outputTokens, provider_cost: item.providerCost, estimated_cost: item.estimatedCost, created_at: item.createdAt })),
  };
}

const mediaFeatureCatalog = WORKBENCH_MEDIA_FEATURES;

function formatDateTime(value: string | undefined, locale: "zh" | "en") {
  if (!value) return "";
  return new Date(value).toLocaleString(locale === "zh" ? "zh-CN" : "en-US");
}

function ModelControls({
  model,
  models,
  providerSource,
  reasoningEffort,
  skillId,
  onModelChange,
  onReasoningChange,
  onSkillChange,
  showSkill = true,
  locale = "zh",
}: {
  model: string;
  models?: readonly string[];
  providerSource?: string;
  reasoningEffort: string;
  skillId: SkillId;
  onModelChange: (value: string) => void;
  onReasoningChange: (value: string) => void;
  onSkillChange: (value: SkillId) => void;
  showSkill?: boolean;
  locale?: "zh" | "en";
}) {
  const activeLocale = locale === "zh" && typeof document !== "undefined" && document.documentElement.lang === "en" ? "en" : locale;
  const copy = activeLocale === "en" ? { aria: "Model and reasoning settings", automatic: "Auto", writing: "Content writing", analysis: "Marketing analysis", model: showSkill ? "Model" : "Standard", skill: "Skill", reasoning: "Reasoning", unconfigured: "Model not configured", low: "Low", medium: "Medium", high: "High" } : { aria: "模型与推理设置", automatic: "自动", writing: "内容写作", analysis: "营销分析", model: showSkill ? "模型" : "标准", skill: "Skill", reasoning: "推理", unconfigured: "未配置模型", low: "低", medium: "中", high: "高" };
  const providerLabel = providerSource && providerSource !== "local" ? providerSource : formatWorkbenchModelLabel(model, { zh: "本地模型", en: "Local model" }, activeLocale);
  const configuredModels = configuredModelOptions({ model, models: models ?? activeProviderModels });
  const modelOptions = configuredModels.length ? configuredModels : (model ? [model] : []);
  return <div className="model-controls" aria-label={copy.aria}>
    {showSkill ? <label className="model-select-control"><span>{copy.skill}</span><select value={skillId} onChange={(event) => onSkillChange(event.target.value as SkillId)}><option value="auto">{copy.automatic}</option><option value="content-writing">{copy.writing}</option><option value="marketing-analysis">{copy.analysis}</option><option value="ppt-master">ppt-master</option><option value="obsidian-rag">Obsidian RAG</option></select></label> : null}
    <label className="model-select-control"><span>{copy.model}</span><select value={model} onChange={(event) => onModelChange(event.target.value)}>{modelOptions.length ? modelOptions.map((option) => <option key={option} value={option}>{showSkill ? option : formatWorkbenchModelLabel(option, { zh: "本地模型", en: "Local model" }, activeLocale)}</option>) : <option value="">{showSkill ? copy.unconfigured : providerLabel}</option>}</select></label>
    <label className="model-select-control"><span>{copy.reasoning}</span><select value={reasoningEffort} onChange={(event) => onReasoningChange(event.target.value)}><option value="auto">{copy.automatic}</option><option value="low">{copy.low}</option><option value="medium">{copy.medium}</option><option value="high">{copy.high}</option></select></label>
  </div>;
}

const routeIconKeys: Record<string, string> = {
  "/dashboard": "home",
  "/dashboard/ai": "chat",
  "/dashboard/ai?entry=consulting-advisor": "advisor",
  "/dashboard/ai?agent=executive-brand&entry=consulting-advisor": "advisor",
  "/dashboard/ai?agent=executive-growth&entry=consulting-advisor": "advisor",
  "/dashboard/ai?agent=executive-ppt": "ppt",
  "/dashboard/ai?agent=executive-presentation-ppt": "ppt",
  "/dashboard/writer": "writer",
  "/dashboard/image-assistant": "image",
  "/dashboard/capabilities": "capability",
  "/dashboard/workflows": "workflow",
  "/dashboard/tasks": "task",
  "/dashboard/assets": "asset",
  "/dashboard/works": "asset",
  "/dashboard/knowledge-base": "knowledge",
  "/dashboard/video": "video",
  "/dashboard/settings": "settings",
};

function RouteIcon({ name, size = 16 }: { name?: string; size?: number }) {
  return <WorkbenchRouteIcon name={name} size={size} />;
}

function buildRoutes(locale: "zh" | "en"): DesktopRoute[] {
  return WORKBENCH_ROUTE_MANIFEST.map((route) => ({ path: route.path, label: route.label[locale], description: route.description[locale], mode: route.mode === "home" ? "library" : route.mode, ...(route.section ? { section: route.section[locale] } : {}), ...(route.glyph ? { glyph: route.glyph } : {}), ...(route.placement ? { placement: route.placement } : {}), iconKey: routeIconKeys[route.path] }));
}

function localizeRuntimeStatus(status: string, locale: "zh" | "en") {
  if (locale === "zh") return status;
  const map: Record<string, string> = {
    "检查本地运行环境…": "Checking local runtime…",
    "检测到运行环境缺失，正在自动修复…": "Required runtime is missing; repairing automatically…",
    "运行环境就绪": "Runtime ready",
    "运行环境需要修复": "Runtime needs repair",
    "运行环境修复失败": "Runtime repair failed",
    "本地数据库需要修复": "Local database needs repair",
    "浏览器预览模式 · Tauri 未连接": "Browser preview · Tauri is not connected",
  };
  return map[status] ?? status;
}

function localizeDesktopStatus(status: string, locale: "zh" | "en") {
  if (locale === "zh") return status;
  const map: Record<string, string> = {
    "Obsidian 语义索引已完成": "Obsidian semantic index complete",
    "Obsidian 词法索引已完成，可继续检索": "Obsidian lexical index complete; search is ready",
    "正在检索本地 Vault…": "Searching the local Vault…",
    "没有匹配的本地笔记": "No matching local notes",
    "本地 Agent 已异常退出，任务已标记为中断，可在任务中心重试": "Local Agent exited unexpectedly; the run was marked interrupted and can be retried from Task Center",
    "已发送，等待本地 Agent 事件…": "Sent; waiting for local Agent events…",
    "正在通过本地 OpenCode 运行…": "Running through local OpenCode…",
    "已停止本地 Agent": "Local Agent stopped",
    "工作流已保存到本机": "Workflow saved locally",
    "工作流 JSON 已导出": "Workflow JSON exported",
    "模型配置已保存到本机 config.json": "Model settings saved to local config.json",
  };
  return map[status] ?? status;
}

function routeWorkflowAction(path: string): WorkflowAction | null {
  if (path.includes("executive-ppt")) return "ppt_generate";
  if (path === "/dashboard/writer") return "writer";
  if (path === "/dashboard/image-assistant") return "image_generate";
  if (path === "/dashboard/video") return "video_generate";
  return null;
}

const workflowActions: Array<{ id: WorkflowAction; label: string; output: "text" | "asset" | "ppt" | "image" | "video" | "audio" }> = [
  { id: "upload", label: "上传资产", output: "asset" },
  { id: "text_input", label: "文本输入", output: "text" },
  { id: "file_create", label: "本地文件", output: "asset" },
  { id: "writer", label: "内容写作", output: "text" },
  { id: "llm_generate", label: "模型生成", output: "text" },
  { id: "agent_execute", label: "智能体执行", output: "text" },
  { id: "ppt_generate", label: "PPT（ppt-master）", output: "ppt" },
  { id: "image_generate", label: "图片生成", output: "image" },
  { id: "video_generate", label: "视频生成", output: "video" },
  { id: "digital_human", label: "数字人", output: "video" },
  { id: "music_generate", label: "音乐生成", output: "audio" },
  { id: "voice_synthesis", label: "语音合成", output: "audio" },
  { id: "voice_clone", label: "声音克隆", output: "audio" },
  { id: "audio_generate", label: "通用音频", output: "audio" },
  { id: "knowledge_retrieve", label: "Obsidian 知识检索", output: "text" },
  { id: "knowledge_write", label: "写入 Obsidian", output: "text" },
  { id: "product_store", label: "资产库存储", output: "asset" },
  { id: "foreach", label: "逐项处理", output: "asset" },
  { id: "collect", label: "汇总结果", output: "text" },
  { id: "output", label: "工作流输出", output: "text" },
];
const workflowActionsBase = workflowActions;

function outputInputPort(value: string) {
  return value === "asset" ? "assets" : value === "image" ? "images" : value === "video" ? "videos" : value === "audio" ? "audios" : value === "ppt" ? "presentations" : "text";
}

function buildWorkflowDefinition(prompt: string, actionId: WorkflowAction, provider: Pick<DesktopProviderConfig, "id" | "model" | "baseUrl">, extraConfig: Record<string, unknown> = {}): WorkflowDefinitionEnvelope {
  const action = workflowActions.find((item) => item.id === actionId) ?? workflowActions[0];
  const capabilityConfig = { prompt, script: prompt, text: prompt, provider: provider.id, model: provider.model, baseUrl: provider.baseUrl, ...extraConfig };
  return {
    schemaVersion: 2,
    revision: 1,
    definitionHash: "",
    nodes: [
      { nodeKey: "input", type: "text_input", nodeVersion: 1, title: "输入任务", positionX: 0, positionY: 0, config: { text: prompt } },
      { nodeKey: "capability", type: actionId, nodeVersion: 1, title: action.label, positionX: 240, positionY: 0, config: capabilityConfig },
      { nodeKey: "output", type: "output", nodeVersion: 1, title: "本地产物", positionX: 480, positionY: 0, config: {} },
    ],
    edges: [
      { edgeKey: "input-capability", sourceNodeKey: "input", sourcePortId: "text", targetNodeKey: "capability", targetPortId: workflowNodeRegistry.get(actionId)?.inputs[0]?.id ?? "text" },
      { edgeKey: "capability-output", sourceNodeKey: "capability", sourcePortId: action.output, targetNodeKey: "output", targetPortId: outputInputPort(action.output) },
    ],
  };
}

function isWorkflowDefinition(value: unknown): value is WorkflowDefinitionEnvelope {
  return Boolean(value && typeof value === "object" && (value as { schemaVersion?: unknown }).schemaVersion === 2 && Array.isArray((value as { nodes?: unknown }).nodes) && Array.isArray((value as { edges?: unknown }).edges));
}

function parseImageInputs(prompt: string): Record<string, unknown> {
  const read = (label: string) => prompt.match(new RegExp(`${label}：([^\\n]+)`))?.[1]?.trim() ?? "";
  const count = Number(read("生成数量"));
  return {
    quality: read("图片质量") || "standard",
    size: read("图片尺寸") || "1024x1024",
    ...(Number.isFinite(count) && count > 0 ? { n: count } : { n: 1 }),
    referenceImages: read("参考素材"),
  };
}

const desktopCapabilities: Array<{ id: WorkflowAction; title: string; description: string; route: string; kind: "text" | "media" | "knowledge" }> = [
  { id: "writer", title: "内容写作", description: "通过本地 OpenCode 与 Writer Skill 生成、改写和整理营销内容。", route: "/dashboard/writer", kind: "text" },
  { id: "ppt_generate", title: "AI PPT", description: "使用 OpenCode + ppt-master Skill 在项目目录生成可编辑 PPTX。", route: "/dashboard/ai?agent=executive-ppt", kind: "text" },
  { id: "image_generate", title: "AI 图片", description: "调用已配置的图片 Provider，生成并登记本地图片产物。", route: "/dashboard/image-assistant", kind: "media" },
  { id: "video_generate", title: "AI 视频", description: "调用视频 Provider 生成视频，并把异步任务与文件保存在本地。", route: "/dashboard/video", kind: "media" },
  { id: "digital_human", title: "数字人", description: "使用媒体工作流中的数字人能力生成本地视频结果。", route: "/dashboard/video", kind: "media" },
  { id: "music_generate", title: "AI 音乐", description: "生成音乐并在本地产物库中管理音频文件。", route: "/dashboard/video", kind: "media" },
  { id: "voice_synthesis", title: "语音合成", description: "把文本转换为语音，产物直接写入本地项目目录。", route: "/dashboard/video", kind: "media" },
  { id: "audio_generate", title: "通用音频", description: "使用已配置 Provider 生成通用音频内容。", route: "/dashboard/video", kind: "media" },
  { id: "knowledge_retrieve", title: "Obsidian 知识库", description: "在本地 Vault 索引中检索笔记，并从结果打开原文。", route: "/dashboard/knowledge-base", kind: "knowledge" },
  { id: "knowledge_write", title: "写入 Obsidian", description: "将 Agent 生成的内容写入配置的 Vault，并保留本地文件索引。", route: "/dashboard/writer", kind: "knowledge" },
];

function HomeEntryGroups({ onNavigate, locale }: { onNavigate: (path: string) => void; locale: "zh" | "en" }) {
  return <section className="home-entry-groups" aria-label={locale === "zh" ? "功能入口" : "Workspace entries"}>
    {WORKBENCH_HOME_GROUPS.map((group) => <div key={group.label} className="home-entry-group">
      <div className="home-entry-group-label">{group.label}</div>
      <div className="home-entry-group-list">
        {group.entries.map((entry) => <button key={`${entry.path}:${entry.label[locale]}`} type="button" className={`home-entry-card home-entry-card--${entry.tone}`} onClick={() => onNavigate(entry.path)}>
          <span className={`home-entry-icon home-entry-icon--${entry.tone}`} aria-hidden="true"><WorkbenchRouteIcon name={routeIconKeys[entry.path] ?? (entry.path.includes("writer") ? "writer" : entry.path.includes("video") ? "video" : entry.path.includes("image") ? "image" : entry.path.includes("workflows") ? "workflow" : entry.path.includes("tasks") ? "task" : entry.path.includes("knowledge") ? "knowledge" : entry.path.includes("assets") ? "asset" : entry.path.includes("ppt") ? "ppt" : entry.path.includes("consulting") ? "advisor" : "chat")} size={19} /></span>
          <span className="home-entry-copy"><span className="home-entry-label">{entry.label[locale]}</span><span className="home-entry-description">{entry.description[locale]}</span></span>
          <WorkbenchRouteIcon name="arrowUpRight" size={15} className="home-entry-arrow" />
        </button>)}
      </div>
    </div>)}
  </section>;
}

function DesktopConversationWorkspace({
  route,
  prompt,
  onPromptChange,
  runStatus,
  activeRunId,
  onRun,
  onGenerateImages,
  onCancel,
  activePrompt,
  activePromptAt,
  assistantText,
  assistantAt,
  messages,
  toolEvents,
  conversations,
  onNavigate,
  onNewConversation,
  knowledgeEnabled,
  onKnowledgeToggle,
  onAssistantTextChange,
  onSaveDraft,
  artifacts,
  onArtifactOpen,
  model,
  models,
  reasoningEffort,
  skillId,
  attachments,
  onAddAttachments,
  onRemoveAttachment,
  onModelChange,
  onReasoningChange,
  onSkillChange,
  locale,
}: {
  route: DesktopRoute;
  prompt: string;
  onPromptChange: (value: string) => void;
  runStatus: string;
  activeRunId: string | null;
  onRun: (value?: string) => void;
  onGenerateImages?: () => void;
  onCancel: () => void;
  activePrompt: string;
  activePromptAt?: string;
  assistantText: string;
  onAssistantTextChange: (value: string) => void;
  onSaveDraft: (value: string) => void | Promise<void>;
  assistantAt?: string;
  messages: DesktopConversationMessage[];
  toolEvents: string[];
  conversations: Array<{ id: string; title: string; updated_at: string }>;
  onNavigate: (path: string) => void;
  onNewConversation: () => void;
  knowledgeEnabled: boolean;
  onKnowledgeToggle: () => void;
  artifacts: Array<{ id: string; relative_path: string; mime_type: string; byte_length?: number }>;
  onArtifactOpen: (relativePath: string, mimeType: string) => void;
  model: string;
  models?: readonly string[];
  reasoningEffort: string;
  skillId: SkillId;
  attachments: LocalAttachment[];
  onAddAttachments: (files: FileList | null) => void;
  onRemoveAttachment: (id: string) => void;
  onModelChange: (value: string) => void;
  onReasoningChange: (value: string) => void;
  onSkillChange: (value: SkillId) => void;
  locale: "zh" | "en";
}) {
  const isWriter = route.mode === "writer";
  const copy = desktopCopy[locale];
  const localizedRunStatus = localizeDesktopStatus(runStatus, locale);
  const quickPrompts = quickPromptsForDesktopRoute(route.path, locale);
  const isPlainChat = route.path === "/dashboard/ai";
  const chatSubtitle = isPlainChat
    ? (locale === "zh" ? "通用 AI 对话入口" : "General-purpose AI chat")
    : route.description;
  const chatPlaceholder = isPlainChat
    ? (locale === "zh" ? "输入你的问题..." : "Ask anything...")
    : (isWriter ? (locale === "zh" ? "描述你要写作的主题、平台和语气……" : "Describe the topic, platform, and tone you want to write for…") : (locale === "zh" ? "输入你的营销任务……" : "Describe your marketing task…"));
  if (isWriter) return <DesktopWriterCloudWorkspace locale={locale} route={route} prompt={prompt} onPromptChange={(value) => { onPromptChange(value); if (!value) onNewConversation(); }} runStatus={runStatus} activeRunId={activeRunId} onRun={(value) => onRun(value)} onGenerateImages={onGenerateImages} onCancel={onCancel} activePrompt={activePrompt} activePromptAt={activePromptAt} assistantText={assistantText} onAssistantTextChange={onAssistantTextChange} onSaveDraft={onSaveDraft} assistantAt={assistantAt} messages={messages} toolEvents={toolEvents} artifacts={artifacts} onArtifactOpen={onArtifactOpen} model={model} models={models} reasoningEffort={reasoningEffort} skillId={skillId} attachments={attachments} onAddAttachments={onAddAttachments} onRemoveAttachment={onRemoveAttachment} knowledgeEnabled={knowledgeEnabled} onKnowledgeToggle={onKnowledgeToggle} onModelChange={onModelChange} onReasoningChange={onReasoningChange} onSkillChange={onSkillChange} />;
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const showLanding = messages.length === 0 && !activePrompt && !assistantText && !activeRunId && conversations.length === 0;
  const baseMessages = messages.length ? messages : [
    ...(activePrompt ? [{ id: "active-user", role: "user" as const, content: activePrompt, created_at: activePromptAt }] : []),
  ];
  const lastMessage = baseMessages[baseMessages.length - 1];
  const hasCurrentAssistant = Boolean(assistantText || activeRunId) && !(lastMessage?.role === "assistant" && lastMessage.content === assistantText && !activeRunId);
  const displayedMessages = hasCurrentAssistant ? [...baseMessages, { id: "active-assistant", role: "assistant" as const, content: assistantText, created_at: assistantAt }] : baseMessages;
  return <div className="chat-canvas flex h-full min-h-0 justify-center">
    <section className={`chat-workspace-section ${showLanding ? "landing-active" : ""}`.trim()}>
      {!showLanding ? <header className="chat-page-header"><div><h1 className="chat-page-title">{route.label}</h1><p className="chat-page-subtitle">{chatSubtitle}</p></div></header> : null}
      <div className="chat-message-scroll">
        <div className="chat-message-column">
          {displayedMessages.map((message, index) => <WorkbenchChatMessage key={message.id} role={message.role} content={message.content} label={message.role === "user" ? (locale === "zh" ? "你的指令" : "Your Command") : (isWriter ? "WRITER RESPONSE" : "AI RESPONSE")} timestamp={message.created_at} pending={message.role === "assistant" && Boolean(activeRunId) && index === displayedMessages.length - 1 && !message.content} events={message.role === "assistant" && index === displayedMessages.length - 1 ? toolEvents.map((item) => ({ type: "tool", label: item, status: "info" as const })) : []} artifacts={message.role === "assistant" && index === displayedMessages.length - 1 ? artifacts.map((artifact) => ({ id: artifact.id, title: artifact.relative_path, relativePath: artifact.relative_path, mimeType: artifact.mime_type, byteLength: artifact.byte_length })) : []} onArtifactOpen={onArtifactOpen} attachments={message.role === "user" && index === displayedMessages.length - 1 ? attachments : []} />)}
          {!displayedMessages.length && conversations.length ? <div className="chat-history-list">{conversations.map((item) => <button key={item.id} type="button" className="conversation-row" onClick={() => onNavigate(`${isWriter ? "/dashboard/writer" : "/dashboard/ai"}/${item.id}`)}><span>{item.title}</span><small>{formatDateTime(item.updated_at, locale)}</small></button>)}</div> : null}
          {showLanding ? <div className="chat-landing" data-cloud-surface="ai-entry"><div className="chat-landing-kicker"><span className="public-signal" aria-hidden="true" /><span className="dashboard-kicker">AI WORKSPACE</span></div><h1 className="dashboard-title">{route.label}</h1><p>{locale === "zh" ? "你说需求，我来生成第一版方案" : "Describe it once, and I'll generate the first draft"}</p><div className="chat-quick-start-grid">{quickPrompts.map((item) => <button key={item} type="button" className="dashboard-panel home-quick-start-card" onClick={() => onPromptChange(item)}><span className="dashboard-kicker">✦ {locale === "zh" ? "快速提问" : "Quick tips"}</span><span>{item}</span></button>)}</div></div> : null}
        </div>
      </div>
      <div className="chat-composer-dock"><div className="chat-composer" data-cloud-surface="composer">{route.path.includes("?") ? <div className="composer-selected-agent">{locale === "zh" ? "当前 Agent" : "Selected Agent"}：<strong>{route.label}</strong></div> : null}{!showLanding && !displayedMessages.length && !activeRunId ? <div className="composer-prompt-chips" data-cloud-surface="prompt-suggestions">{quickPrompts.map((quickPrompt) => <button key={quickPrompt} type="button" className="dashboard-chip composer-prompt-chip" title={quickPrompt} onClick={() => onPromptChange(quickPrompt)}>{quickPrompt}</button>)}</div> : null}{attachments.length ? <div className="composer-attachment-chips">{attachments.map((attachment) => <button key={attachment.id} type="button" className="composer-attachment-chip" onClick={() => onRemoveAttachment(attachment.id)} title={locale === "zh" ? "移除附件" : "Remove attachment"}>{attachment.name} ×</button>)}</div> : null}<textarea className="composer-input" value={prompt} onChange={(event) => onPromptChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (!activeRunId && (prompt.trim() || attachments.length)) onRun(); } }} placeholder={chatPlaceholder} /><div className="composer-actions"><div className="composer-left-actions"><div className="composer-add-wrap"><button type="button" className="composer-add" title={locale === "zh" ? "添加附件或知识库" : "Add files or knowledge"} aria-expanded={attachmentMenuOpen} onClick={() => setAttachmentMenuOpen((open) => !open)}>＋</button>{attachmentMenuOpen ? <div className="composer-add-menu" role="menu"><button type="button" role="menuitem" onClick={() => { setAttachmentMenuOpen(false); attachmentInputRef.current?.click(); }}>⌕ {locale === "zh" ? "上传本地文件" : "Upload local file"}</button><button type="button" role="menuitem" onClick={() => { setAttachmentMenuOpen(false); onKnowledgeToggle(); }}>⌑ {locale === "zh" ? "添加 Obsidian 知识库" : "Add Obsidian knowledge"}</button></div> : null}<input ref={attachmentInputRef} type="file" multiple accept="image/*,.txt,.md,.docx,.pdf,.csv,.json,text/*,application/json,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" onChange={(event) => { onAddAttachments(event.target.files); event.currentTarget.value = ""; }} /></div>{knowledgeEnabled ? <div className="composer-knowledge-control"><button type="button" className="composer-knowledge-button" onClick={onKnowledgeToggle}>{locale === "zh" ? "⌑ Obsidian 知识库" : "⌑ Obsidian context"}</button><button type="button" className="composer-knowledge-close" aria-label={locale === "zh" ? "关闭 Obsidian 知识库上下文" : "Disable Obsidian knowledge"} onClick={onKnowledgeToggle}>×</button></div> : null}</div><span className="muted composer-hint">{localizedRunStatus || (locale === "zh" ? "Enter 发送 · Shift+Enter 换行" : "Enter to send · Shift+Enter for a new line")}</span><ModelControls locale={locale} model={model} models={models} reasoningEffort={reasoningEffort} skillId={skillId} showSkill={false} onModelChange={onModelChange} onReasoningChange={onReasoningChange} onSkillChange={onSkillChange} />{activeRunId ? <button className="ghost" onClick={onCancel}>{copy.stop}</button> : <button className="send-button" disabled={!prompt.trim() && !attachments.length} onClick={() => onRun()}>{copy.send}</button>}</div></div></div>
    </section>
  </div>;
}

// Kept as a compatibility fallback while the cloud-shaped writer adapter is exercised in production.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function DesktopWriterWorkspace({ route, prompt, onPromptChange, runStatus, activeRunId, onRun, onCancel, activePrompt, activePromptAt, assistantText, assistantAt, toolEvents, artifacts, onArtifactOpen, model, reasoningEffort, skillId, onModelChange, onReasoningChange, onSkillChange }: {
  route: DesktopRoute;
  prompt: string;
  onPromptChange: (value: string) => void;
  runStatus: string;
  activeRunId: string | null;
  onRun: (value: string) => void;
  onCancel: () => void;
  activePrompt: string;
  activePromptAt?: string;
  assistantText: string;
  assistantAt?: string;
  toolEvents: string[];
  artifacts: Array<{ id: string; relative_path: string; mime_type: string; byte_length?: number }>;
  onArtifactOpen: (relativePath: string, mimeType: string) => void;
  model: string;
  models?: readonly string[];
  reasoningEffort: string;
  skillId: SkillId;
  onModelChange: (value: string) => void;
  onReasoningChange: (value: string) => void;
  onSkillChange: (value: SkillId) => void;
}) {
  const [platform, setPlatform] = useState("wechat");
  const [contentType, setContentType] = useState("longform");
  const [mode, setMode] = useState("article");
  const [language, setLanguage] = useState("auto");
  const submit = () => onRun([`平台：${WORKBENCH_WRITER_PLATFORMS.find((item) => item.id === platform)?.label ?? platform}`, `内容类型：${WORKBENCH_WRITER_CONTENT_TYPES.find((item) => item.id === contentType)?.label ?? contentType}`, `模式：${WORKBENCH_WRITER_MODES.find((item) => item.id === mode)?.label ?? mode}`, `语言：${WORKBENCH_WRITER_LANGUAGES.find((item) => item.id === language)?.label ?? language}`, prompt.trim()].filter(Boolean).join("\n"));
  return <div className="writer-workspace"><header className="workflow-page-header"><div><div className="eyebrow">WRITER WORKSPACE</div><h1>{route.label}</h1><p>{route.description}</p></div><div className="workflow-header-actions"><span className="chat-runtime-badge">OpenCode · 内容写作 Skill</span><ModelControls model={model} reasoningEffort={reasoningEffort} skillId={skillId} onModelChange={onModelChange} onReasoningChange={onReasoningChange} onSkillChange={onSkillChange} /></div></header><div className="writer-workspace-grid"><section className="writer-editor-panel"><div className="section-title"><span>写作设置</span><span className="muted">本地草稿</span></div><div className="writer-option-group"><span className="writer-option-label">发布平台</span><div className="media-tabs writer-platform-tabs">{WORKBENCH_WRITER_PLATFORMS.map((item) => <button key={item.id} type="button" className={platform === item.id ? "active" : ""} onClick={() => setPlatform(item.id)}>{item.label}</button>)}</div></div><div className="writer-option-group"><span className="writer-option-label">内容类型</span><div className="media-tabs writer-platform-tabs">{WORKBENCH_WRITER_CONTENT_TYPES.map((item) => <button key={item.id} type="button" className={contentType === item.id ? "active" : ""} onClick={() => setContentType(item.id)}>{item.label}</button>)}</div></div><div className="writer-option-group"><span className="writer-option-label">输出模式</span><div className="media-tabs">{WORKBENCH_WRITER_MODES.map((item) => <button key={item.id} type="button" className={mode === item.id ? "active" : ""} onClick={() => setMode(item.id)}>{item.label}</button>)}</div></div><label className="workflow-editor-field"><span>语言</span><select value={language} onChange={(event) => setLanguage(event.target.value)}>{WORKBENCH_WRITER_LANGUAGES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="workflow-editor-field"><span>主题、受众、语气与结构</span><textarea value={prompt} onChange={(event) => onPromptChange(event.target.value)} placeholder="描述你要写的主题、目标受众、语气、关键词和交付格式……" /></label><div className="composer-actions"><span className="muted">{runStatus || "每次写作都经过本地 OpenCode"}</span>{activeRunId ? <button className="ghost" onClick={onCancel}>停止</button> : <button className="send-button" disabled={!prompt.trim()} onClick={submit}>生成内容</button>}</div></section><section className="writer-preview-panel"><div className="section-title"><span>内容预览</span><span className="muted">{assistantText ? "可继续修改" : "等待生成"}</span></div>{activePrompt ? <WorkbenchWriterMessage role="user" label="你" content={activePrompt} timestamp={activePromptAt} /> : <div className="empty-state"><strong>开始你的第一篇内容</strong><p>选择平台与内容类型后输入主题，生成结果会显示在这里。</p></div>}{assistantText || activeRunId ? <WorkbenchWriterMessage role="assistant" label="AI Marketing" content={assistantText} timestamp={assistantAt} pending={!assistantText && Boolean(activeRunId)} events={toolEvents.map((item) => ({ type: "tool", label: item, status: "info" }))} artifacts={artifacts.map((item) => ({ id: item.id, title: item.relative_path, relativePath: item.relative_path, mimeType: item.mime_type, byteLength: item.byte_length }))} onArtifactOpen={onArtifactOpen} /> : null}</section></div></div>;
}

// Legacy single-turn writer surface retained only as a migration fallback.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function DesktopWriterCloudWorkspaceLegacy({ route, prompt, onPromptChange, runStatus, activeRunId, onRun, onGenerateImages, onCancel, activePrompt, activePromptAt, assistantText, assistantAt, messages, toolEvents, artifacts, onArtifactOpen, model, reasoningEffort, skillId, onModelChange, onReasoningChange, onSkillChange }: {
  route: DesktopRoute;
  prompt: string;
  onPromptChange: (value: string) => void;
  runStatus: string;
  activeRunId: string | null;
  onRun: (value: string) => void;
  onGenerateImages?: () => void;
  onCancel: () => void;
  activePrompt: string;
  activePromptAt?: string;
  assistantText: string;
  assistantAt?: string;
  messages: DesktopConversationMessage[];
  toolEvents: string[];
  artifacts: Array<{ id: string; relative_path: string; mime_type: string; byte_length?: number }>;
  onArtifactOpen: (relativePath: string, mimeType: string) => void;
  model: string;
  reasoningEffort: string;
  skillId: SkillId;
  onModelChange: (value: string) => void;
  onReasoningChange: (value: string) => void;
  onSkillChange: (value: SkillId) => void;
}) {
  const [platform, setPlatform] = useState("wechat");
  const [contentType, setContentType] = useState("longform");
  const [mode, setMode] = useState("article");
  const [language, setLanguage] = useState("auto");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [copyKind, setCopyKind] = useState<"rich" | "markdown" | null>(null);
  const hasMessages = Boolean(activePrompt || assistantText || activeRunId);
  const submit = () => onRun([`平台：${WORKBENCH_WRITER_PLATFORMS.find((item) => item.id === platform)?.label ?? platform}`, `内容类型：${WORKBENCH_WRITER_CONTENT_TYPES.find((item) => item.id === contentType)?.label ?? contentType}`, `模式：${WORKBENCH_WRITER_MODES.find((item) => item.id === mode)?.label ?? mode}`, `语言：${WORKBENCH_WRITER_LANGUAGES.find((item) => item.id === language)?.label ?? language}`, prompt.trim()].filter(Boolean).join("\n"));
  const runEvents = toolEvents.map((item) => ({ type: "tool", label: item, status: "info" as const }));
  const runArtifacts = artifacts.map((item) => ({ id: item.id, title: item.relative_path, relativePath: item.relative_path, mimeType: item.mime_type, byteLength: item.byte_length }));
  const readingMinutes = Math.max(1, Math.ceil(assistantText.trim().split(/\s+/).filter(Boolean).length / 260));
  const copyText = async (kind: "rich" | "markdown") => {
    try { await navigator.clipboard?.writeText(assistantText); setCopyKind(kind); window.setTimeout(() => setCopyKind(null), 1400); } catch { setCopyKind(null); }
  };
  return <div className="chat-canvas flex h-full min-h-0 justify-center"><section className="chat-workspace-section writer-cloud-workspace"><header className="chat-page-header"><div><h1 className="chat-page-title">{route.label}</h1><p className="chat-page-subtitle">{route.description}</p></div><div className="workflow-header-actions"><span className="chat-runtime-badge">OpenCode · 内容写作 Skill</span><ModelControls model={model} reasoningEffort={reasoningEffort} skillId={skillId} onModelChange={onModelChange} onReasoningChange={onReasoningChange} onSkillChange={onSkillChange} /></div></header><div className="writer-cloud-scroll chat-message-scroll"><div className="chat-message-column">{!hasMessages ? <div className="writer-quick-start"><div className="dashboard-kicker">快捷开始</div><div className="writer-quick-start-grid">{WORKBENCH_WRITER_QUICK_PROMPTS.map((item) => <button key={item} type="button" className="home-quick-start-card" onClick={() => onPromptChange(item)}><span className="dashboard-kicker">✦ 快速开始</span><span>{item}</span></button>)}</div></div> : null}{activePrompt ? <WorkbenchWriterMessage role="user" label="你的指令" content={activePrompt} timestamp={activePromptAt} /> : null}{assistantText || activeRunId ? <><WorkbenchWriterMessage role="assistant" label="AI RESPONSE" content={assistantText} timestamp={assistantAt} pending={!assistantText && Boolean(activeRunId)} events={runEvents} artifacts={runArtifacts} onArtifactOpen={onArtifactOpen} /><div className="writer-message-actions" data-testid="writer-message-actions"><button type="button" className="dashboard-button-secondary" onClick={() => setPreviewOpen(true)} disabled={!assistantText}>预览</button><button type="button" className="dashboard-button-primary" onClick={onGenerateImages} disabled={!assistantText || Boolean(activeRunId)}>生成图片</button><button type="button" className="dashboard-button-secondary" onClick={() => void copyText("rich")} disabled={!assistantText}>{copyKind === "rich" ? "已复制" : "复制富文本"}</button><button type="button" className="dashboard-button-secondary" onClick={() => void copyText("markdown")} disabled={!assistantText}>{copyKind === "markdown" ? "已复制" : "复制 Markdown"}</button></div></> : null}{!hasMessages && runStatus ? <div className="writer-status-message">{runStatus}</div> : null}</div></div><div className="chat-composer-dock"><div className="chat-composer writer-cloud-composer"><div className="writer-composer-toolbar"><label className="writer-toolbar-select"><span>平台</span><select value={platform} onChange={(event) => setPlatform(event.target.value)}>{WORKBENCH_WRITER_PLATFORMS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="writer-toolbar-select"><span>内容</span><select value={contentType} onChange={(event) => setContentType(event.target.value)}>{WORKBENCH_WRITER_CONTENT_TYPES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="writer-toolbar-select"><span>模式</span><select value={mode} onChange={(event) => setMode(event.target.value)}>{WORKBENCH_WRITER_MODES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="writer-toolbar-select"><span>语言</span><select value={language} onChange={(event) => setLanguage(event.target.value)}>{WORKBENCH_WRITER_LANGUAGES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><span className="writer-status-chip">{runStatus || "支持文案预览与配图生成"}</span><button type="button" className="ghost writer-toolbar-action" onClick={() => onPromptChange("")}>新建</button><button type="button" className="ghost writer-toolbar-action" onClick={() => setPreviewOpen(true)} disabled={!assistantText}>预览</button></div><textarea className="composer-input writer-cloud-input" value={prompt} onChange={(event) => onPromptChange(event.target.value)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); if (!activeRunId && prompt.trim()) submit(); } }} placeholder="告诉我你的写作目标、受众和渠道。例如：写一篇面向品牌负责人的招商文章，并附带 CTA。" /><div className="writer-composer-footer"><p>{WORKBENCH_WRITER_PLATFORMS.find((item) => item.id === platform)?.label} / {WORKBENCH_WRITER_MODES.find((item) => item.id === mode)?.label} / {WORKBENCH_WRITER_LANGUAGES.find((item) => item.id === language)?.label} / 支持预览与配图</p>{activeRunId ? <button type="button" className="ghost" onClick={onCancel}>停止</button> : <button type="button" className="send-button" disabled={!prompt.trim()} onClick={submit}>发送</button>}</div></div></div></section>{previewOpen ? <div className="writer-preview-overlay" role="dialog" aria-modal="true"><section className="writer-preview-sheet"><header><div><div className="dashboard-kicker">预览 · {WORKBENCH_WRITER_PLATFORMS.find((item) => item.id === platform)?.label}</div><h2>最终预览</h2><p className="writer-preview-description">{readingMinutes} 分钟阅读 · {assistantText ? "可继续编辑、导出或复制" : "等待内容生成"}</p></div><button type="button" className="ghost" onClick={() => setPreviewOpen(false)}>关闭</button></header><WorkbenchWriterMessage role="assistant" label="AI RESPONSE" content={assistantText} timestamp={assistantAt} artifacts={runArtifacts} onArtifactOpen={onArtifactOpen} /><div className="writer-preview-actions"><button type="button" className="dashboard-button-primary" onClick={() => void copyText("rich")}>{copyKind === "rich" ? "已复制" : "复制富文本"}</button><button type="button" className="dashboard-button-secondary" onClick={() => void copyText("markdown")}>{copyKind === "markdown" ? "已复制" : "复制 Markdown"}</button><button type="button" className="dashboard-button-secondary" onClick={() => { setPreviewOpen(false); onGenerateImages?.(); }}>生成图片配图</button><button type="button" className="ghost" onClick={() => setPreviewOpen(false)}>完成</button></div></section></div> : null}</div>;
}

type DesktopWriterCloudWorkspaceProps = {
  locale: "zh" | "en";
  route: DesktopRoute;
  prompt: string;
  onPromptChange: (value: string) => void;
  runStatus: string;
  activeRunId: string | null;
  onRun: (value: string) => void;
  onGenerateImages?: () => void;
  onCancel: () => void;
  activePrompt: string;
  activePromptAt?: string;
  assistantText: string;
  onAssistantTextChange: (value: string) => void;
  onSaveDraft: (value: string) => void | Promise<void>;
  assistantAt?: string;
  messages: DesktopConversationMessage[];
  toolEvents: string[];
  artifacts: Array<{ id: string; relative_path: string; mime_type: string; byte_length?: number }>;
  onArtifactOpen: (relativePath: string, mimeType: string) => void;
  model: string;
  models?: readonly string[];
  reasoningEffort: string;
  skillId: SkillId;
  attachments: LocalAttachment[];
  onAddAttachments: (files: FileList | null) => void;
  onRemoveAttachment: (id: string) => void;
  knowledgeEnabled: boolean;
  onKnowledgeToggle: () => void;
  onModelChange: (value: string) => void;
  onReasoningChange: (value: string) => void;
  onSkillChange: (value: SkillId) => void;
};

function writerOptionLabel(kind: "platform" | "content" | "mode" | "language", item: { id: string; label: string }, locale: "zh" | "en") {
  if (locale === "zh") return item.label;
  const maps = { platform: writerPlatformEnglish, content: writerContentTypeEnglish, mode: writerModeEnglish, language: writerLanguageEnglish };
  return maps[kind][item.id] ?? item.label;
}

function DesktopWriterCloudWorkspace(props: DesktopWriterCloudWorkspaceProps) {
  const { locale, route, prompt, onPromptChange, runStatus, activeRunId, onRun, onGenerateImages, onCancel, activePrompt, activePromptAt, assistantText, onAssistantTextChange, onSaveDraft, assistantAt, messages, toolEvents, artifacts, onArtifactOpen, model, models, reasoningEffort, skillId, attachments, onAddAttachments, onRemoveAttachment, knowledgeEnabled, onKnowledgeToggle, onModelChange, onReasoningChange, onSkillChange } = props;
  const writerCopy = locale === "zh" ? { skill: "内容写作 Skill", quick: "快捷开始", quickStart: "快速开始", you: "你", assistant: "写作助手", preview: "预览", generateImage: "生成图片", copied: "已复制", rich: "复制富文本", markdown: "复制 Markdown", status: "支持文案预览与配图生成", new: "新建", close: "关闭", done: "完成", send: "发送", stop: "停止", platform: "平台", content: "内容", mode: "模式", language: "语言", finalPreview: "最终预览", previewHint: "可继续编辑、导出或复制。", generateImageWithCopy: "生成图片配图", placeholder: "告诉我你的写作目标、受众和渠道。例如：写一篇面向品牌负责人的招商文章。" } : { skill: "Content Writing Skill", quick: "Quick start", quickStart: "Quick start", you: "You", assistant: "Writing assistant", preview: "Preview", generateImage: "Generate image", copied: "Copied", rich: "Copy rich text", markdown: "Copy Markdown", status: "Preview and image generation supported", new: "New", close: "Close", done: "Done", send: "Send", stop: "Stop", platform: "Platform", content: "Content", mode: "Mode", language: "Language", finalPreview: "Final preview", previewHint: "Continue editing, exporting, or copying.", generateImageWithCopy: "Generate image assets", placeholder: "Tell me your writing goal, audience, and channel. For example: write a partner acquisition article for brand leaders." };
  const writerQuickPrompts = locale === "zh" ? WORKBENCH_WRITER_QUICK_PROMPTS : ["Write a high-converting campaign article", "Turn this brief into a social media thread", "Create a concise product launch email"];
  const localizedRunStatus = localizeDesktopStatus(runStatus, locale);
  const [platform, setPlatform] = useState("wechat");
  const [contentType, setContentType] = useState("longform");
  const [mode, setMode] = useState("article");
  const [language, setLanguage] = useState("auto");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewEditing, setPreviewEditing] = useState(false);
  const [previewDraft, setPreviewDraft] = useState(assistantText);
  const [copyKind, setCopyKind] = useState<"rich" | "markdown" | null>(null);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!previewEditing) setPreviewDraft(assistantText); }, [assistantText, previewEditing]);
  useEffect(() => {
    const textarea = document.querySelector<HTMLTextAreaElement>(".writer-cloud-input");
    if (!textarea) return;
    const blockPlainEnter = (event: KeyboardEvent) => {
      if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    textarea.addEventListener("keydown", blockPlainEnter, true);
    return () => textarea.removeEventListener("keydown", blockPlainEnter, true);
  }, []);
  const commitPreviewDraft = () => { const next = previewDraft.trim(); if (!next) return; onAssistantTextChange(next); setPreviewEditing(false); void onSaveDraft(next); };
  const baseMessages = messages.length ? messages : (activePrompt ? [{ id: "active-user", role: "user" as const, content: activePrompt, created_at: activePromptAt }] : []);
  const last = baseMessages[baseMessages.length - 1];
  const currentAssistant = Boolean(assistantText || activeRunId) && !(last?.role === "assistant" && last.content === assistantText && !activeRunId);
  const displayedMessages = currentAssistant ? [...baseMessages, { id: "active-assistant", role: "assistant" as const, content: assistantText, created_at: assistantAt }] : baseMessages;
  const hasMessages = displayedMessages.length > 0;
  const runEvents = toolEvents.map((item) => ({ type: "tool", label: item, status: "info" as const }));
  const runArtifacts = artifacts.map((item) => ({ id: item.id, title: item.relative_path, relativePath: item.relative_path, mimeType: item.mime_type, byteLength: item.byte_length }));
  const submit = () => onRun([
    `${writerCopy.platform}: ${writerOptionLabel("platform", WORKBENCH_WRITER_PLATFORMS.find((item) => item.id === platform) ?? { id: platform, label: platform }, locale)}`,
    `${writerCopy.content}: ${writerOptionLabel("content", WORKBENCH_WRITER_CONTENT_TYPES.find((item) => item.id === contentType) ?? { id: contentType, label: contentType }, locale)}`,
    `${writerCopy.mode}: ${writerOptionLabel("mode", WORKBENCH_WRITER_MODES.find((item) => item.id === mode) ?? { id: mode, label: mode }, locale)}`,
    `${writerCopy.language}: ${writerOptionLabel("language", WORKBENCH_WRITER_LANGUAGES.find((item) => item.id === language) ?? { id: language, label: language }, locale)}`,
    assistantText.trim() ? `${locale === "zh" ? "当前已编辑草稿" : "Current edited draft"}:\n${assistantText.trim()}` : "",
    prompt.trim(),
  ].filter(Boolean).join("\n"));
  const copyText = async (kind: "rich" | "markdown") => { try { await navigator.clipboard?.writeText(assistantText); setCopyKind(kind); window.setTimeout(() => setCopyKind(null), 1400); } catch { setCopyKind(null); } };
  return (
    <div className="chat-canvas flex h-full min-h-0 justify-center">
      <section className="chat-workspace-section writer-cloud-workspace">
        <header className="chat-page-header"><div><h1 className="chat-page-title">{route.label}</h1><p className="chat-page-subtitle">{route.description}</p></div><div className="workflow-header-actions"><span className="chat-runtime-badge">OpenCode · {writerCopy.skill}</span><ModelControls locale={locale} model={model} models={models} reasoningEffort={reasoningEffort} skillId={skillId} onModelChange={onModelChange} onReasoningChange={onReasoningChange} onSkillChange={onSkillChange} /></div></header>
        <div className="writer-cloud-scroll chat-message-scroll"><div className="chat-message-column">
          {!hasMessages ? <div className="writer-quick-start"><div className="dashboard-kicker">{writerCopy.quick}</div><div className="writer-quick-start-grid">{writerQuickPrompts.map((item) => <button key={item} type="button" className="home-quick-start-card" onClick={() => onPromptChange(item)}><span className="dashboard-kicker">✦ {writerCopy.quickStart}</span><span>{item}</span></button>)}</div></div> : null}
          {displayedMessages.map((message, index) => <WorkbenchWriterMessage key={message.id} role={message.role} label={message.role === "user" ? writerCopy.you : writerCopy.assistant} content={message.content} timestamp={message.created_at} pending={message.role === "assistant" && Boolean(activeRunId) && index === displayedMessages.length - 1 && !message.content} events={message.role === "assistant" && index === displayedMessages.length - 1 ? runEvents : []} artifacts={message.role === "assistant" && index === displayedMessages.length - 1 ? runArtifacts : []} onArtifactOpen={onArtifactOpen} />)}
          {assistantText || activeRunId ? <div className="writer-message-actions" data-testid="writer-message-actions"><button type="button" className="dashboard-button-secondary" onClick={() => setPreviewOpen(true)} disabled={!assistantText}>{writerCopy.preview}</button><button type="button" className="dashboard-button-primary" onClick={onGenerateImages} disabled={!assistantText || Boolean(activeRunId)}>{writerCopy.generateImage}</button><button type="button" className="dashboard-button-secondary" onClick={() => void copyText("rich")} disabled={!assistantText}>{copyKind === "rich" ? writerCopy.copied : writerCopy.rich}</button><button type="button" className="dashboard-button-secondary" onClick={() => void copyText("markdown")} disabled={!assistantText}>{copyKind === "markdown" ? writerCopy.copied : writerCopy.markdown}</button></div> : null}
          {!hasMessages && localizedRunStatus ? <div className="writer-status-message">{localizedRunStatus}</div> : null}
        </div></div>
        <div className="chat-composer-dock"><div className="chat-composer writer-cloud-composer"><div className="writer-composer-toolbar"><label className="writer-toolbar-select"><span>{writerCopy.platform}</span><select value={platform} onChange={(event) => setPlatform(event.target.value)}>{WORKBENCH_WRITER_PLATFORMS.map((item) => <option key={item.id} value={item.id}>{writerOptionLabel("platform", item, locale)}</option>)}</select></label><label className="writer-toolbar-select"><span>{writerCopy.content}</span><select value={contentType} onChange={(event) => setContentType(event.target.value)}>{WORKBENCH_WRITER_CONTENT_TYPES.map((item) => <option key={item.id} value={item.id}>{writerOptionLabel("content", item, locale)}</option>)}</select></label><label className="writer-toolbar-select"><span>{writerCopy.mode}</span><select value={mode} onChange={(event) => setMode(event.target.value)}>{WORKBENCH_WRITER_MODES.map((item) => <option key={item.id} value={item.id}>{writerOptionLabel("mode", item, locale)}</option>)}</select></label><label className="writer-toolbar-select"><span>{writerCopy.language}</span><select value={language} onChange={(event) => setLanguage(event.target.value)}>{WORKBENCH_WRITER_LANGUAGES.map((item) => <option key={item.id} value={item.id}>{writerOptionLabel("language", item, locale)}</option>)}</select></label><span className="writer-status-chip">{localizedRunStatus || writerCopy.status}</span><button type="button" className="ghost writer-toolbar-action" onClick={() => onPromptChange("")}>{writerCopy.new}</button><button type="button" className="ghost writer-toolbar-action" onClick={() => setPreviewOpen(true)} disabled={!assistantText}>{writerCopy.preview}</button></div>{attachments.length ? <div className="composer-attachment-chips">{attachments.map((attachment) => <button key={attachment.id} type="button" className="composer-attachment-chip" onClick={() => onRemoveAttachment(attachment.id)} title={locale === "zh" ? "移除附件" : "Remove attachment"}>{attachment.name} ×</button>)}</div> : null}<textarea className="composer-input writer-cloud-input" value={prompt} onChange={(event) => onPromptChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (!activeRunId && (prompt.trim() || attachments.length)) submit(); } }} placeholder={writerCopy.placeholder} /><div className="writer-composer-footer"><div className="composer-left-actions"><div className="composer-add-wrap"><button type="button" className="composer-add" title={locale === "zh" ? "添加附件或知识库" : "Add files or knowledge"} aria-expanded={attachmentMenuOpen} onClick={() => setAttachmentMenuOpen((open) => !open)}>＋</button>{attachmentMenuOpen ? <div className="composer-add-menu" role="menu"><button type="button" role="menuitem" onClick={() => { setAttachmentMenuOpen(false); attachmentInputRef.current?.click(); }}>⌕ {locale === "zh" ? "上传本地文件" : "Upload local file"}</button><button type="button" role="menuitem" onClick={() => { setAttachmentMenuOpen(false); onKnowledgeToggle(); }}>⌑ {locale === "zh" ? "添加 Obsidian 知识库" : "Add Obsidian knowledge"}</button></div> : null}<input ref={attachmentInputRef} type="file" multiple accept="image/*,.txt,.md,.docx,.pdf,.csv,.json,text/*,application/json,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" onChange={(event) => { onAddAttachments(event.target.files); event.currentTarget.value = ""; }} /></div>{knowledgeEnabled ? <div className="composer-knowledge-control"><button type="button" className="composer-knowledge-button" onClick={onKnowledgeToggle}>{locale === "zh" ? "⌑ Obsidian 知识库" : "⌑ Obsidian context"}</button><button type="button" className="composer-knowledge-close" aria-label={locale === "zh" ? "关闭 Obsidian 知识库上下文" : "Disable Obsidian knowledge"} onClick={onKnowledgeToggle}>×</button></div> : null}</div><p>{writerOptionLabel("platform", WORKBENCH_WRITER_PLATFORMS.find((item) => item.id === platform) ?? { id: platform, label: platform }, locale)} / {writerOptionLabel("mode", WORKBENCH_WRITER_MODES.find((item) => item.id === mode) ?? { id: mode, label: mode }, locale)} / {writerOptionLabel("language", WORKBENCH_WRITER_LANGUAGES.find((item) => item.id === language) ?? { id: language, label: language }, locale)} / {writerCopy.previewHint}</p>{activeRunId ? <button type="button" className="ghost" onClick={onCancel}>{writerCopy.stop}</button> : <button type="button" className="send-button" disabled={!prompt.trim() && !attachments.length} onClick={submit}>{writerCopy.send}</button>}</div></div></div>
        {previewOpen ? <div className="writer-preview-overlay" role="dialog" aria-modal="true"><section className="writer-preview-sheet"><header><div><div className="dashboard-kicker">{writerCopy.preview}</div><h2>{writerCopy.finalPreview}</h2><p className="writer-preview-description">{writerCopy.previewHint}</p></div><button type="button" className="ghost" onClick={() => setPreviewOpen(false)}>{writerCopy.close}</button></header>{previewEditing ? <textarea className="writer-preview-editor" autoFocus value={previewDraft} onChange={(event) => setPreviewDraft(event.target.value)} onKeyDown={(event) => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); commitPreviewDraft(); } if (event.key === "Escape") { event.preventDefault(); setPreviewDraft(assistantText); setPreviewEditing(false); } }} /> : <WorkbenchWriterMessage role="assistant" label="AI RESPONSE" content={assistantText} timestamp={assistantAt} artifacts={runArtifacts} onArtifactOpen={onArtifactOpen} />}<div className="writer-preview-actions"><button type="button" className="dashboard-button-secondary" onClick={() => { if (previewEditing) commitPreviewDraft(); else setPreviewEditing(true); }} disabled={!assistantText}>{previewEditing ? writerCopy.done : (locale === "zh" ? "编辑内容" : "Edit content")}</button><button type="button" className="dashboard-button-primary" onClick={() => void copyText("rich")}>{copyKind === "rich" ? writerCopy.copied : writerCopy.rich}</button><button type="button" className="dashboard-button-secondary" onClick={() => void copyText("markdown")}>{copyKind === "markdown" ? writerCopy.copied : writerCopy.markdown}</button><button type="button" className="dashboard-button-secondary" onClick={() => { setPreviewOpen(false); onGenerateImages?.(); }}>{writerCopy.generateImageWithCopy}</button><button type="button" className="ghost" onClick={() => setPreviewOpen(false)}>{writerCopy.done}</button></div></section></div> : null}
      </section>
    </div>
  );
}

type DesktopWorkflowWorkspaceProps = {
  route: DesktopRoute;
  prompt: string;
  onPromptChange: (value: string) => void;
  runStatus: string;
  activeRunId: string | null;
  onRun: (definition: WorkflowDefinitionEnvelope) => void;
  onCancel: () => void;
  savedWorkflows: SavedWorkflow[];
  workflowAction: WorkflowAction;
  onWorkflowAction: (value: WorkflowAction) => void;
  definition: WorkflowDefinitionEnvelope | null;
  onDefinitionChange: (value: WorkflowDefinitionEnvelope) => void;
  onSave: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
  model: string;
  models?: readonly string[];
  reasoningEffort: string;
  skillId: SkillId;
  onModelChange: (value: string) => void;
  onReasoningChange: (value: string) => void;
  onSkillChange: (value: SkillId) => void;
};

function DesktopWorkflowCanvas({
  nodes,
  edges,
  selectedNodeKey,
  onSelectNode,
  onMoveNode,
  providerConfigured = activeMediaProviderConfigured,
  locale,
}: {
  nodes: WorkflowDefinitionNodeV2[];
  edges: Array<{ sourceNodeKey: string; targetNodeKey: string }>;
  selectedNodeKey: string | null;
  onSelectNode: (nodeKey: string) => void;
  onMoveNode: (nodeKey: string, position: { x: number; y: number }) => void;
  providerConfigured?: boolean;
  locale: "zh" | "en";
}) {
  const [viewport, setViewport] = useState({ x: 24, y: 24, scale: 1 });
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ kind: "node" | "pan"; nodeKey?: string; x: number; y: number; startX: number; startY: number; startScale?: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const nodeByKey = useMemo(() => new Map(nodes.map((node) => [node.nodeKey, node])), [nodes]);
  const nodeWidth = 188;
  const nodeHeight = 92;
  const canvasPoint = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (event.clientX - rect.left - viewport.x) / viewport.scale, y: (event.clientY - rect.top - viewport.y) / viewport.scale };
  };
  const startNodeDrag = (event: React.PointerEvent<HTMLButtonElement>, node: WorkflowDefinitionNodeV2) => {
    event.stopPropagation();
    onSelectNode(node.nodeKey);
    if (event.button !== 0) return;
    const point = canvasPoint(event as unknown as React.PointerEvent<HTMLDivElement>);
    dragRef.current = { kind: "node", nodeKey: node.nodeKey, x: point.x, y: point.y, startX: node.positionX, startY: node.positionY };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const startPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    dragRef.current = { kind: "pan", x: event.clientX, y: event.clientY, startX: viewport.x, startY: viewport.y };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const movePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.kind === "pan") setViewport((current) => ({ ...current, x: drag.startX + event.clientX - drag.x, y: drag.startY + event.clientY - drag.y }));
    else if (drag.nodeKey) {
      const point = canvasPoint(event);
      onMoveNode(drag.nodeKey, { x: Math.round(drag.startX + point.x - drag.x), y: Math.round(drag.startY + point.y - drag.y) });
    }
  };
  const endPointer = () => { dragRef.current = null; setDragging(false); };
  const adjustZoom = (delta: number) => setViewport((current) => ({ ...current, scale: Math.max(0.55, Math.min(1.45, Number((current.scale + delta).toFixed(2)))) }));
  const fitCanvas = () => {
    if (!nodes.length) return;
    const minX = Math.min(...nodes.map((node) => node.positionX));
    const minY = Math.min(...nodes.map((node) => node.positionY));
    const maxX = Math.max(...nodes.map((node) => node.positionX + nodeWidth));
    const maxY = Math.max(...nodes.map((node) => node.positionY + nodeHeight));
    setViewport({ x: Math.max(18, (620 - (maxX - minX)) / 2 - minX), y: Math.max(18, (260 - (maxY - minY)) / 2 - minY), scale: Math.max(0.55, Math.min(1.1, 620 / Math.max(620, maxX - minX + 80))) });
  };
  const nodeTitle = (node: WorkflowDefinitionNodeV2) => {
    if (locale === "zh") return node.title;
    if (node.nodeKey === "input") return "Input task";
    if (node.nodeKey === "output") return "Local artifact";
    return workflowActionEnglish[node.type] ?? node.title;
  };
  return <div ref={viewportRef} className={`workflow-canvas-viewport ${dragging ? "is-dragging" : ""}`} onPointerDown={startPan} onPointerMove={movePointer} onPointerUp={endPointer} onPointerCancel={endPointer}>
    <div className="workflow-canvas-grid" />
    <div className="workflow-canvas-tools" aria-label={locale === "en" ? "Canvas controls" : "画布控制"}>
      <button type="button" className="canvas-tool-button" onClick={() => adjustZoom(-0.12)} aria-label={locale === "en" ? "Zoom out" : "缩小"}>−</button>
      <span className="canvas-zoom-label">{Math.round(viewport.scale * 100)}%</span>
      <button type="button" className="canvas-tool-button" onClick={() => adjustZoom(0.12)} aria-label={locale === "en" ? "Zoom in" : "放大"}>＋</button>
      <button type="button" className="canvas-tool-button" onClick={fitCanvas}>{locale === "en" ? "Fit" : "适配"}</button>
    </div>
    <div className="workflow-canvas-scene" style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}>
      <svg className="workflow-canvas-edges" aria-hidden="true">
        {edges.map((edge) => { const source = nodeByKey.get(edge.sourceNodeKey); const target = nodeByKey.get(edge.targetNodeKey); if (!source || !target) return null; const x1 = source.positionX + nodeWidth; const y1 = source.positionY + nodeHeight / 2; const x2 = target.positionX; const y2 = target.positionY + nodeHeight / 2; const bend = Math.max(42, Math.abs(x2 - x1) / 2); return <path key={`${edge.sourceNodeKey}-${edge.targetNodeKey}`} d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`} />; })}
      </svg>
      {nodes.map((node, index) => <button key={node.nodeKey} type="button" className={`workflow-node workflow-canvas-node ${selectedNodeKey === node.nodeKey ? "workflow-node-active" : ""}`} style={{ left: node.positionX, top: node.positionY }} onPointerDown={(event) => startNodeDrag(event, node)} onClick={() => onSelectNode(node.nodeKey)}>
        <span>{index + 1}</span><strong>{nodeTitle(node)}</strong><small>{node.type}</small>{!providerConfigured && requiresConfiguredProviderForWorkflowAction(node.type) ? <em>{locale === "en" ? "Configuration required" : "需要配置"}</em> : null}<i aria-hidden="true" />
      </button>)}
    </div>
    {!providerConfigured && nodes.some((node) => requiresConfiguredProviderForWorkflowAction(node.type)) ? <div className="workflow-provider-warning"><strong>{locale === "en" ? "Configuration required" : "需要配置 Provider"}</strong><span>{locale === "en" ? "A media node is visible but cannot run until its Provider and configured model are set." : "媒体节点仍可编辑，但需先配置 Provider 和已配置模型才可运行。"}</span><button type="button" className="link-button" onClick={openWorkflowProviderSettings}>{locale === "en" ? "Open model settings" : "打开模型配置"}</button></div> : null}
  </div>;
}

function DesktopWorkflowWorkspace({ route, prompt, onPromptChange, runStatus, activeRunId, onRun, onCancel, savedWorkflows, workflowAction, onWorkflowAction, definition, onDefinitionChange, onSave, onExport, onImport, model, models, reasoningEffort, skillId, onModelChange, onReasoningChange, onSkillChange, locale }: DesktopWorkflowWorkspaceProps & { locale: "zh" | "en" }) {
  const [selectedNodeKey, setSelectedNodeKey] = useState("capability");
  const [localDefinition, setLocalDefinition] = useState<WorkflowDefinitionEnvelope>(() => definition ?? buildWorkflowDefinition(prompt, workflowAction, { id: "local", model: "" }));
  const workflowActions = workflowActionsBase.map((item) => ({ ...item, label: locale === "en" ? workflowActionEnglish[item.id] ?? item.label : item.label }));
  useEffect(() => { if (definition) setLocalDefinition(definition); }, [definition]);
  const selectedNode = localDefinition.nodes.find((node) => node.nodeKey === selectedNodeKey) ?? localDefinition.nodes[0];
  const selectedAction = workflowActions.find((item) => item.id === selectedNode?.type) ?? workflowActions.find((item) => item.id === workflowAction) ?? workflowActions[0];
  const issues = validateWorkflowDefinition(localDefinition);
  const commit = (next: WorkflowDefinitionEnvelope) => { setLocalDefinition(next); onDefinitionChange(next); };
  const updatePrompt = (value: string) => {
    onPromptChange(value);
    commit({ ...localDefinition, nodes: localDefinition.nodes.map((node) => node.nodeKey === "input" ? { ...node, config: { ...node.config, text: value } } : node.nodeKey !== "output" ? { ...node, config: { ...node.config, prompt: value, script: value, text: value } } : node) });
  };
  const addNode = (type: WorkflowAction) => {
    if (type === "text_input") { setSelectedNodeKey("input"); return; }
    if (type === "output") { setSelectedNodeKey("output"); return; }
    const action = workflowActions.find((item) => item.id === type) ?? workflowActions[0];
    const nodeKey = `${type}-${Date.now()}`;
    const node: WorkflowDefinitionNodeV2 = { nodeKey, type, nodeVersion: 1, title: action.label, positionX: 240 + localDefinition.nodes.filter((item) => !["input", "output"].includes(item.nodeKey)).length * 240, positionY: 0, config: { prompt, script: prompt, text: prompt } };
    const input = workflowNodeRegistry.get(type)?.inputs.find((port) => port.valueKind === "text");
    const edges = [...localDefinition.edges];
    if (input) edges.push({ edgeKey: `input-${nodeKey}`, sourceNodeKey: "input", sourcePortId: "text", targetNodeKey: nodeKey, targetPortId: input.id });
    const output = workflowNodeRegistry.get(type)?.outputs[0];
    if (output) edges.push({ edgeKey: `${nodeKey}-output`, sourceNodeKey: nodeKey, sourcePortId: output.id, targetNodeKey: "output", targetPortId: outputInputPort(output.valueKind) });
    commit({ ...localDefinition, nodes: [...localDefinition.nodes, node], edges });
    onWorkflowAction(type);
    setSelectedNodeKey(nodeKey);
  };
  const removeSelectedNode = () => {
    if (!selectedNode || selectedNode.nodeKey === "input" || selectedNode.nodeKey === "output") return;
    commit({ ...localDefinition, nodes: localDefinition.nodes.filter((node) => node.nodeKey !== selectedNode.nodeKey), edges: localDefinition.edges.filter((edge) => edge.sourceNodeKey !== selectedNode.nodeKey && edge.targetNodeKey !== selectedNode.nodeKey) });
    setSelectedNodeKey("input");
  };
  const changeNodeType = (nextType: WorkflowAction) => {
    if (!selectedNode || ["input", "output"].includes(selectedNode.nodeKey)) return;
    const action = workflowActions.find((item) => item.id === nextType) ?? workflowActions[0];
    const nextNode = { ...selectedNode, type: nextType, title: action.label, config: { ...selectedNode.config, prompt, script: prompt, text: prompt } };
    const nextEdges = localDefinition.edges.filter((edge) => edge.targetNodeKey !== selectedNode.nodeKey && edge.sourceNodeKey !== selectedNode.nodeKey);
    const input = workflowNodeRegistry.get(nextType)?.inputs.find((port) => port.valueKind === "text");
    const output = workflowNodeRegistry.get(nextType)?.outputs[0];
    if (input) nextEdges.push({ edgeKey: `input-${selectedNode.nodeKey}`, sourceNodeKey: "input", sourcePortId: "text", targetNodeKey: selectedNode.nodeKey, targetPortId: input.id });
    if (output) nextEdges.push({ edgeKey: `${selectedNode.nodeKey}-output`, sourceNodeKey: selectedNode.nodeKey, sourcePortId: output.id, targetNodeKey: "output", targetPortId: outputInputPort(output.valueKind) });
    commit({ ...localDefinition, nodes: localDefinition.nodes.map((node) => node.nodeKey === selectedNode.nodeKey ? nextNode : node), edges: nextEdges });
    onWorkflowAction(nextType);
  };
  const setUpstream = (sourceKey: string) => {
    if (!selectedNode || ["input", "output"].includes(selectedNode.nodeKey)) return;
    const targetInput = workflowNodeRegistry.get(selectedNode.type)?.inputs[0];
    const withoutIncoming = localDefinition.edges.filter((edge) => edge.targetNodeKey !== selectedNode.nodeKey);
    if (!targetInput || sourceKey === "none") { commit({ ...localDefinition, edges: withoutIncoming }); return; }
    const source = localDefinition.nodes.find((node) => node.nodeKey === sourceKey);
    const sourcePort = source ? workflowNodeRegistry.get(source.type)?.outputs.find((port) => port.valueKind === targetInput.valueKind) : undefined;
    if (!source || !sourcePort) return;
    commit({ ...localDefinition, edges: [...withoutIncoming, { edgeKey: `${source.nodeKey}-${selectedNode.nodeKey}`, sourceNodeKey: source.nodeKey, sourcePortId: sourcePort.id, targetNodeKey: selectedNode.nodeKey, targetPortId: targetInput.id }] });
  };
  const moveNode = (nodeKey: string, position: { x: number; y: number }) => commit({ ...localDefinition, nodes: localDefinition.nodes.map((node) => node.nodeKey === nodeKey ? { ...node, positionX: Math.max(0, position.x), positionY: Math.max(0, position.y) } : node) });
  const upstreamEdge = selectedNode ? localDefinition.edges.find((edge) => edge.targetNodeKey === selectedNode.nodeKey) : undefined;
  const upstreamOptions = selectedNode && selectedNode.nodeKey !== "input" && selectedNode.nodeKey !== "output" ? localDefinition.nodes.filter((node) => node.nodeKey !== selectedNode.nodeKey && (workflowNodeRegistry.get(node.type)?.outputs.some((port) => port.valueKind === workflowNodeRegistry.get(selectedNode.type)?.inputs[0]?.valueKind))) : [];
  const actionLabel = (item: { id: string; label: string }) => locale === "en" ? workflowActionEnglish[item.id] ?? item.label : item.label;
  const ui = locale === "zh" ? { save: "保存流程", export: "导出 JSON", import: "导入 JSON", host: "本地 OpenCode Host", abilities: "工作流能力", nodes: "节点", canvas: "本地工作流画布", edges: "条连线", runnable: "可运行", input: "输入节点", output: "输出节点", capability: "能力节点", delete: "删除节点", editable: "可编辑配置", task: "任务内容", artifact: "产物策略", localOutput: "写入当前项目目录", artifactHint: "登记到本地 artifacts，不上传云端", ability: "能力", upstream: "上游节点", none: "不连接", runtime: "运行时", run: "运行工作流", placeholder: "描述这条工作流需要完成的任务……", providerRequired: "该媒体节点需要配置 Provider", providerHint: "请在模型配置中选择已配置模型并填写对应 Provider。", openSettings: "打开模型配置" } : { save: "Save workflow", export: "Export JSON", import: "Import JSON", host: "Local OpenCode Host", abilities: "Workflow abilities", nodes: "nodes", canvas: "Local workflow canvas", edges: "edges", runnable: "ready", input: "Input node", output: "Output node", capability: "Capability node", delete: "Delete node", editable: "Editable config", task: "Task", artifact: "Artifact policy", localOutput: "Write to current project", artifactHint: "Registered in local artifacts; never uploaded", ability: "Capability", upstream: "Upstream node", none: "No connection", runtime: "Runtime", run: "Run workflow", placeholder: "Describe the task this workflow should complete…", providerRequired: "This media node requires a configured Provider", providerHint: "Choose a configured model and enter its Provider settings in Model settings.", openSettings: "Open model settings" };
  const localizedRunStatus = localizeDesktopStatus(runStatus, locale);
  const localizedNodeTitle = (node: WorkflowDefinitionNodeV2) => node.nodeKey === "input" ? ui.input : node.nodeKey === "output" ? ui.output : actionLabel({ id: node.type, label: node.title });
  const canvasNodes = localDefinition.nodes.map((node) => ({ ...node, title: localizedNodeTitle(node) }));
  return <div className="workflow-workspace">
    <header className="workflow-page-header"><div><div className="eyebrow">WORKFLOW BUILDER</div><h1>{route.label}</h1><p>{route.description}</p></div><div className="workflow-header-actions"><ModelControls locale={locale} model={model} models={models} reasoningEffort={reasoningEffort} skillId={skillId} showSkill={false} onModelChange={onModelChange} onReasoningChange={onReasoningChange} onSkillChange={onSkillChange} /><button className="ghost" type="button" onClick={onSave}>{ui.save}</button><button className="ghost" type="button" onClick={onExport}>{ui.export}</button><label className="ghost workflow-import-button">{ui.import}<input type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) onImport(file); event.currentTarget.value = ""; }} /></label><span className="chat-runtime-badge">{ui.host}</span></div></header>
     <div className="workflow-workspace-grid"><aside className="workflow-library"><div className="section-title"><span>{ui.abilities}</span><span className="muted">{savedWorkflows.length} {locale === "en" ? "saved" : "个"} · {localDefinition.nodes.length} {ui.nodes}</span></div><div className="workflow-action-list">{workflowActions.map((item) => <button key={item.id} type="button" className={`workflow-action-item ${selectedNode?.type === item.id ? "active" : ""}`} onClick={() => addNode(item.id)}>{actionLabel(item)}<small>{item.output.toUpperCase()} · {locale === "en" ? "Add" : "添加"}</small></button>)}</div></aside><section className="workflow-canvas"><div className="workflow-canvas-toolbar"><span>{ui.canvas}</span><span className="muted">{localDefinition.nodes.length} {ui.nodes} · {localDefinition.edges.length} {ui.edges} {issues.length ? `· ${issues.length} ${locale === "en" ? "connection issues" : "个连接问题"}` : `· ${ui.runnable}`}</span></div><DesktopWorkflowCanvas nodes={canvasNodes} edges={localDefinition.edges} selectedNodeKey={selectedNode?.nodeKey ?? null} onSelectNode={setSelectedNodeKey} onMoveNode={moveNode} locale={locale} /><div className="workflow-editor-panel"><div className="section-title"><span>{selectedNode?.nodeKey === "input" ? ui.input : selectedNode?.nodeKey === "output" ? ui.output : ui.capability}</span><div className="workflow-editor-actions">{selectedNode && selectedNode.nodeKey !== "input" && selectedNode.nodeKey !== "output" ? <button type="button" className="link-button" onClick={removeSelectedNode}>{ui.delete}</button> : null}<span className="muted">{ui.editable}</span></div></div>{selectedNode?.nodeKey === "input" ? <label className="workflow-editor-field"><span>{ui.task}</span><textarea value={prompt} onChange={(event) => updatePrompt(event.target.value)} placeholder={ui.placeholder} /></label> : selectedNode?.nodeKey === "output" ? <div className="workflow-editor-readonly"><span>{ui.artifact}</span><strong>{ui.localOutput}</strong><small>{ui.artifactHint}</small></div> : <div className="workflow-editor-grid"><label className="workflow-editor-field"><span>{ui.ability}</span><select value={selectedNode?.type} onChange={(event) => changeNodeType(event.target.value as WorkflowAction)}>{workflowActions.map((item) => <option key={item.id} value={item.id}>{actionLabel(item)}</option>)}</select></label><label className="workflow-editor-field"><span>{ui.upstream}</span><select value={upstreamEdge?.sourceNodeKey ?? "none"} onChange={(event) => setUpstream(event.target.value)}><option value="none">{ui.none}</option>{upstreamOptions.map((node) => <option key={node.nodeKey} value={node.nodeKey}>{localizedNodeTitle(node)}</option>)}</select></label><div className="workflow-editor-readonly"><span>{ui.runtime}</span><strong>OpenCode + {locale === "en" ? "local Skill / Provider" : "本地 Skill / Provider"}</strong><small>{selectedAction.output.toUpperCase()} {locale === "en" ? "output · Full Access" : "输出端口 · Full Access"}</small></div></div>}</div><div className="workflow-run-panel"><textarea value={prompt} onChange={(event) => updatePrompt(event.target.value)} placeholder={ui.placeholder} /><div className="composer-actions"><span className="muted">{issues.length ? issues[0].message : localizedRunStatus || (locale === "en" ? "Node events are recorded in real time after the run" : "运行后实时记录节点事件")}</span>{activeRunId ? <button className="ghost" onClick={onCancel}>{locale === "en" ? "Stop" : "停止"}</button> : <button className="send-button" disabled={!prompt.trim() || issues.length > 0} onClick={() => onRun(localDefinition)}>{ui.run}</button>}</div></div></section></div>
  </div>;
}

function DesktopMediaWorkspaceBody({
  route,
  prompt,
  onPromptChange,
  runStatus,
  activeRunId,
  onRun,
  onCancel,
  workflowAction,
  onWorkflowAction,
  artifactRows,
  providerConfigured: configuredProp,
  onOpenSettings,
  onArtifactReveal,
  onAddAttachments,
  attachments,
  model,
  models,
  reasoningEffort,
  skillId,
  onModelChange,
  onReasoningChange,
  onSkillChange,
  locale,
  mediaFeatureId,
  showHeader = true,
}: {
  route: DesktopRoute;
  prompt: string;
  onPromptChange: (value: string) => void;
  runStatus: string;
  activeRunId: string | null;
  onRun: (promptOverride?: string, mediaFeatureId?: MediaFeatureId, mediaInputs?: Record<string, unknown>) => void;
  onCancel: () => void;
  workflowAction: WorkflowAction;
  onWorkflowAction: (value: WorkflowAction) => void;
  artifactRows: ArtifactRow[];
  providerConfigured: boolean;
  onOpenSettings: () => void;
  onArtifactReveal: (relativePath: string, mimeType: string) => void;
  onAddAttachments?: (files: FileList | null) => void;
  attachments?: LocalAttachment[];
  model: string;
  models?: readonly string[];
  reasoningEffort: string;
  skillId: SkillId;
  onModelChange: (value: string) => void;
  onReasoningChange: (value: string) => void;
  onSkillChange: (value: SkillId) => void;
  locale: "zh" | "en";
  mediaFeatureId?: MediaFeatureId;
  showHeader?: boolean;
}) {
  const providerConfigured = configuredProp || activeMediaProviderConfigured;
  const isVideo = route.path.includes("video");
  const isImage = route.path.includes("image-assistant");
  const actionToFeature: Partial<Record<WorkflowAction, MediaFeatureId>> = { video_generate: "text-to-video", digital_human: "digital-human", music_generate: "ai-music", voice_clone: "voice-clone", voice_synthesis: "voice-synthesis", audio_generate: "audio-generate" };
  const featureToAction: Partial<Record<MediaFeatureId, WorkflowAction>> = { "text-to-video": "video_generate", "image-to-video": "video_generate", "reference-to-video": "video_generate", "video-edit": "video_generate", "video-enhance": "video_generate", "digital-human": "digital_human", "ai-music": "music_generate", "audio-generate": "audio_generate", "voice-clone": "voice_clone", "voice-synthesis": "voice_synthesis" };
  const [activeFeatureId, setActiveFeatureId] = useState<MediaFeatureId>(actionToFeature[workflowAction] ?? "text-to-video");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [imageSettings, setImageSettings] = useState({ quality: "standard", size: "1024x1024", count: "1", referenceImages: "" });
  const [uploadedFiles, setUploadedFiles] = useState<Record<string, string>>({});
  const [voiceLibraryOpen, setVoiceLibraryOpen] = useState(false);  const [isRecording, setIsRecording] = useState(false);
  const recordingRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const toggleReferenceRecording = async () => {
    if (isRecording && recordingRef.current) {
      recordingRef.current.stop();
      setIsRecording(false);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) return;
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { return; }
    const recorder = new MediaRecorder(stream);
    recordingChunksRef.current = [];
    recorder.ondataavailable = (event) => { if (event.data.size) recordingChunksRef.current.push(event.data); };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      const file = new File([new Blob(recordingChunksRef.current, { type: recorder.mimeType || "audio/webm" })], "voice-reference.webm", { type: recorder.mimeType || "audio/webm" });
      setUploadedFiles((current) => ({ ...current, [activeFeature.id]: file.name }));
      const transfer = new DataTransfer(); transfer.items.add(file); onAddAttachments?.(transfer.files);
    };
    recordingRef.current = recorder;
    recorder.start();
    setIsRecording(true);
  };
  const featureTitle = (feature: typeof mediaFeatureCatalog[number]) => locale === "en" ? mediaEnglish[feature.id] ?? feature.title : feature.title;
  const mediaUi = locale === "en" ? { localArtifacts: "Local artifacts", preview: "Preview & artifacts", latest: "Latest artifact", ready: "Local artifact is ready", afterRun: "Local result appears after running", notUploaded: "Generated files stay local and can be opened in Explorer.", audio: "Audio", video: "Video", image: "Image assistant", provider: "Media Provider required", providerHint: "The local text model does not automatically provide image, video, or audio generation.", openSettings: "Open model settings", prompt: "Prompt", quality: "Quality", size: "Size", count: "Count", references: "Reference assets", generate: "Generate", stop: "Stop", localAgent: "Run through local Agent", describe: "Describe what you want to generate…" } : { localArtifacts: "本地文件产物", preview: "预览与产物", latest: "最新产物", ready: "本地产物已就绪", afterRun: "运行后显示本地结果", notUploaded: "生成的文件不会上传或转存，可直接在资源管理器打开。", audio: "音频处理", video: "视频处理", image: "对话生图与参考图编辑", provider: "需要配置媒体 Provider", providerHint: "本地文本模型不会自动提供图片、视频或音频生成。", openSettings: "打开模型配置", prompt: "提示词", quality: "质量", size: "尺寸", count: "数量", references: "参考素材", generate: "生成", stop: "停止", localAgent: "选择能力后通过本地 Agent 运行", describe: "描述你想生成的内容……" };
  const localizedFeatureCatalog = mediaFeatureCatalog.map((feature) => ({
    ...feature,
    title: featureTitle(feature),
    ...(locale === "en" ? {
      summary: mediaSummaryEnglish[feature.id] ?? feature.summary,
      submitLabel: mediaSubmitEnglish[feature.id] ?? feature.submitLabel,
      fields: feature.fields.map((field) => ({ ...field, label: mediaFieldEnglish[field.label] ?? field.label, placeholder: field.placeholder ? mediaPlaceholderEnglish[field.placeholder] ?? field.placeholder : field.placeholder, options: field.options?.map((option) => ({ ...option, label: mediaOptionEnglish[option.label] ?? option.label })) })),
    } : {}),
  }));
  const activeFeature = localizedFeatureCatalog.find((feature) => feature.id === activeFeatureId) ?? localizedFeatureCatalog[0];
  const workflowActions = workflowActionsBase.map((item) => ({ ...item, label: locale === "en" ? workflowActionEnglish[item.id] ?? item.label : item.label }));
  useEffect(() => {
    if (!isVideo) return;
    const nextFeatureId = mediaFeatureId ?? actionToFeature[workflowAction] ?? "text-to-video";
    setActiveFeatureId(nextFeatureId);
  }, [isVideo, workflowAction, mediaFeatureId]);
  useEffect(() => {
    setFieldValues(Object.fromEntries(activeFeature.fields.map((field) => [field.id, field.defaultValue ?? ""])));
  }, [activeFeature.id]);
  const updateField = (fieldId: string, value: string) => setFieldValues((current) => ({ ...current, [fieldId]: value }));
  const selectMediaFeature = (featureId: MediaFeatureId) => { setActiveFeatureId(featureId); const nextAction = featureToAction[featureId]; if (nextAction) onWorkflowAction(nextAction); };
  const buildMediaPrompt = () => {
    const configuredFields = Object.entries(fieldValues).filter(([, value]) => value.trim()).map(([fieldId, value]) => {
      const field = activeFeature.fields.find((item) => item.id === fieldId);
      return `${field?.label ?? fieldId}: ${value.trim()}`;
    });
    return [activeFeature.title, prompt.trim(), ...configuredFields].filter(Boolean).join("\n");
  };
  const buildImagePrompt = () => [prompt.trim(), imageSettings.referenceImages ? `参考素材：${imageSettings.referenceImages}` : "", `图片质量：${imageSettings.quality}`, `图片尺寸：${imageSettings.size}`, `生成数量：${imageSettings.count}`].filter(Boolean).join("\n");
  const localAttachmentPaths = (attachments ?? []).map((item) => item.relativePath ?? item.name);
  const videoFeatures = localizedFeatureCatalog.filter((feature) => feature.group === "video");
  const audioFeatures = localizedFeatureCatalog.filter((feature) => feature.group === "audio");
  const simpleOptions = workflowActions.filter((item) => ["ppt_generate", "image_generate", "writer"].includes(item.id));
  const localizedRunStatus = localizeDesktopStatus(runStatus, locale);
  return <div className="media-workspace"><input className="sr-only" type="file" id="desktop-media-upload" accept="audio/*,video/*,image/*" onChange={(event) => { const files = event.target.files; const file = files?.[0]; event.currentTarget.value = ""; if (!file) return; setUploadedFiles((current) => ({ ...current, [activeFeature.id]: file.name })); onAddAttachments?.(files); }} /><header className={showHeader ? "workflow-page-header" : "workflow-page-header sr-only"}><div><div className="eyebrow">CONTENT CREATION</div><h1>{route.label}</h1><p>{route.description}</p></div><div className="workflow-header-actions"><ModelControls locale={locale} model={model} models={models} reasoningEffort={reasoningEffort} skillId={skillId} showSkill={false} onModelChange={onModelChange} onReasoningChange={onReasoningChange} onSkillChange={onSkillChange} /><span className="chat-runtime-badge">{mediaUi.localArtifacts}</span></div></header><div className="media-workspace-grid"><section className="media-preview-panel"><div className="section-title"><span>{isVideo ? mediaUi.latest : mediaUi.preview}</span><span className="muted">{artifactRows.length} {locale === "en" ? "files" : "个"}</span></div><div className="media-preview-placeholder"><span>{isVideo ? "▶" : route.path.includes("image") ? "▧" : "▣"}</span><strong>{artifactRows.length ? mediaUi.ready : mediaUi.afterRun}</strong><p>{mediaUi.notUploaded}</p></div><div className="capability-status-ready media-result-status"><span className="capability-status-dot" />{localizedRunStatus || (locale === "en" ? "Ready" : "就绪")}</div>{artifactRows.length ? <div className="media-artifact-list">{artifactRows.slice(0, 6).map((artifact) => <button key={artifact.id} type="button" className="media-artifact-row" onClick={() => onArtifactReveal(artifact.relative_path, artifact.mime_type)}><span>{artifact.relative_path}</span><small>{artifact.mime_type} · {Math.ceil(artifact.byte_length / 1024)} KB</small></button>)}</div> : null}</section><section className="media-control-panel">{isVideo ? <><div className="media-feature-groups"><div><div className="media-group-label">{mediaUi.audio}</div><div className="media-tabs">{audioFeatures.map((feature) => <button key={feature.id} type="button" className={activeFeature.id === feature.id ? "active" : ""} onClick={() => selectMediaFeature(feature.id)}>{feature.title}</button>)}</div></div><div><div className="media-group-label">{mediaUi.video}</div><div className="media-tabs">{videoFeatures.map((feature) => <button key={feature.id} type="button" className={activeFeature.id === feature.id ? "active" : ""} onClick={() => selectMediaFeature(feature.id)}>{feature.title}</button>)}</div></div></div><div className="media-feature-summary"><strong>{activeFeature.title}</strong><span>{activeFeature.summary}</span></div></> : isImage ? <div className="image-feature-summary"><strong>{mediaUi.image}</strong><span>{locale === "en" ? "Keep the online image assistant prompt, quality, size, count and local artifact reference controls." : "保留线上图片助手的提示词、质量、尺寸、数量和本地产物引用配置。"}</span></div> : <div className="media-tabs">{simpleOptions.map((item) => <button key={item.id} type="button" className={workflowAction === item.id ? "active" : ""} onClick={() => onWorkflowAction(item.id)}>{item.label}</button>)}</div>}{!providerConfigured ? <div className="media-provider-warning"><strong>{mediaUi.provider}</strong><span>{mediaUi.providerHint}</span><button type="button" className="link-button" onClick={onOpenSettings}>{mediaUi.openSettings}</button></div> : null}{isVideo && (activeFeature.id === "voice-clone" || activeFeature.id === "voice-synthesis" || activeFeature.fields.some((field) => field.type === "url")) ? <div className="voice-library-box"><div className="field-label">{activeFeature.id === "voice-synthesis" ? (locale === "en" ? "Voice library" : "音色库") : (locale === "en" ? "Reference and local assets" : "参考音频与本地素材")}</div><div className="composer-actions"><button type="button" className="reload-btn" onClick={() => document.getElementById("desktop-media-upload")?.click()}>{locale === "en" ? "Upload local file" : "上传本地文件"}</button>{activeFeature.id === "voice-clone" ? <button type="button" className="reload-btn" onClick={() => void toggleReferenceRecording()}>{isRecording ? (locale === "en" ? "Stop recording" : "停止录音") : (locale === "en" ? "Record reference" : "录制参考音频")}</button> : null}{activeFeature.id === "voice-synthesis" ? <button type="button" className="reload-btn" onClick={() => setVoiceLibraryOpen((value) => !value)}>{voiceLibraryOpen ? (locale === "en" ? "Hide voices" : "收起音色") : (locale === "en" ? "Load voices" : "加载音色")}</button> : null}</div>{uploadedFiles[activeFeature.id] ? <div className="text-sm text-[#222]">{locale === "en" ? "Ready" : "已就绪"}: {uploadedFiles[activeFeature.id]}</div> : null}{voiceLibraryOpen ? <div className="media-asset-picker"><button type="button" onClick={() => updateField("voiceId", "default-cn")}>Default Chinese voice</button><button type="button" onClick={() => updateField("voiceId", "default-en")}>Default English voice</button></div> : null}</div> : null}{isVideo ? <div className="media-field-grid">{activeFeature.fields.map((field) => <label key={field.id} className="media-field"><span>{field.label}</span>{field.type === "textarea" ? <textarea value={fieldValues[field.id] ?? ""} onChange={(event) => updateField(field.id, event.target.value)} placeholder={field.placeholder} /> : field.type === "select" ? <select value={fieldValues[field.id] ?? field.defaultValue ?? ""} onChange={(event) => updateField(field.id, event.target.value)}>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input type={field.type === "number" ? "number" : "text"} value={fieldValues[field.id] ?? ""} onChange={(event) => updateField(field.id, event.target.value)} placeholder={field.placeholder} />}{field.type === "url" && artifactRows.length ? <div className="media-asset-picker">{artifactRows.slice(0, 3).map((artifact) => <button key={`${field.id}-${artifact.id}`} type="button" onClick={() => updateField(field.id, artifact.relative_path)}>{artifact.relative_path}</button>)}</div> : null}</label>)}</div> : isImage ? <div className="image-field-grid"><label className="media-field image-field-wide"><span>{mediaUi.prompt}</span><textarea value={prompt} onChange={(event) => onPromptChange(event.target.value)} placeholder={locale === "en" ? "Describe the subject, composition, style and safe areas…" : "描述主体、构图、风格和需要保留的安全区域……"} /></label><label className="media-field"><span>{mediaUi.quality}</span><select value={imageSettings.quality} onChange={(event) => setImageSettings((current) => ({ ...current, quality: event.target.value }))}><option value="standard">{locale === "en" ? "Standard" : "标准"}</option><option value="hd">{locale === "en" ? "HD" : "高清"}</option></select></label><label className="media-field"><span>{mediaUi.size}</span><select value={imageSettings.size} onChange={(event) => setImageSettings((current) => ({ ...current, size: event.target.value }))}><option value="1024x1024">1:1 · 1024</option><option value="1536x1024">{locale === "en" ? "Landscape · 1536×1024" : "横版 · 1536×1024"}</option><option value="1024x1536">{locale === "en" ? "Portrait · 1024×1536" : "竖版 · 1024×1536"}</option></select></label><label className="media-field"><span>{mediaUi.count}</span><select value={imageSettings.count} onChange={(event) => setImageSettings((current) => ({ ...current, count: event.target.value }))}><option value="1">{locale === "en" ? "1 image" : "1 张"}</option><option value="4">{locale === "en" ? "4 images" : "4 张"}</option><option value="9">{locale === "en" ? "9 images" : "9 张"}</option></select></label><label className="media-field image-field-wide"><span>{mediaUi.references}</span><input value={imageSettings.referenceImages} onChange={(event) => setImageSettings((current) => ({ ...current, referenceImages: event.target.value }))} placeholder={locale === "en" ? "Local artifact path or URL, comma-separated" : "本地产物相对路径或 URL，多个用逗号分隔"} />{artifactRows.length ? <div className="media-asset-picker">{artifactRows.slice(0, 3).map((artifact) => <button key={`image-${artifact.id}`} type="button" onClick={() => setImageSettings((current) => ({ ...current, referenceImages: current.referenceImages ? `${current.referenceImages},${artifact.relative_path}` : artifact.relative_path }))}>{artifact.relative_path}</button>)}</div> : null}</label></div> : <textarea value={prompt} onChange={(event) => onPromptChange(event.target.value)} placeholder={mediaUi.describe} />}<div className="composer-actions"><span className="muted">{localizedRunStatus || mediaUi.localAgent}</span>{activeRunId ? <button className="ghost" onClick={onCancel}>{mediaUi.stop}</button> : <button className="send-button" disabled={(!prompt.trim() && !isVideo && !isImage) || !providerConfigured} onClick={() => onRun(isVideo ? buildMediaPrompt() : isImage ? buildImagePrompt() : undefined, isVideo ? activeFeature.id : undefined, isVideo ? { ...Object.fromEntries(Object.entries(fieldValues).filter(([, value]) => value.trim())), ...(localAttachmentPaths.length ? { localAttachments: localAttachmentPaths } : {}) } : isImage ? { quality: imageSettings.quality, size: imageSettings.size, n: Number(imageSettings.count), referenceImages: imageSettings.referenceImages, ...(localAttachmentPaths.length ? { localAttachments: localAttachmentPaths } : {}) } : undefined)}>{isVideo ? activeFeature.submitLabel : mediaUi.generate}</button>}</div></section></div></div>;
}

type DesktopMediaWorkspaceProps = Parameters<typeof DesktopMediaWorkspaceBody>[0] & { onOpenTasks?: () => void };

function DesktopMediaWorkspace(props: DesktopMediaWorkspaceProps) {
  const { locale, workflowAction, onWorkflowAction, onOpenTasks } = props;
  const bodyProps: Parameters<typeof DesktopMediaWorkspaceBody>[0] = props;
  const isVideo = props.route.path === "/dashboard/video";
  const isMediaCatalog = isVideo;
  if (!isMediaCatalog) return <DesktopMediaWorkspaceBody {...bodyProps} />;
  const copy = locale === "en"
    ? { eyebrow: "Media Workspace", title: props.route.label, description: isVideo ? props.route.description : "Open one tab per sub-capability. Fill the structured brief and review local task output, preview, and artifacts.", launchers: "Launchers", workspace: "Workspace", openFirst: "Choose an audio or video feature above to begin.", audio: "Audio Processing", video: "Video Processing" }
    : { eyebrow: "Media Workspace", title: props.route.label, description: isVideo ? props.route.description : "按子能力打开独立 Tab：填写结构化信息，并查看本地任务状态、产物预览和文件。", launchers: "能力入口", workspace: "多 Tab 工作区", openFirst: "先从上方选择一个音频或视频子能力。", audio: "音频处理", video: "视频处理" };
  const localizedFeatures = mediaFeatureCatalog.map((feature) => ({ ...feature, title: locale === "en" ? mediaEnglish[feature.id] ?? feature.title : feature.title, summary: locale === "en" ? mediaSummaryEnglish[feature.id] ?? feature.summary : feature.summary }));
  const groups = [{ id: "audio", title: copy.audio, description: locale === "en" ? "Handle music generation, voice cloning, and speech synthesis in one audio workspace." : "支持音乐生成、声音克隆与语音合成，统一在一个音频工作区完成。", features: localizedFeatures.filter((feature) => feature.group === "audio") }, { id: "video", title: copy.video, description: locale === "en" ? "Handle video, digital human, editing, and enhancement in one video workspace." : "支持视频、数字人、视频编辑和高清化，统一在一个视频工作区完成。", features: localizedFeatures.filter((feature) => feature.group === "video") }];
  const actionByFeature: Partial<Record<MediaFeatureId, WorkflowAction>> = { "ai-music": "music_generate", "audio-generate": "audio_generate", "voice-clone": "voice_clone", "voice-synthesis": "voice_synthesis", "text-to-video": "video_generate", "image-to-video": "video_generate", "reference-to-video": "video_generate", "video-edit": "video_generate", "digital-human": "digital_human", "video-enhance": "video_generate" };
  const [activeFeatureId, setActiveFeatureId] = useState<MediaFeatureId | null>(isVideo ? ((Object.entries(actionByFeature).find(([, action]) => action === workflowAction)?.[0] as MediaFeatureId | undefined) ?? "text-to-video") : null);
  const [openFeatureIds, setOpenFeatureIds] = useState<MediaFeatureId[]>(isVideo ? [((Object.entries(actionByFeature).find(([, action]) => action === workflowAction)?.[0] as MediaFeatureId | undefined) ?? "text-to-video")] : []);
  useEffect(() => { setActiveFeatureId(isVideo ? ((Object.entries(actionByFeature).find(([, action]) => action === workflowAction)?.[0] as MediaFeatureId | undefined) ?? "text-to-video") : null); }, [isVideo]);
  useEffect(() => { if (!isVideo) { setOpenFeatureIds([]); return; } setOpenFeatureIds((current) => current.length ? current : ["text-to-video"]); }, [isVideo]);
  const selectFeature = (featureId: MediaFeatureId) => { setActiveFeatureId(featureId); setOpenFeatureIds((current) => current.includes(featureId) ? current : [...current, featureId]); const nextAction = actionByFeature[featureId]; if (nextAction) onWorkflowAction(nextAction); };
  const closeFeature = (featureId: MediaFeatureId) => { setOpenFeatureIds((current) => { const next = current.filter((id) => id !== featureId); if (activeFeatureId === featureId) setActiveFeatureId(next.at(-1) ?? null); return next; }); };
  return <div className="desktop-media-route-shell"><div className="media-workspace capabilities-page"><header className="capabilities-header"><div className="capabilities-eyebrow">{copy.eyebrow}</div><h1 className="capabilities-title">{copy.title}</h1><div className="header-accent" /><p className="capabilities-subtitle">{copy.description}</p></header><div className="capability-groups-grid">{groups.map((group) => <article key={group.id} className="capability-group-card"><div className="capability-group-heading"><div className="category-icon"><span aria-hidden="true">{group.id === "audio" ? "♫" : "▶"}</span></div><div><div className="category-title">{group.title}</div><p className="category-description">{group.description}</p></div></div><div className="capability-tile-grid">{group.features.map((feature) => <button key={feature.id} type="button" className={`capability-tile ${openFeatureIds.includes(feature.id) ? "active" : ""}`.trim()} onClick={() => selectFeature(feature.id)}><div className="capability-tile-icon"><span aria-hidden="true">{feature.group === "audio" ? "♫" : "▶"}</span></div><div><div className="capability-tile-title">{feature.title}</div><div className="capability-tile-description">{feature.summary}</div></div></button>)}</div></article>)}</div><article className="launcher-workspace"><div className="launcher-bar"><div><div className="launcher-label">{copy.workspace} / {copy.launchers}</div><div className="launcher-subtitle">{openFeatureIds.length ? `${openFeatureIds.length} ${locale === "en" ? "open tabs" : "个已打开标签"}` : copy.openFirst}</div></div><div className="launcher-tabs">{openFeatureIds.map((featureId) => { const feature = localizedFeatures.find((item) => item.id === featureId); if (!feature) return null; return <div key={feature.id} className={`launcher-tab ${activeFeatureId === feature.id ? "active" : ""}`.trim()}><button type="button" onClick={() => selectFeature(feature.id)}><span aria-hidden="true">{feature.group === "audio" ? "♫" : "▶"}</span>{feature.title}</button><button type="button" className="launcher-tab-close" aria-label={`close-${feature.id}`} onClick={() => closeFeature(feature.id)}>×</button></div>; })}</div><button type="button" className="secondary-btn launcher-all-tasks" onClick={onOpenTasks}>{locale === "en" ? "All tasks" : "全部任务"}<span aria-hidden="true">›</span></button></div></article></div>{activeFeatureId ? <DesktopMediaWorkspaceBody {...bodyProps} route={isVideo ? props.route : { ...props.route, path: "/dashboard/video" }} mediaFeatureId={activeFeatureId} showHeader={false} /> : null}</div>;
}

function DesktopAssetLibrarySurface({ artifactRows, onArtifactRemove, onArtifactReveal, locale }: { artifactRows: ArtifactRow[]; onArtifactRemove: (artifactId: string) => void; onArtifactReveal: (relativePath: string, mimeType: string) => void; locale: "zh" | "en" }) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | "recent" | "documents">("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const copy = locale === "en"
    ? { eyebrow: "ASSET LIBRARY", title: "Asset library", description: "Browse local files produced by writing, PPT, workflows, and media runs.", all: "All assets", recent: "Recent", documents: "Documents", search: "Search local assets…", grid: "Grid", list: "List", empty: "No local artifacts yet", emptyHint: "Artifacts appear here after writing, PPT, or media runs.", unavailable: "Unavailable", remove: "Remove record", open: "Open" }
    : { eyebrow: "资产库", title: "资产库", description: "浏览写作、PPT、工作流和媒体任务生成的本地文件。", all: "全部资产", recent: "最近", documents: "文档", search: "搜索本地产物……", grid: "网格", list: "列表", empty: "还没有本地产物", emptyHint: "运行写作、PPT 或媒体任务后，文件会显示在这里。", unavailable: "文件不可用", remove: "移除记录", open: "打开" };
  const filtered = artifactRows.filter((item) => {
    const matchesQuery = !query.trim() || `${item.relative_path} ${item.mime_type}`.toLowerCase().includes(query.trim().toLowerCase());
    const matchesTab = tab === "all" || (tab === "documents" ? /text|json|pdf|word|markdown|presentation|spreadsheet/i.test(item.mime_type) : Date.now() - new Date(item.created_at).getTime() < 7 * 24 * 60 * 60 * 1000);
    return matchesQuery && matchesTab;
  });
  return <div className="library-workspace asset-library-surface"><header className="asset-library-header"><div><div className="eyebrow">{copy.eyebrow}</div><h1>{copy.title}</h1><p>{copy.description}</p></div><div className="asset-library-header-meta"><span className="chat-runtime-badge">{artifactRows.length} {locale === "en" ? "files" : "个文件"}</span><button type="button" className={`view-toggle ${view === "grid" ? "active" : ""}`.trim()} onClick={() => setView("grid")}>{copy.grid}</button><button type="button" className={`view-toggle ${view === "list" ? "active" : ""}`.trim()} onClick={() => setView("list")}>{copy.list}</button></div></header><div className="asset-library-toolbar"><div className="asset-library-tabs">{(["all", "recent", "documents"] as const).map((item) => <button key={item} type="button" className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{copy[item]}</button>)}</div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.search} aria-label={copy.search} /></div>{filtered.length ? <div className={`asset-library-grid ${view === "list" ? "list-view" : ""}`.trim()}>{filtered.map((item) => <article key={item.id} className="asset-library-card"><div className="asset-library-card-icon">{item.mime_type.startsWith("image/") ? "▧" : item.mime_type.startsWith("video/") ? "▶" : item.mime_type.startsWith("audio/") ? "♫" : item.mime_type.includes("presentation") ? "P" : "▤"}</div><div className="asset-library-card-body"><strong title={item.relative_path}>{item.relative_path.split(/[\\/]/).pop() ?? item.relative_path}</strong><small>{item.mime_type} · {Math.max(1, Math.ceil(item.byte_length / 1024))} KB</small><time>{new Date(item.created_at).toLocaleString(locale === "zh" ? "zh-CN" : "en-US")}</time></div><div className="asset-library-card-actions"><button type="button" className="link-button" disabled={item.available === false} onClick={() => onArtifactReveal(item.relative_path, item.mime_type)}>{item.available === false ? copy.unavailable : copy.open}</button>{item.available === false ? <button type="button" className="link-button" onClick={() => onArtifactRemove(item.id)}>{copy.remove}</button> : null}</div></article>)}</div> : <div className="empty-state asset-library-empty"><div className="empty-icon">▱</div><strong>{copy.empty}</strong><p>{copy.emptyHint}</p></div>}</div>;
}

function DesktopTaskCenterSurface({ runs, onNavigate, onRetryRun, onInspectRun, locale }: { runs: RunRow[]; onNavigate: (path: string) => void; onRetryRun: (run: RunRow) => void; onInspectRun: (runId: string) => Promise<RunDetail>; locale: "zh" | "en" }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const copy = locale === "en"
    ? { eyebrow: "TASK CENTER", title: "Task Center", description: "Review local workflow, media, tool, and agent activity as grouped tasks.", total: "Total tasks", active: "Active", healthy: "Healthy", review: "Needs review", search: "Search task name or run ID…", all: "All status", empty: "No task history", emptyHint: "Chat, writing, and workflow run states are stored here.", view: "View conversation", evidence: "View evidence", retry: "Prepare retry", running: "Running", succeeded: "Succeeded", failed: "Failed", interrupted: "Interrupted", cancelled: "Cancelled", loading: "Loading run evidence…", nodes: "Nodes", events: "Events", usage: "Usage", noEvidence: "No persisted execution evidence", close: "Close" }
    : { eyebrow: "任务中心", title: "任务中心", description: "按任务查看本地工作流、媒体、工具和 Agent 的执行情况。", total: "任务总数", active: "进行中", healthy: "运行健康", review: "需要关注", search: "搜索任务名称或运行 ID……", all: "全部状态", empty: "暂无任务记录", emptyHint: "普通对话、写作和工作流的运行状态会保存在这里。", view: "查看会话", evidence: "查看执行证据", retry: "准备重试", running: "运行中", succeeded: "已完成", failed: "失败", interrupted: "已中断", cancelled: "已取消", loading: "正在加载运行证据…", nodes: "节点", events: "事件", usage: "用量", noEvidence: "暂无已持久化的执行证据", close: "关闭" };
  const label = (value: string) => value === "succeeded" ? copy.succeeded : value === "failed" ? copy.failed : value === "interrupted" ? copy.interrupted : value === "cancelled" ? copy.cancelled : copy.running;
  const filtered = runs.filter((run) => (!query.trim() || `${run.id} ${run.model ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())) && (status === "all" || run.status === status));
  const activeCount = runs.filter((run) => run.status === "running" || run.status === "queued").length;
  const reviewCount = runs.filter((run) => run.status === "failed" || run.status === "interrupted" || run.status === "cancelled").length;
  const inspect = async (runId: string) => {
    if (selectedRunId === runId) { setSelectedRunId(null); setDetail(null); setDetailError(""); return; }
    setSelectedRunId(runId); setDetail(null); setDetailError(""); setDetailLoading(true);
    try { setDetail(await onInspectRun(runId)); } catch (error) { setDetailError(error instanceof Error ? error.message : String(error)); } finally { setDetailLoading(false); }
  };
  const payloadPreview = (payload: string) => { try { return JSON.stringify(JSON.parse(payload), null, 2); } catch { return payload.slice(0, 2000); } };
  const inputTokens = detail?.usage.reduce((sum, item) => sum + (item.input_tokens ?? 0), 0) ?? 0;
  const outputTokens = detail?.usage.reduce((sum, item) => sum + (item.output_tokens ?? 0), 0) ?? 0;
  return <div className="library-workspace task-center-surface"><header className="task-center-header"><div><div className="eyebrow">{copy.eyebrow}</div><h1>{copy.title}</h1><p>{copy.description}</p></div><div className="task-center-header-meta"><span className="chat-runtime-badge">OpenCode · SQLite</span></div></header><div className="task-metric-grid"><div><span>{copy.total}</span><strong>{runs.length}</strong></div><div><span>{copy.active}</span><strong>{activeCount}</strong></div><div><span>{copy.healthy}</span><strong>{Math.max(0, runs.length - reviewCount)}</strong></div><div><span>{copy.review}</span><strong>{reviewCount}</strong></div></div><div className="task-center-toolbar"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.search} aria-label={copy.search} /><select value={status} onChange={(event) => setStatus(event.target.value)} aria-label={copy.all}><option value="all">{copy.all}</option><option value="running">{copy.running}</option><option value="succeeded">{copy.succeeded}</option><option value="failed">{copy.failed}</option><option value="interrupted">{copy.interrupted}</option><option value="cancelled">{copy.cancelled}</option></select></div>{filtered.length ? <div className="task-center-table"><div className="task-center-table-head"><span>{locale === "en" ? "Task" : "任务"}</span><span>{locale === "en" ? "Latest run" : "最近运行"}</span><span>{locale === "en" ? "Status" : "状态"}</span><span>{locale === "en" ? "Actions" : "操作"}</span></div>{filtered.map((run) => <div className="task-center-row" key={run.id}><div><strong>{run.model || (locale === "en" ? "Local model" : "本地模型")}</strong><small>{run.id}</small></div><time>{new Date(run.started_at).toLocaleString(locale === "zh" ? "zh-CN" : "en-US")}</time><span className={`task-status task-status-${run.status}`}>{label(run.status)}</span><div className="task-row-actions">{run.conversation_id ? <button type="button" className="link-button" onClick={() => onNavigate(`/dashboard/ai/${run.conversation_id}`)}>{copy.view}</button> : null}<button type="button" className="link-button" onClick={() => void inspect(run.id)}>{selectedRunId === run.id ? copy.close : copy.evidence}</button>{run.status === "failed" || run.status === "interrupted" ? <button type="button" className="ghost" onClick={() => onRetryRun(run)}>{copy.retry}</button> : null}</div></div>)}</div> : <div className="empty-state"><div className="empty-icon">≡</div><strong>{copy.empty}</strong><p>{copy.emptyHint}</p></div>}{selectedRunId ? <section className="knowledge-local-card run-evidence-panel"><div className="section-title"><span>{copy.evidence}</span><button type="button" className="link-button" onClick={() => { setSelectedRunId(null); setDetail(null); }}>{copy.close}</button></div>{detailLoading ? <p className="muted">{copy.loading}</p> : detailError ? <p className="status-error">{detailError}</p> : detail ? <><div className="stats-grid"><div><strong>{detail.nodes.length}</strong><span>{copy.nodes}</span></div><div><strong>{detail.events.length}</strong><span>{copy.events}</span></div><div><strong>{inputTokens + outputTokens}</strong><span>Token</span></div><div><strong>{detail.usage.length}</strong><span>{copy.usage}</span></div></div><div className="run-list"><strong>{copy.nodes}</strong>{detail.nodes.length ? detail.nodes.map((node) => <div className="run-row" key={node.node_key}><div className="run-row-main"><strong>{node.node_key}</strong><span>{node.status}</span><small>{node.output_json ? node.output_json.slice(0, 280) : ""}</small></div></div>) : <p className="muted">{copy.noEvidence}</p>}</div><div className="run-list"><strong>{copy.events}</strong>{detail.events.length ? detail.events.slice(-24).map((event) => <details key={`${event.sequence}-${event.event_type}`} className="run-row"><summary><strong>#{event.sequence} · {event.event_type}</strong><small>{formatDateTime(event.created_at, locale)}</small></summary><pre>{payloadPreview(event.payload_json)}</pre></details>) : <p className="muted">{copy.noEvidence}</p>}</div><div className="run-list"><strong>{copy.usage}</strong>{detail.usage.length ? detail.usage.map((item, index) => <div className="run-row" key={`${item.created_at}-${index}`}><div className="run-row-main"><strong>{item.model}</strong><span>{item.provider ?? (locale === "en" ? "Provider unknown" : "Provider 未知")}</span><small>{(item.input_tokens ?? 0) + (item.output_tokens ?? 0)} token · {item.provider_cost === undefined || item.provider_cost === null ? (locale === "en" ? "Cost unknown" : "成本未知") : `$${item.provider_cost.toFixed(4)}`}</small></div></div>) : <p className="muted">{copy.noEvidence}</p>}</div></> : null}</section> : null}</div>;
}

function DesktopLibraryWorkspace({ route, artifactRows, savedWorkflows, conversations, runs, taskCount, tokenCount, artifactCount, providerCost: initialProviderCost, estimatedCost: initialEstimatedCost, onNavigate, onRetryRun, onInspectRun, onArtifactRemove, onArtifactReveal, onKnowledgeOpen, knowledgeQuery, knowledgeResults, knowledgeStatus, onKnowledgeQueryChange, onKnowledgeSearch, locale }: { route: DesktopRoute; artifactRows: Array<ArtifactRow>; savedWorkflows: Array<{ id: string; name: string; definition_json: string; updated_at: string }>; conversations: Array<{ id: string; title: string; updated_at: string }>; runs: RunRow[]; taskCount: number; tokenCount: number; artifactCount: number; providerCost?: number; estimatedCost?: number; onNavigate: (path: string) => void; onRetryRun: (run: RunRow) => void; onInspectRun: (runId: string) => Promise<RunDetail>; onArtifactRemove: (artifactId: string) => void; onArtifactReveal: (relativePath: string, mimeType: string) => void; onKnowledgeOpen: (relativePath: string) => void; knowledgeQuery: string; knowledgeResults: KnowledgeResult[]; knowledgeStatus: string; onKnowledgeQueryChange: (value: string) => void; onKnowledgeSearch: () => void; locale: "zh" | "en" }) {
  const providerCost = initialProviderCost;
  const usageCost = initialEstimatedCost;
  // The existing stat cell treats non-positive values as unknown; preserve an explicit known zero.
  const estimatedCost = usageCost === undefined ? Number.NaN : usageCost || Number.MIN_VALUE;
  const isAssets = route.path === "/dashboard/assets" || route.path === "/dashboard/works";
  const isKnowledge = route.path === "/dashboard/knowledge-base";
  const isCapabilities = route.path === "/dashboard/capabilities";
  const isTasks = route.path === "/dashboard/tasks";
  const isSettings = route.path === "/dashboard/settings";
  if (isAssets) return <DesktopAssetLibrarySurface artifactRows={artifactRows} onArtifactRemove={onArtifactRemove} onArtifactReveal={onArtifactReveal} locale={locale} />;
  if (isTasks) return <DesktopTaskCenterSurface runs={runs} onNavigate={onNavigate} onRetryRun={onRetryRun} onInspectRun={onInspectRun} locale={locale} />;
  const ui = locale === "en" ? { localData: "Local data", localStats: "Local stats", countOnly: "Stats only; no billing", artifacts: "Local artifacts", vault: "Obsidian Vault", skills: "Local Skills", tasks: "Task runs", recent: "Recent activity", live: "Live", files: "files", records: "records", noTasks: "No task history", noArtifacts: "No local artifacts yet", noRecords: "No local records", configureVault: "Configure Vault", modelRuntime: "Model & runtime", settingsHint: "Edit config.json from the model settings dialog; ordinary chat and workflows both use OpenCode.", tasksLabel: "Tasks", artifactLabel: "Artifacts", providerCost: "Provider cost", estimated: "Estimated cost", unknown: "Cost unknown" } : { localData: "本地数据", localStats: "本地统计", countOnly: "只统计，不扣费", artifacts: "本地产物", vault: "Obsidian Vault", skills: "本地 Skills", tasks: "任务运行", recent: "最近活动", live: "实时", files: "个文件", records: "条记录", noTasks: "暂无任务记录", noArtifacts: "还没有本地产物", noRecords: "暂无本地记录", configureVault: "配置 Vault", modelRuntime: "模型与运行环境", settingsHint: "使用右上角“模型配置”编辑 config.json；普通对话和工作流均经过 OpenCode。", tasksLabel: "任务", artifactLabel: "产物", providerCost: "Provider 返回成本", estimated: "本地预估成本", unknown: "成本未知" };
  const sectionLabel = isAssets ? ui.artifacts : isKnowledge ? ui.vault : isCapabilities ? ui.skills : isTasks ? ui.tasks : isSettings ? ui.modelRuntime : ui.recent;
  const sectionMeta = isAssets ? `${artifactRows.length} ${ui.files}` : isKnowledge ? "manifest + LanceDB" : isCapabilities ? `${desktopCapabilities.length} ${locale === "en" ? "capabilities" : "项"}` : isTasks ? `${runs.length} ${ui.records}` : ui.live;
  return <div className="library-workspace"><header className="workflow-page-header"><div><div className="eyebrow">LOCAL RESOURCE CENTER</div><h1>{route.label}</h1><p>{route.description}</p></div><span className="chat-runtime-badge">{ui.localData}</span></header><div className="library-workspace-grid"><section className="library-main-panel"><div className="section-title"><span>{sectionLabel}</span><span className="muted">{sectionMeta}</span></div>{isCapabilities ? <div className="capability-directory-grid">{desktopCapabilities.map((item) => <button key={item.id} type="button" className="capability-directory-card" onClick={() => onNavigate(item.route)}><span className="capability-directory-icon"><RouteIcon name={item.kind === "media" ? "video" : item.kind === "knowledge" ? "knowledge" : item.id === "ppt_generate" ? "ppt" : "writer"} size={20} /></span><span className="capability-directory-copy"><strong>{locale === "en" ? capabilityEnglish[item.id]?.title ?? item.title : item.title}</strong><small>{locale === "en" ? capabilityEnglish[item.id]?.description ?? item.description : item.description}</small></span><span className="capability-directory-arrow">↗</span></button>)}</div> : isTasks ? <div className="run-list">{runs.length ? runs.map((run) => <div key={run.id} className="run-row"><div className="run-row-main"><strong>{locale === "en" ? (run.status === "succeeded" ? "Succeeded" : run.status === "interrupted" ? "Interrupted" : run.status === "failed" ? "Failed" : run.status === "cancelled" ? "Cancelled" : "Running") : (run.status === "succeeded" ? "已完成" : run.status === "interrupted" ? "已中断" : run.status === "failed" ? "失败" : run.status === "cancelled" ? "已取消" : "运行中")}</strong><span>{run.model || (locale === "en" ? "Local model" : "本地模型")}</span><small>{formatDateTime(run.started_at, locale)}</small></div><div className="run-row-actions">{run.conversation_id ? <button type="button" className="link-button" onClick={() => onNavigate(`/dashboard/ai/${run.conversation_id}`)}>{locale === "en" ? "View conversation" : "查看会话"}</button> : null}{run.status === "interrupted" || run.status === "failed" ? <button type="button" className="ghost" onClick={() => onRetryRun(run)}>{locale === "en" ? "Prepare retry" : "准备重试"}</button> : null}</div></div>) : <div className="empty-state"><div className="empty-icon">≡</div><strong>{ui.noTasks}</strong><p>{locale === "en" ? "Chat, writing, and workflow run states are stored here." : "普通对话、写作和工作流的运行状态会保存在这里。"}</p></div>}</div> : isAssets && artifactRows.length ? <div className="conversation-list">{artifactRows.map((item) => <div key={item.id} className="conversation-row artifact-row"><button type="button" className="artifact-open-button" disabled={item.available === false} onClick={() => onArtifactReveal(item.relative_path, item.mime_type)}><span>{item.relative_path}</span><small>{item.available === false ? (locale === "en" ? "Unavailable" : "文件不可用") : item.mime_type}</small></button>{item.available === false ? <button type="button" className="link-button" onClick={() => onArtifactRemove(item.id)}>{locale === "en" ? "Remove record" : "移除记录"}</button> : null}</div>)}</div> : isAssets ? <div className="empty-state"><div className="empty-icon">▱</div><strong>{ui.noArtifacts}</strong><p>{locale === "en" ? "Artifacts appear here after writing, PPT, or media runs." : "运行写作、PPT 或媒体任务后，文件会显示在这里。"}</p></div> : isKnowledge ? <div className="knowledge-local-card"><strong>{locale === "en" ? "Local Obsidian knowledge base" : "Obsidian 本地知识库"}</strong><p>{locale === "en" ? "Scan Markdown after selecting a Vault; the index and source stay local. Chat never sends Vault content unless enabled." : "选择 Vault 后扫描 Markdown，索引与原文均保存在本机。普通对话不会自动发送 Vault 内容。"}</p><div className="knowledge-search-row"><input value={knowledgeQuery} onChange={(event) => onKnowledgeQueryChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && knowledgeQuery.trim()) onKnowledgeSearch(); }} placeholder={locale === "en" ? "Search notes, tags, or headings in the Vault" : "搜索 Vault 中的笔记、标签或标题"} /><button className="primary" disabled={!knowledgeQuery.trim()} onClick={onKnowledgeSearch}>{locale === "en" ? "Search" : "检索"}</button></div>{knowledgeStatus ? <div className="muted knowledge-status">{knowledgeStatus}</div> : null}{knowledgeResults.length ? <div className="knowledge-result-list">{knowledgeResults.map((result) => <button type="button" key={result.chunkId} className="knowledge-result" onClick={() => void onKnowledgeOpen(result.documentPath)}><div className="knowledge-result-heading"><strong>{result.heading || result.documentPath}</strong><small>{result.lineStart ? (locale === "en" ? `Lines ${result.lineStart}-${result.lineEnd ?? result.lineStart}` : `第 ${result.lineStart}-${result.lineEnd ?? result.lineStart} 行`) : (locale === "en" ? "Local citation" : "本地引用")}</small></div><p>{result.excerpt}</p></button>)}</div> : null}<button className="ghost" onClick={() => onNavigate("/dashboard/settings")}>{ui.configureVault}</button></div> : isSettings ? <div className="knowledge-local-card"><strong>{ui.modelRuntime}</strong><p>{ui.settingsHint}</p></div> : conversations.length ? <div className="conversation-list">{conversations.map((item) => <button key={item.id} type="button" className="conversation-row" onClick={() => onNavigate(`/dashboard/ai/${item.id}`)}><span>{item.title}</span><small>{formatDateTime(item.updated_at, locale)}</small></button>)}</div> : <div className="empty-state"><div className="empty-icon">⌁</div><strong>{ui.noRecords}</strong><p>{locale === "en" ? "Run a task to save its status and conversation locally." : "运行任务后，状态和会话会自动保存。"}</p></div>}</section><aside className="library-stats-panel"><div className="section-title"><span>{ui.localStats}</span><span className="muted">{ui.countOnly}</span></div><div className="stats-grid"><div><strong>{taskCount}</strong><span>{ui.tasksLabel}</span></div><div><strong>{tokenCount}</strong><span>Token</span></div><div><strong>{artifactCount}</strong><span>{ui.artifactLabel}</span></div><div><strong>{providerCost === undefined ? (locale === "en" ? "Unknown" : "未知") : `$${providerCost.toFixed(4)}`}</strong><span>{ui.providerCost}</span></div><div><strong>{estimatedCost > 0 ? `$${estimatedCost.toFixed(4)}` : (locale === "en" ? "Unknown" : "未知")}</strong><span>{ui.estimated}</span></div></div><div className="library-secondary-list"><strong>{locale === "en" ? "Saved workflows" : "已保存工作流"}</strong>{savedWorkflows.slice(0, 5).map((item) => <div key={item.id}>{item.name}</div>)}</div></aside></div></div>;
}

function DesktopSettingsPanel({
  config,
  skillId,
  locale,
  localePreference,
  copy,
  onConfigChange,
  onSkillChange,
  onLocalePreferenceChange,
  onClose,
  onSave,
  onRebuildVault,
  onPickDirectory,
  onRepairRuntime,
  onExportDiagnostics,
}: {
  config: DesktopConfig;
  skillId?: SkillId;
  locale: "zh" | "en";
  localePreference: DesktopLocalePreference;
  copy: typeof desktopCopy.zh | typeof desktopCopy.en;
  onConfigChange: (next: DesktopConfig) => void;
  onSkillChange?: (value: SkillId) => void;
  onLocalePreferenceChange: (next: DesktopLocalePreference) => void;
  onClose: () => void;
  onSave: () => void;
  onRebuildVault: () => void;
  onPickDirectory: (kind: "workspace" | "vault") => void;
  onRepairRuntime: () => void;
  onExportDiagnostics: () => void;
}) {
  const selectedSkill = skillId ?? config.provider.skillId ?? "auto";
  const setSelectedSkill = onSkillChange ?? ((value: SkillId) => onConfigChange({ ...config, provider: { ...config.provider, skillId: value } }));
  const ui = locale === "zh" ? {
    title: "本地模型与项目配置", close: "关闭", workspace: "工作目录", workspacePlaceholder: "项目文件夹绝对路径", vault: "Obsidian Vault", vaultPlaceholder: "可选 Vault 绝对路径", removeVault: "解除绑定", index: "Vault 索引目录", indexPlaceholder: "manifest.json 所在目录", embeddingMode: "Embedding 位置", localEmbedding: "仅本地（默认）", remoteEmbedding: "远程（发送片段）", embeddingBaseUrl: "远程 Embedding URL", embeddingModel: "远程 Embedding 模型", embeddingApiKey: "远程 Embedding API Key", localEmbeddingHint: "默认仅在本机生成 embedding，不会发送 Vault 内容。", remoteEmbeddingHint: "仅在明确选择远程后，待索引 Markdown 片段才会发送到此 HTTPS 端点。", provider: "Provider", profiles: "Provider profiles（JSON）", profilesHint: "按能力选择不同 Provider；保留 provider 字段作为兼容回退。", textDefault: "生文默认 Provider", imageDefault: "生图默认 Provider", videoDefault: "生视频/数字人默认 Provider", audioDefault: "音频/声音默认 Provider", model: "Model", modelPlaceholder: "默认模型", reasoning: "推理强度", low: "低", medium: "中", high: "高", baseUrl: "Base URL", baseUrlPlaceholder: "可选 OpenAI-compatible URL", endpoint: "媒体提交 Endpoint", endpointPlaceholder: "可选，例如 /videos/generations", queryEndpoint: "媒体查询 Endpoint", queryEndpointPlaceholder: "可选，例如 /api/v1/tasks", apiKey: "API Key", offline: "离线运行时 ZIP", offlinePlaceholder: "可选：本地运行时 ZIP 绝对路径", warning: "API Key 按已确认方案以明文保存在本地 config.json；不会写入 SQLite、日志或诊断包。内置 Obsidian 写入会做路径与 base hash 冲突保护，但 Full Access OpenCode 文件工具仍可直接改动文件，工具事件会实时展示。", save: "保存配置", rebuild: "扫描/重建 Obsidian 索引", import: "导入离线运行时", diagnostics: "导出诊断包", imported: "已导入离线运行时并完成复检", failed: "离线运行时导入失败"
  } : {
    title: "Local model & workspace settings", close: "Close", workspace: "Workspace directory", workspacePlaceholder: "Absolute project folder path", vault: "Obsidian Vault", vaultPlaceholder: "Optional Vault absolute path", removeVault: "Detach Vault", index: "Vault index directory", indexPlaceholder: "Directory containing manifest.json", embeddingMode: "Embedding location", localEmbedding: "Local only (default)", remoteEmbedding: "Remote (send chunks)", embeddingBaseUrl: "Remote embedding URL", embeddingModel: "Remote embedding model", embeddingApiKey: "Remote embedding API key", localEmbeddingHint: "Embedding stays on this device by default; no Vault content is sent.", remoteEmbeddingHint: "Only after selecting remote are Markdown chunks sent to this HTTPS endpoint for indexing.", provider: "Provider", profiles: "Provider profiles (JSON)", profilesHint: "Route text, image, video, and audio capabilities to different providers; provider remains the compatibility fallback.", textDefault: "Text default Provider", imageDefault: "Image default Provider", videoDefault: "Video/digital human default Provider", audioDefault: "Audio/voice default Provider", model: "Model", modelPlaceholder: "Default model", reasoning: "Reasoning effort", low: "Low", medium: "Medium", high: "High", baseUrl: "Base URL", baseUrlPlaceholder: "Optional OpenAI-compatible URL", endpoint: "Media submit endpoint", endpointPlaceholder: "Optional, e.g. /videos/generations", queryEndpoint: "Media query endpoint", queryEndpointPlaceholder: "Optional, e.g. /api/v1/tasks", apiKey: "API Key", offline: "Offline runtime ZIP", offlinePlaceholder: "Optional local runtime ZIP absolute path", warning: "Per the approved plan, the API key is stored as readable text in local config.json; it is not written to SQLite, logs, or diagnostics. Built-in Obsidian writes use path and base-hash conflict protection, while Full Access OpenCode file tools can still modify files directly and their tool events remain visible.", save: "Save settings", rebuild: "Scan/rebuild Obsidian index", import: "Import offline runtime", diagnostics: "Export diagnostics", imported: "Offline runtime imported and rechecked", failed: "Offline runtime import failed"
  };
  const [profilesText, setProfilesText] = useState(() => JSON.stringify(config.providers ?? {}, null, 2));
  useEffect(() => { setProfilesText(JSON.stringify(config.providers ?? {}, null, 2)); }, [config.providers]);
  const updateProvider = (patch: Partial<DesktopConfig["provider"]>) => onConfigChange({ ...config, provider: { ...config.provider, ...patch } });
  const updateEmbedding = (patch: Partial<EmbeddingConfig>) => onConfigChange({ ...config, embedding: { mode: config.embedding?.mode ?? "local", ...config.embedding, ...patch } });
  const updateProfiles = (value: string) => {
    setProfilesText(value);
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) onConfigChange({ ...config, providers: parsed as DesktopProviderProfiles });
    } catch { /* keep editing until the JSON is complete */ }
  };
  const profileIds = Object.keys(config.providers ?? {});
  const updateDefault = (capability: keyof DesktopProviderDefaults, value: string) => {
    const defaults = { ...(config.defaults ?? {}) };
    if (value) defaults[capability] = value;
    else delete defaults[capability];
    onConfigChange({ ...config, defaults });
  };
  return <section className="settings-panel"><div className="section-title"><span>{ui.title}</span><button className="link-button" onClick={onClose}>{ui.close}</button></div><div className="settings-grid">
    <label>{copy.language}<select value={localePreference} onChange={(event) => onLocalePreferenceChange(event.target.value as DesktopLocalePreference)}><option value="auto">{copy.languageAuto}</option><option value="zh">{copy.languageZh}</option><option value="en">{copy.languageEn}</option></select></label>
    <label>{ui.workspace}<div className="settings-path-control"><input value={config.workspacePath} onChange={(event) => onConfigChange({ ...config, workspacePath: event.target.value })} placeholder={ui.workspacePlaceholder} /><button type="button" className="ghost" onClick={() => onPickDirectory("workspace")}>{locale === "zh" ? "选择" : "Browse"}</button></div></label>
    <label>{ui.vault}<div className="settings-path-control"><input value={config.obsidianVaultPath ?? ""} onChange={(event) => onConfigChange({ ...config, obsidianVaultPath: event.target.value || undefined })} placeholder={ui.vaultPlaceholder} /><button type="button" className="ghost" onClick={() => onPickDirectory("vault")}>{locale === "zh" ? "选择" : "Browse"}</button><button type="button" className="ghost" disabled={!config.obsidianVaultPath} onClick={() => onConfigChange({ ...config, obsidianVaultPath: undefined, obsidianIndexPath: undefined })}>{ui.removeVault}</button></div></label>
    <label>{ui.index}<input value={config.obsidianIndexPath ?? ""} onChange={(event) => onConfigChange({ ...config, obsidianIndexPath: event.target.value || undefined })} placeholder={ui.indexPlaceholder} /></label>
    <label>{ui.embeddingMode}<select value={config.embedding?.mode ?? "local"} onChange={(event) => updateEmbedding({ mode: event.target.value as EmbeddingConfig["mode"] })}><option value="local">{ui.localEmbedding}</option><option value="remote">{ui.remoteEmbedding}</option></select></label>
    {config.embedding?.mode === "remote" ? <><label>{ui.embeddingBaseUrl}<input value={config.embedding.baseUrl ?? ""} onChange={(event) => updateEmbedding({ baseUrl: event.target.value })} placeholder="https://…/v1" /></label><label>{ui.embeddingModel}<input value={config.embedding.model ?? ""} onChange={(event) => updateEmbedding({ model: event.target.value })} /></label><label>{ui.embeddingApiKey}<input type="password" value={config.embedding.apiKey ?? ""} onChange={(event) => updateEmbedding({ apiKey: event.target.value })} /></label><p className="settings-inline-hint">{ui.remoteEmbeddingHint}</p></> : <p className="settings-inline-hint">{ui.localEmbeddingHint}</p>}
    <label>{ui.provider}<input value={config.provider.id} onChange={(event) => updateProvider({ id: event.target.value })} /></label>
    <label>{ui.profiles}<textarea value={profilesText} onChange={(event) => updateProfiles(event.target.value)} spellCheck={false} /></label>
    <p className="settings-inline-hint">{ui.profilesHint}</p>
    <label>{ui.textDefault}<select value={config.defaults?.text ?? ""} onChange={(event) => updateDefault("text", event.target.value)}><option value="">{config.provider.id}（fallback）</option>{profileIds.map((id) => <option key={`text-${id}`} value={id}>{id}</option>)}</select></label>
    <label>{ui.imageDefault}<select value={config.defaults?.image ?? ""} onChange={(event) => updateDefault("image", event.target.value)}><option value="">{config.provider.id}（fallback）</option>{profileIds.map((id) => <option key={`image-${id}`} value={id}>{id}</option>)}</select></label>
    <label>{ui.videoDefault}<select value={config.defaults?.video ?? ""} onChange={(event) => updateDefault("video", event.target.value)}><option value="">{config.provider.id}（fallback）</option>{profileIds.map((id) => <option key={`video-${id}`} value={id}>{id}</option>)}</select></label>
    <label>{ui.audioDefault}<select value={config.defaults?.audio ?? ""} onChange={(event) => updateDefault("audio", event.target.value)}><option value="">{config.provider.id}（fallback）</option>{profileIds.map((id) => <option key={`audio-${id}`} value={id}>{id}</option>)}</select></label>
    <label>{locale === "zh" ? "默认 Skill" : "Default Skill"}<select value={selectedSkill} onChange={(event) => setSelectedSkill(event.target.value as SkillId)}><option value="auto">{locale === "zh" ? "自动" : "Auto"}</option><option value="content-writing">{locale === "zh" ? "内容写作" : "Content writing"}</option><option value="marketing-analysis">{locale === "zh" ? "营销分析" : "Marketing analysis"}</option><option value="ppt-master">ppt-master</option><option value="obsidian-rag">Obsidian RAG</option></select></label>
    <label>{locale === "zh" ? "已配置模型（逗号或换行分隔）" : "Configured models (comma or newline separated)"}<textarea value={(config.provider.models ?? [config.provider.model]).join("\n")} onChange={(event) => { const models = configuredModelOptions({ models: event.target.value.split(/[\n,]/u) }); updateProvider({ models, model: preferredConfiguredModel({ ...config.provider, models }) }); }} placeholder={ui.modelPlaceholder} /></label>
    <label>{ui.model}<select value={config.provider.model} onChange={(event) => updateProvider({ model: event.target.value })}>{(configuredModelOptions(config.provider).length ? configuredModelOptions(config.provider) : [config.provider.model]).map((model) => <option key={model} value={model}>{model}</option>)}</select></label>
    <label>{ui.reasoning}<select value={config.provider.reasoningEffort ?? "medium"} onChange={(event) => updateProvider({ reasoningEffort: event.target.value })}><option value="low">{ui.low}</option><option value="medium">{ui.medium}</option><option value="high">{ui.high}</option></select></label>
    <label>{ui.baseUrl}<input value={config.provider.baseUrl ?? ""} onChange={(event) => updateProvider({ baseUrl: event.target.value, source: event.target.value ? "openai-compatible" : "local" })} placeholder={ui.baseUrlPlaceholder} /></label>
    <label>{ui.endpoint}<input value={config.provider.endpoint ?? ""} onChange={(event) => updateProvider({ endpoint: event.target.value || undefined })} placeholder={ui.endpointPlaceholder} /></label>
    <label>{ui.queryEndpoint}<input value={config.provider.queryEndpoint ?? ""} onChange={(event) => updateProvider({ queryEndpoint: event.target.value || undefined })} placeholder={ui.queryEndpointPlaceholder} /></label>
    <label>{ui.apiKey}<input type="password" value={config.provider.apiKey ?? ""} onChange={(event) => updateProvider({ apiKey: event.target.value })} /></label>
    <label>{ui.offline}<input value={config.offlineRuntimeZipPath ?? ""} onChange={(event) => onConfigChange({ ...config, offlineRuntimeZipPath: event.target.value || undefined })} placeholder={ui.offlinePlaceholder} /></label>
  </div><div className="settings-warning">{ui.warning}</div><div className="settings-actions"><button className="primary" onClick={onSave}>{ui.save}</button><button className="ghost" onClick={onRebuildVault}>{ui.rebuild}</button><button className="ghost" onClick={onRepairRuntime}>{ui.import}</button><button className="ghost" onClick={onExportDiagnostics}>{ui.diagnostics}</button></div></section>;
}

export function App() {
  const [activePath, setActivePath] = useState(() => window.location.pathname === "/" ? "/dashboard" : `${window.location.pathname}${window.location.search}`);
  const activePathRef = useRef(activePath);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [workflowAction, setWorkflowAction] = useState<WorkflowAction>("writer");
  const [workflowDefinition, setWorkflowDefinition] = useState<WorkflowDefinitionEnvelope | null>(null);
  const [localePreference, setLocalePreference] = useState<DesktopLocalePreference>("auto");
  const [skillId, setSkillIdState] = useState<SkillId>("auto");
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<LocalAttachment[]>([]);
  const [attachmentsPreparing, setAttachmentsPreparing] = useState(false);
  const [knowledgeContextEnabled, setKnowledgeContextEnabled] = useState(false);
  const homeAttachmentInputRef = useRef<HTMLInputElement>(null);
  const [homeAttachmentMenuOpen, setHomeAttachmentMenuOpen] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState("检查本地运行环境…");
  const [runtimeReady, setRuntimeReady] = useState(false);
  const [runStatus, setRunStatus] = useState("");
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [assistantText, setAssistantText] = useState("");
  const [activePrompt, setActivePrompt] = useState("");
  const [activePromptAt, setActivePromptAt] = useState<string | undefined>();
  const [assistantAt, setAssistantAt] = useState<string | undefined>();
  const [conversationMessages, setConversationMessages] = useState<DesktopConversationMessage[]>([]);
  const [toolEvents, setToolEvents] = useState<string[]>([]);
  const [taskCount, setTaskCount] = useState(0);
  const [tokenCount, setTokenCount] = useState(0);
  const [providerCost, setProviderCost] = useState<number | undefined>();
  const [estimatedCost, setEstimatedCost] = useState(0);
  const [artifactCount, setArtifactCount] = useState(0);
  const [savedWorkflows, setSavedWorkflows] = useState<SavedWorkflow[]>([]);
  const [artifactRows, setArtifactRows] = useState<ArtifactRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [knowledgeQuery, setKnowledgeQuery] = useState("");
  const [knowledgeResults, setKnowledgeResults] = useState<KnowledgeResult[]>([]);
  const [knowledgeStatus, setKnowledgeStatus] = useState("");
  const [conversations, setConversations] = useState<Array<{ id: string; title: string; updated_at: string; opencode_session_id?: string | null }>>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [config, setConfig] = useState<DesktopConfig>({ schemaVersion: 1, locale: "auto", workspacePath: "", provider: { id: "local", source: "local", model: "ollama/qwen3:8b", models: ["ollama/qwen3:8b"], baseUrl: "http://127.0.0.1:11434/v1" }, runtime: { source: "system" } });
  const setSkillId = (value: SkillId) => {
    setSkillIdState(value);
    setConfig((current) => ({ ...current, provider: { ...current.provider, skillId: value } }));
  };
  const configRef = useRef(config);
  const responseWaiters = useRef(new Map<string, (value: Record<string, unknown>) => void>());
  const activeConversationRef = useRef<string | null>(null);
  const activeRunRef = useRef<string | null>(null);
  const locale = resolveDesktopLocale(localePreference);
  const copy = desktopCopy[locale];
  const homeCopy = WORKBENCH_HOME_COPY[locale];
  const routes = useMemo(() => buildRoutes(locale), [locale]);
  const selected = useMemo(() => {
    const exact = routes.find((item) => item.path === activePath);
    if (exact) return exact;
    const [pathname, rawQuery = ""] = activePath.split("?", 2);
    const requested = new URLSearchParams(rawQuery);
    const queryMatch = routes.find((item) => {
      const [routePath, routeQuery = ""] = item.path.split("?", 2);
      if (routePath !== pathname || !routeQuery) return false;
      const expected = new URLSearchParams(routeQuery);
      for (const [key, value] of expected.entries()) if (requested.get(key) !== value) return false;
      return true;
    });
    return queryMatch ?? routes.find((item) => item.path !== "/dashboard" && activePath.startsWith(`${item.path}/`)) ?? routes.find((item) => item.path === "/dashboard")!;
  }, [activePath, routes]);
  const mode = selected.mode;
  const routeAction = routeWorkflowAction(selected.path);
  const activeCapability = capabilityForWorkflowAction(selected.path === "/dashboard/video" ? workflowAction : routeAction ?? "llm_generate");
  const activeProvider = providerForCapability(config, activeCapability);
  const activeModel = activeProvider.model;
  const activeModels = modelOptionsForProvider(config, activeProvider);
  const reasoningEffort = activeProvider.reasoningEffort ?? "auto";
  const effectiveSkillId: SkillId = selected.path.includes("executive-ppt") ? "ppt-master" : (config.provider.skillId ?? skillId);

  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => { activePathRef.current = activePath; }, [activePath]);
  // Legacy/retained surfaces consume ModelControls indirectly. Refresh once
  // after a configured list changes so they all observe the same catalog.
  const [, setModelCatalogRevision] = useState(0);
  useEffect(() => {
    activeProviderModels = activeModels ?? [];
    activeMediaProviderConfigured = ["image", "video", "audio"].some((capability) => isMediaProviderConfigured(providerForCapability(config, capability as "image" | "video" | "audio")));
    setModelCatalogRevision((revision) => revision + 1);
  }, [activeModels, config.provider, config.providers, config.defaults]);
  useEffect(() => { activeRunRef.current = activeRunId; }, [activeRunId]);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);

  const updateModel = (model: string) => setConfig((current) => {
    const profileId = current.defaults?.[activeCapability];
    if (profileId && current.providers?.[profileId]) return { ...current, providers: { ...current.providers, [profileId]: { ...current.providers[profileId], model } } };
    return { ...current, provider: { ...current.provider, model } };
  });
  const updateReasoning = (reasoning: string) => setConfig((current) => {
    const profileId = current.defaults?.[activeCapability];
    if (profileId && current.providers?.[profileId]) return { ...current, providers: { ...current.providers, [profileId]: { ...current.providers[profileId], reasoningEffort: reasoning } } };
    return { ...current, provider: { ...current.provider, reasoningEffort: reasoning } };
  });

  const navigate = useCallback((path: string) => {
    // Match the online compatibility route: `/dashboard/works` immediately
    // resolves to the asset library rather than creating a second page.
    const canonicalPath = path === "/dashboard/works" ? "/dashboard/assets" : path;
    window.history.pushState({}, "", canonicalPath);
    setActivePath(canonicalPath);
  }, []);

  const workbenchClient = useMemo(() => createDesktopWorkbenchClient(tauriBridge, {
    go: navigate,
    replace: navigate,
    current: () => activePathRef.current,
  }), [navigate]);
  openWorkflowProviderSettings = () => { setSettingsOpen(true); workbenchClient.navigation.go("/dashboard/settings"); };

  function toggleLocale() {
    setLocalePreference(locale === "zh" ? "en" : "zh");
  }

  async function addAttachments(files: FileList | null) {
    if (!files?.length) return;
    setAttachmentsPreparing(true);
    const selected = Array.from(files).slice(0, 4);
    const next: LocalAttachment[] = [];
    try {
      for (const file of selected) {
        const attachment = { id: `${file.name}-${file.lastModified}-${file.size}`, name: file.name, size: file.size, mediaType: file.type || "application/octet-stream" };
        let createdPath: string | undefined;
        try {
          const created = await tauriBridge.invoke<{ relativePath: string }>("begin_local_attachment", { fileName: file.name, byteLength: file.size });
          createdPath = created.relativePath;
          let offset = 0;
          const reader = file.stream().getReader();
          try {
            while (true) {
              const chunk = await reader.read();
              if (chunk.done) break;
              if (!chunk.value?.length) continue;
              const bytes = Array.from(chunk.value);
              await tauriBridge.invoke("append_local_attachment_chunk", { relativePath: created.relativePath, offset, bytes });
              offset += bytes.length;
            }
          } finally { reader.releaseLock(); }
          const saved = await tauriBridge.invoke<{ relativePath?: string }>("finish_local_attachment", { relativePath: created.relativePath, expectedByteLength: file.size });
          next.push({ ...attachment, relativePath: saved.relativePath });
        } catch {
          if (createdPath) await tauriBridge.invoke("abort_local_attachment", { relativePath: createdPath }).catch(() => undefined);
          // Browser preview remains usable; the prompt still carries metadata.
          next.push(attachment);
        }
      }
      setAttachments((current) => [...current, ...next].slice(0, 4));
    } finally {
      setAttachmentsPreparing(false);
    }
  }

  function removeAttachment(id: string) {
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));
  }

  function startNewConversation() {
    activeConversationRef.current = null;
    setActiveConversationId(null);
    setConversationMessages([]);
    setActivePrompt("");
    setActivePromptAt(undefined);
    setAssistantText("");
    setAssistantAt(undefined);
    setToolEvents([]);
    setRunStatus("");
    setPrompt("");
    setAttachments([]);
  }

  useEffect(() => {
    if (activePath === "/dashboard/works") {
      window.history.replaceState({}, "", "/dashboard/assets");
      setActivePath("/dashboard/assets");
    }
  }, [activePath]);

  // Deep links from the cloud dashboard include a conversation id. Keep the
  // desktop route interactive by loading that exact durable transcript when
  // a history/task link is opened, instead of merely changing the URL.
  useEffect(() => {
    const match = activePath.match(/^\/dashboard\/(?:ai|writer)\/([^/?]+)/);
    if (!match) {
      if (activePath === "/dashboard/ai" || activePath === "/dashboard/writer") {
        setActiveConversationId(null);
        activeConversationRef.current = null;
        setActivePrompt("");
        setActivePromptAt(undefined);
        setAssistantText("");
        setAssistantAt(undefined);
        setConversationMessages([]);
        setToolEvents([]);
      }
      return;
    }
    const conversationId = decodeURIComponent(match[1]);
    void workbenchClient.conversations.messages(conversationId).then((history) => {
      setConversationMessages(history.filter((message): message is typeof message & { role: "user" | "assistant" } => message.role === "user" || message.role === "assistant").map((message) => ({ id: message.id, role: message.role, content: message.content, created_at: message.createdAt })));
      const latestUser = [...history].reverse().find((message) => message.role === "user");
      const latestAssistant = [...history].reverse().find((message) => message.role === "assistant");
      setActiveConversationId(conversationId);
      activeConversationRef.current = conversationId;
      setActivePrompt(latestUser?.content ?? "");
      setActivePromptAt(latestUser?.createdAt);
      setAssistantText(latestAssistant?.content ?? "");
      setAssistantAt(latestAssistant?.createdAt);
      setPrompt("");
      setToolEvents([]);
      setRunStatus("");
    }).catch(() => setRunStatus(locale === "zh" ? "会话历史加载失败" : "Unable to load conversation history"));
  }, [activePath, locale, workbenchClient]);

  useEffect(() => {
    const onPopState = () => setActivePath(`${window.location.pathname}${window.location.search}`);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    setSettingsOpen(activePath === "/dashboard/settings");
    if (activePath.includes("executive-ppt")) setWorkflowAction("ppt_generate");
    else if (activePath.includes("executive-presentation-ppt")) setWorkflowAction("ppt_generate");
    else if (activePath === "/dashboard/image-assistant") setWorkflowAction("image_generate");
    else if (activePath === "/dashboard/video") setWorkflowAction("video_generate");
    else if (activePath === "/dashboard/knowledge-base") setWorkflowAction("knowledge_retrieve");
    else if (activePath === "/dashboard/writer") setWorkflowAction("writer");
    if (activePath.startsWith("/dashboard/writer")) setSkillId("content-writing");
    else if (activePath.includes("executive-ppt")) setSkillId("ppt-master");
    else if (activePath === "/dashboard/knowledge-base") setSkillId("obsidian-rag");
    if (activePath !== "/dashboard/workflows") setWorkflowDefinition(null);
  }, [activePath]);

  useEffect(() => {
    void (async () => {
      try {
        const health = await tauriBridge.invoke<{ status: string }>("health");
         const [state, stored, runtime, recent, usageRows, artifactRowsFromClient, workflows, runRowsFromClient] = await Promise.all([tauriBridge.invoke<{ integrity: boolean; interruptedRuns?: number }>("initialize_local_state"), tauriBridge.invoke<DesktopConfig>("read_config"), tauriBridge.invoke<{ ready: boolean; paths?: { node?: string; opencode?: string; python?: string; host?: string; skills?: string; fonts?: string; lancedb?: string; embedding?: string } }>("runtime_probe"), workbenchClient.conversations.list(), workbenchClient.usage.list(), workbenchClient.artifacts.list(), workbenchClient.workflows.list(), workbenchClient.runs.list()]);
         const artifacts = artifactRowsFromClient.map(toArtifactRow);
         const runRows = runRowsFromClient.map(toRunRow);
         const inputTokens = usageRows.reduce((total, row) => total + (row.inputTokens ?? 0), 0);
         const outputTokens = usageRows.reduce((total, row) => total + (row.outputTokens ?? 0), 0);
         const providerCosts = usageRows.map((row) => row.providerCost).filter((value): value is number => typeof value === "number");
         const estimatedCosts = usageRows.map((row) => row.estimatedCost).filter((value): value is number => typeof value === "number");
        let activeConfig = stored;
        if (stored) {
          const selectedRuntime = { ...stored.runtime, ...(runtime.paths?.node ? { nodePath: runtime.paths.node } : {}), ...(runtime.paths?.opencode ? { opencodePath: runtime.paths.opencode } : {}), ...(runtime.paths?.python ? { pythonPath: runtime.paths.python } : {}), ...(runtime.paths?.host ? { hostPath: runtime.paths.host } : {}), ...(runtime.paths?.skills ? { skillsPath: runtime.paths.skills } : {}), ...(runtime.paths?.fonts ? { fontsPath: runtime.paths.fonts } : {}), ...(runtime.paths?.lancedb ? { lancedbPath: runtime.paths.lancedb } : {}), ...(runtime.paths?.embedding ? { embeddingPath: runtime.paths.embedding } : {}) };
          const selectedProvider = { ...stored.provider, model: preferredConfiguredModel(stored.provider) };
          const runtimeChanged = selectedRuntime.nodePath !== stored.runtime.nodePath || selectedRuntime.opencodePath !== stored.runtime.opencodePath || selectedRuntime.pythonPath !== stored.runtime.pythonPath || selectedRuntime.hostPath !== stored.runtime.hostPath || selectedRuntime.skillsPath !== stored.runtime.skillsPath || selectedRuntime.fontsPath !== stored.runtime.fontsPath || selectedRuntime.lancedbPath !== stored.runtime.lancedbPath || selectedRuntime.embeddingPath !== stored.runtime.embeddingPath || selectedProvider.model !== stored.provider.model;
          activeConfig = runtimeChanged ? { ...stored, provider: selectedProvider, runtime: selectedRuntime } : stored;
          setConfig(activeConfig);
          setSkillIdState(activeConfig.provider.skillId ?? "auto");
          setLocalePreference(activeConfig.locale ?? "auto");
          if (runtimeChanged) await tauriBridge.invoke("write_config", { value: activeConfig });
        }
        setConversations(recent.map((conversation) => ({ id: conversation.id, title: conversation.title, updated_at: conversation.updatedAt })));
         setTaskCount(runRows.length);
         setTokenCount(inputTokens + outputTokens);
         setProviderCost(providerCosts.length ? providerCosts.reduce((total, value) => total + value, 0) : undefined);
         setEstimatedCost(estimatedCosts.length ? estimatedCosts.reduce((total, value) => total + value, 0) : 0);
         setArtifactCount(artifacts.length);
         setArtifactRows(artifacts);
        setSavedWorkflows(workflows.map(toSavedWorkflow));
         setRuns(state.interruptedRuns ? (await workbenchClient.runs.list()).map(toRunRow) : runRows);
        const latestConversation = recent[0];
        if (latestConversation) {
          setActiveConversationId(latestConversation.id);
          activeConversationRef.current = latestConversation.id;
          const history = await workbenchClient.conversations.messages(latestConversation.id);
          setConversationMessages(history.filter((message): message is typeof message & { role: "user" | "assistant" } => message.role === "user" || message.role === "assistant").map((message) => ({ id: message.id, role: message.role, content: message.content, created_at: message.createdAt })));
          const latestUser = [...history].reverse().find((message) => message.role === "user");
          const latestAssistant = [...history].reverse().find((message) => message.role === "assistant");
          if (latestUser) { setActivePrompt(latestUser.content); setActivePromptAt(latestUser.createdAt); }
          if (latestAssistant) { setAssistantText(latestAssistant.content); setAssistantAt(latestAssistant.createdAt); }
        }
        if (!state.integrity) { setRuntimeStatus("本地数据库需要修复"); return; }
        if (!runtime.ready) {
          setRuntimeStatus("检测到运行环境缺失，正在自动修复…");
          await tauriBridge.invoke("repair_runtime");
          const repaired = await tauriBridge.invoke<{ ready: boolean }>("runtime_probe");
          if (!repaired.ready) throw new Error("runtime_repair_incomplete");
        }
        setRuntimeStatus(health.status === "ok" ? "运行环境就绪" : "运行环境需要修复");
        setRuntimeReady(true);
        // The local host, Obsidian indexer and recovery loop are available even
        // when no remote API endpoint is configured; only provider-backed
        // media/text execution should be gated by provider configuration.
        if (activeConfig) {
          try {
            await tauriBridge.invoke("host_start");
            if (activeConfig.obsidianVaultPath && activeConfig.obsidianIndexPath) {
              void workbenchClient.knowledge.index({ vaultPath: activeConfig.obsidianVaultPath, indexPath: activeConfig.obsidianIndexPath, embedding: embeddingPayload(activeConfig) }).catch(() => undefined);
            }
            const attempts = await tauriBridge.invoke<Array<{ idempotency_key: string; run_id: string; node_key: string; provider?: string | null; provider_task_id?: string | null; payload_json?: string | null }>>("list_recoverable_attempts");
            for (const attempt of attempts) {
              if (!attempt.provider_task_id) continue;
              let payload: Record<string, unknown> = {};
              try { payload = JSON.parse(attempt.payload_json ?? "{}"); } catch { payload = {}; }
              const resumeExecutorId = typeof payload.executorId === "string" ? payload.executorId : attempt.node_key;
              const allocatedTemp = await tauriBridge.invoke<{ relativePath: string }>("allocate_media_temp", { runId: attempt.run_id, nodeKey: attempt.node_key });
              await tauriBridge.invoke("host_send", { message: {
                version: 1,
                requestId: `resume-${attempt.idempotency_key}`,
                runId: attempt.run_id,
                type: "media.resume",
                payload: {
                  runId: attempt.run_id,
                  nodeKey: attempt.node_key,
                  executorId: resumeExecutorId,
                  providerTaskId: attempt.provider_task_id,
                  mediaTempDirectories: { [attempt.node_key]: allocatedTemp.relativePath },
                  workspacePath: activeConfig.workspacePath,
                   config: (() => {
                     const recoveredProvider = providerForId(activeConfig, attempt.provider);
                     return {
                       provider: recoveredProvider.id,
                       model: typeof payload.model === "string" ? payload.model : recoveredProvider.model,
                       baseUrl: recoveredProvider.baseUrl,
                       apiKey: recoveredProvider.apiKey,
                       endpoint: recoveredProvider.endpoint,
                       queryEndpoint: recoveredProvider.queryEndpoint,
                     };
                   })(),
                },
              } });
              setRuns((current) => current.map((run) => run.id === attempt.run_id ? { ...run, status: "running" } : run));
            }
            if (attempts.length) setRunStatus(locale === "zh" ? `已恢复 ${attempts.length} 个媒体任务，继续查询本地结果…` : `${attempts.length} media task(s) recovered; continuing with local results…`);
          } catch (error) {
            setRunStatus(locale === "zh" ? `媒体任务恢复失败：${error instanceof Error ? error.message : String(error)}` : `Media task recovery failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      } catch (error) {
        const preview = error instanceof Error && error.message === "tauri_bridge_unavailable";
        setRuntimeStatus(preview ? "浏览器预览模式 · Tauri 未连接" : `运行环境修复失败：${error instanceof Error ? error.message : String(error)}`);
        setRuntimeReady(preview);
      }
    })();
    let dispose: (() => void) | undefined;
    let disposeRuntimeLog: (() => void) | undefined;
    const sequences = new Map<string, number>();
    const assistantBuffers = new Map<string, string>();
    void tauriBridge.listen<{ raw: string }>("desktop://runtime-log", (payload) => {
      if (!payload.raw.includes("workflow_host_exit")) return;
      void tauriBridge.invoke("host_start").catch((error) => {
        setRunStatus(locale === "zh" ? `本地 Agent 重启失败：${error instanceof Error ? error.message : String(error)}` : `Local Agent restart failed: ${error instanceof Error ? error.message : String(error)}`);
      });
      const runId = activeRunRef.current;
      if (!runId) return;
      setActiveRunId(null);
      setRuns((current) => current.map((run) => run.id === runId ? { ...run, status: "interrupted", finished_at: new Date().toISOString() } : run));
      setRunStatus(locale === "zh" ? "本地 Agent 已异常退出，任务已标记为中断，可在任务中心重试" : "The local Agent exited unexpectedly; the run was interrupted and can be retried from Tasks");
      void tauriBridge.invoke("finish_run", { runId, status: "interrupted" });
    }).then((unlisten) => { disposeRuntimeLog = unlisten; }).catch(() => undefined);
    void tauriBridge.listen<{ raw: string }>("desktop://runtime-response", (payload) => {
      try {
        const separator = payload.raw.indexOf(":");
        const frame = JSON.parse(payload.raw.slice(separator + 1)) as { requestId?: string; ok?: boolean; data?: { sessionId?: string; event?: { event?: string; provider?: string; model?: string; delta?: string; runId?: string; inputTokens?: number; outputTokens?: number; costUsd?: number } } };
        if (frame.requestId) responseWaiters.current.get(frame.requestId)?.(frame as unknown as Record<string, unknown>);
        if (frame.requestId && frame.data?.sessionId) {
          const conversationId = frame.requestId.endsWith(":session") ? frame.requestId.slice(0, -":session".length) : "";
          if (conversationId) {
            void tauriBridge.invoke("set_conversation_session", { conversationId, sessionId: frame.data.sessionId });
            setConversations((current) => current.map((item) => item.id === conversationId ? { ...item, opencode_session_id: frame.data?.sessionId } : item));
          }
        }
        const event = frame.data?.event;
        if (event?.event === "text_delta" && event.delta) { assistantBuffers.set(event.runId ?? "active", `${assistantBuffers.get(event.runId ?? "active") ?? ""}${event.delta}`); setAssistantAt((current) => current ?? new Date().toISOString()); setAssistantText((current) => `${current}${event.delta}`); }
        if (event?.runId) {
          const eventType = event.event ?? "unknown";
          const sequence = (sequences.get(event.runId) ?? 0) + 1; sequences.set(event.runId, sequence);
          void tauriBridge.invoke("append_run_event", { runId: event.runId, sequence, eventType, payloadJson: JSON.stringify(event) });
          if (eventType === "usage") { setTokenCount((current) => current + (event.inputTokens ?? 0) + (event.outputTokens ?? 0)); if (typeof event.costUsd === "number") setProviderCost((current) => (current ?? 0) + event.costUsd!); void tauriBridge.invoke("record_usage", { runId: event.runId, provider: event.provider ?? configRef.current.provider.id ?? null, model: event.model?.trim() || configRef.current.provider.model || "unknown", inputTokens: event.inputTokens ?? null, outputTokens: event.outputTokens ?? null, providerCost: event.costUsd ?? null, estimatedCost: null, idempotencyKey: `${event.runId}:usage:${sequence}` }); }
          if (eventType === "tool_event") {
            const tool = typeof (event as { tool?: string }).tool === "string" ? (event as { tool: string }).tool : "tool";
            const detail = typeof (event as { message?: string }).message === "string" ? (event as { message: string }).message : "";
            setToolEvents((current) => [...current, `${tool}${detail ? ` · ${detail.slice(0, 180)}` : ""}`].slice(-6));
          }
          if (eventType === "tool_event" && typeof (event as { tool?: string }).tool === "string" && (event as { tool: string }).tool.startsWith("artifact:")) setArtifactCount((current) => current + 1);
          if (eventType === "tool_event" && typeof (event as { tool?: string }).tool === "string" && (event as { tool: string }).tool.startsWith("artifact:")) {
            try {
              const artifact = JSON.parse((event as { message?: string }).message ?? "{}");
              const relativePath = typeof artifact.relativePath === "string" ? artifact.relativePath : "";
              if (relativePath) {
                const extension = relativePath.toLowerCase().split(".").pop() ?? "bin";
                const mimeType = extension === "pptx" ? "application/vnd.openxmlformats-officedocument.presentationml.presentation" : extension === "svg" ? "image/svg+xml" : extension === "png" ? "image/png" : extension === "jpg" || extension === "jpeg" ? "image/jpeg" : extension === "webp" ? "image/webp" : extension === "mp3" ? "audio/mpeg" : extension === "wav" ? "audio/wav" : extension === "mp4" ? "video/mp4" : extension === "webm" ? "video/webm" : extension === "md" ? "text/markdown" : "application/octet-stream";
                void tauriBridge.invoke<{ relative_path: string; mime_type: string; byte_length: number; sha256: string }>("register_artifact", { artifactId: `${event.runId}:${relativePath}`, projectId: null, relativePath, mimeType }).then((metadata) => {
                  setArtifactRows((current) => [...current.filter((item) => item.id !== `${event.runId}:${relativePath}`), { id: `${event.runId}:${relativePath}`, relative_path: metadata.relative_path, mime_type: metadata.mime_type, byte_length: metadata.byte_length, sha256: metadata.sha256, created_at: new Date().toISOString(), available: true }]);
                  setArtifactCount((current) => Math.max(current, 1));
                }).catch(() => undefined);
              }
            } catch { /* malformed artifact metadata remains in run_events */ }
          }
          const tool = typeof (event as { tool?: string }).tool === "string" ? (event as { tool: string }).tool : "";
          if (tool.startsWith("workflow:node_")) {
            try {
              const payload = JSON.parse((event as { message?: string }).message ?? "{}");
              const nodeStatus = tool.endsWith("node_started") ? "running" : tool.endsWith("node_failed") ? "failed" : "succeeded";
              const nodeKey = typeof payload.nodeKey === "string" ? payload.nodeKey : "";
              const checkpointKey = typeof payload.checkpointKey === "string" ? payload.checkpointKey : nodeKey;
              const outputJson = nodeStatus === "succeeded" && payload.output && typeof payload.output === "object" ? JSON.stringify(payload.output) : null;
              if (nodeKey) void tauriBridge.invoke("record_run_node", { runId: event.runId, nodeKey, status: nodeStatus, outputJson });
              if (nodeStatus === "succeeded" && checkpointKey && outputJson) void tauriBridge.invoke("record_run_checkpoint", { runId: event.runId, checkpointKey, sequence, outputJson });
            } catch { /* event remains in run_events */ }
          }
          if (tool.startsWith("media:")) {
            try {
              const payload = JSON.parse((event as { message?: string }).message ?? "{}");
              const executorId = typeof payload.executorId === "string" ? payload.executorId : tool.slice("media:".length);
              const nodeKey = typeof payload.nodeKey === "string" ? payload.nodeKey : executorId;
              const idempotencyKey = typeof payload.idempotencyKey === "string" ? payload.idempotencyKey : `${event.runId}:${nodeKey}:1`;
              const status = payload.status === "succeeded" || payload.status === "failed" || payload.status === "cancelled" || payload.status === "download_failed" ? payload.status : payload.providerTaskId ? "submitted" : "running";
              void tauriBridge.invoke("record_run_attempt", { idempotencyKey, runId: event.runId, nodeKey, provider: payload.provider ?? null, providerTaskId: payload.providerTaskId ?? null, status, payloadJson: JSON.stringify({ ...payload, executorId, nodeKey }) });
              const usage = payload.usage && typeof payload.usage === "object" ? payload.usage as Record<string, unknown> : {};
              if (status === "succeeded") void tauriBridge.invoke("record_usage", {
                runId: event.runId,
                provider: payload.provider ?? null,
                model: `${payload.provider ?? "media"}/${payload.model ?? "unknown"}`,
                inputTokens: typeof usage.inputTokens === "number" ? usage.inputTokens : null,
                outputTokens: typeof usage.outputTokens === "number" ? usage.outputTokens : null,
                providerCost: typeof usage.providerCost === "number" ? usage.providerCost : null,
                estimatedCost: typeof usage.estimatedCost === "number" ? usage.estimatedCost : null,
                idempotencyKey: `${event.runId}:${nodeKey}:media-usage`,
              });
            } catch { /* event remains in run_events */ }
          }
          if (eventType === "done") { setActiveRunId(null); setTaskCount((current) => current + 1); setRuns((current) => current.map((run) => run.id === event.runId ? { ...run, status: "succeeded", finished_at: new Date().toISOString() } : run)); const assistant = assistantBuffers.get(event.runId ?? "") ?? ""; const conversationId = activeConversationRef.current; if (assistant && conversationId) { const createdAt = new Date().toISOString(); setConversationMessages((current) => [...current, { id: `assistant-${event.runId}`, role: "assistant", content: assistant, created_at: createdAt }]); void tauriBridge.invoke("append_message", { input: { id: `assistant-${event.runId}`, conversation_id: conversationId, role: "assistant", content: assistant, created_at: createdAt } }); } void tauriBridge.invoke("finish_run", { runId: event.runId, status: "succeeded" }); }
          if (eventType === "runtime_error") { setActiveRunId(null); const code = (event as { code?: string }).code; const status = code === "opencode_aborted" || code === "workflow_cancelled" || code === "media_cancelled" ? "cancelled" : "failed"; setRuns((current) => current.map((run) => run.id === event.runId ? { ...run, status, finished_at: new Date().toISOString() } : run)); void tauriBridge.invoke("finish_run", { runId: event.runId, status }); }
        }
      } catch { /* malformed diagnostics stay in the host log */ }
    }).then((unlisten) => { dispose = unlisten; }).catch(() => undefined);
    return () => { dispose?.(); disposeRuntimeLog?.(); };
  }, [workbenchClient]);

  async function saveSettings() {
    try { const nextConfig = { ...config, locale: localePreference }; setConfig(nextConfig); await tauriBridge.invoke("write_config", { value: nextConfig }); setSettingsOpen(false); setRunStatus(locale === "zh" ? "模型配置已保存到本机 config.json" : "Model settings saved to local config.json"); }
    catch (error) { setRunStatus(error instanceof Error ? error.message : (locale === "zh" ? "配置保存失败" : "Unable to save model settings")); }
  }

  async function pickDirectory(kind: "workspace" | "vault") {
    try {
      const initialPath = kind === "workspace" ? config.workspacePath : config.obsidianVaultPath;
      const selectedPath = await tauriBridge.invoke<string | null>("pick_directory", { initialPath });
      if (!selectedPath) return;
      if (kind === "workspace") setConfig((current) => ({ ...current, workspacePath: selectedPath }));
      else setConfig((current) => ({ ...current, obsidianVaultPath: selectedPath, obsidianIndexPath: current.obsidianIndexPath || `${selectedPath}\\.ai-marketing-index` }));
    } catch (error) {
      setRunStatus(error instanceof Error ? error.message : (locale === "zh" ? "目录选择失败" : "Directory picker failed"));
    }
  }

  async function saveWriterDraft(content: string) {
    try {
      const metadata = await tauriBridge.invoke<{ relative_path: string; mime_type: string; byte_length: number; sha256: string }>("write_writer_draft", { content });
      const row = { id: `writer-draft:${metadata.relative_path}`, relative_path: metadata.relative_path, mime_type: metadata.mime_type, byte_length: metadata.byte_length, sha256: metadata.sha256, created_at: new Date().toISOString(), available: true };
      setArtifactRows((current) => [row, ...current.filter((item) => item.relative_path !== row.relative_path)]);
      setArtifactCount((current) => current + 1);
      setRunStatus(locale === "zh" ? `写作草稿已保存：${metadata.relative_path}` : `Writer draft saved: ${metadata.relative_path}`);
    } catch (error) {
      setRunStatus(locale === "zh" ? `写作草稿保存失败：${error instanceof Error ? error.message : String(error)}` : `Writer draft save failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function prepareRunRetry(run: RunRow) {
    try {
      const detail = toRunDetail(await workbenchClient.runs.inspect(run.id));
      const started = detail.events.find((event) => event.event_type === "run_started");
      let startedPayload: Record<string, unknown> = {};
      try { startedPayload = started ? JSON.parse(started.payload_json) as Record<string, unknown> : {}; } catch { startedPayload = {}; }
      const definitionHash = typeof startedPayload.definitionHash === "string" ? startedPayload.definitionHash : "";
      if (definitionHash) {
        const saved = (await workbenchClient.workflows.list()).find((workflow) => workflow.definition.definitionHash === definitionHash);
        if (saved) {
          const completed: Record<string, Record<string, unknown>> = {};
          for (const node of detail.nodes) {
            if (node.status !== "succeeded" || !node.output_json) continue;
            try {
              const output = JSON.parse(node.output_json);
              if (output && typeof output === "object" && !Array.isArray(output)) completed[node.node_key] = output as Record<string, unknown>;
            } catch { /* malformed checkpoints stay visible in evidence and are not reused */ }
          }
          setRunStatus(locale === "zh" ? "已验证工作流版本，正在从成功节点准备安全重试…" : "Workflow version verified; preparing a safe retry from successful nodes…");
          await runAgent(locale === "zh" ? "重试失败或中断的工作流节点" : "Retry failed or interrupted workflow nodes", undefined, undefined, saved.definition, { completed, recoveryDefinitionHash: definitionHash });
          return;
        }
        setRunStatus(locale === "zh" ? "工作流版本已不存在，无法安全重试；请先导入或保存同一版本" : "The original workflow version is unavailable; import or save the same version before retrying");
        return;
      }
      if (!run.conversation_id) { setRunStatus(locale === "zh" ? "该任务没有关联会话，无法准备重试" : "This task has no conversation and cannot be retried"); return; }
      const history = await workbenchClient.conversations.messages(run.conversation_id);
      const latestUser = [...history].reverse().find((message) => message.role === "user");
      if (!latestUser) { setRunStatus(locale === "zh" ? "未找到原始用户指令，无法准备重试" : "The original user instruction was not found"); return; }
      setActiveConversationId(run.conversation_id);
      activeConversationRef.current = run.conversation_id;
      setPrompt(latestUser.content);
      setRunStatus(locale === "zh" ? "已载入原始指令，确认后可重新发送" : "The original instruction is loaded; confirm to send again");
      navigate(`/dashboard/ai/${run.conversation_id}`);
    } catch (error) { setRunStatus(error instanceof Error ? error.message : (locale === "zh" ? "重试准备失败" : "Unable to prepare retry")); }
  }

  async function rebuildVaultIndex() {
    if (!config.obsidianVaultPath || !config.obsidianIndexPath) { setRunStatus(locale === "zh" ? "请先填写 Obsidian Vault 和索引目录" : "Set the Obsidian Vault and index directory first"); return; }
    try {
      const data = await workbenchClient.knowledge.index({ vaultPath: config.obsidianVaultPath, indexPath: config.obsidianIndexPath, embedding: embeddingPayload(config) });
      setKnowledgeStatus(locale === "zh"
        ? `${data?.semantic ? "语义索引已就绪" : "词法索引已就绪，语义模型不可用"} · ${data?.documents ?? 0} 篇笔记 · ${data?.chunks ?? 0} 个片段${data?.embeddingModel ? ` · ${data.embeddingModel}` : ""}`
        : `${data?.semantic ? "Semantic index ready" : "Lexical index ready; semantic model unavailable"} · ${data?.documents ?? 0} notes · ${data?.chunks ?? 0} chunks${data?.embeddingModel ? ` · ${data.embeddingModel}` : ""}`);
      setRunStatus(data?.semantic ? (locale === "zh" ? "Obsidian 语义索引已完成" : "Obsidian semantic index complete") : (locale === "zh" ? "Obsidian 词法索引已完成，可继续检索" : "Obsidian lexical index complete; search is ready"));
    } catch (error) { setRunStatus(error instanceof Error ? error.message : (locale === "zh" ? "Obsidian 索引启动失败" : "Obsidian index failed")); }
  }

  async function sendHostMessage(message: Record<string, unknown>) {
    const requestId = String(message.requestId ?? globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`);
    const frame = { ...message, requestId };
    const response = new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => { responseWaiters.current.delete(requestId); reject(new Error("workflow_host_response_timeout")); }, 60_000);
      responseWaiters.current.set(requestId, (value) => { clearTimeout(timer); responseWaiters.current.delete(requestId); resolve(value); });
    });
    await tauriBridge.invoke("host_send", { message: frame });
    return response;
  }

  async function searchKnowledge() {
    const query = knowledgeQuery.trim();
    if (!query) return;
    if (!config.obsidianIndexPath) { setKnowledgeStatus(locale === "zh" ? "请先在设置中配置 Obsidian Vault 索引目录" : "Configure the Obsidian Vault index directory first"); return; }
    setKnowledgeStatus(locale === "zh" ? "正在检索本地 Vault…" : "Searching the local Vault…");
    try {
      const results = await workbenchClient.knowledge.search({ indexPath: config.obsidianIndexPath, query, limit: 8, embedding: embeddingPayload(config) });
      setKnowledgeResults([...results]);
      setKnowledgeStatus(results.length ? (locale === "zh" ? `找到 ${results.length} 条本地引用` : `${results.length} local references found`) : (locale === "zh" ? "没有匹配的本地笔记" : "No matching local notes"));
    } catch (error) { setKnowledgeResults([]); setKnowledgeStatus(error instanceof Error ? error.message : (locale === "zh" ? "本地知识检索失败" : "Local knowledge search failed")); }
  }

  async function saveCurrentWorkflow() {
    const definition = sanitizeWorkflowDefinitionForStorage(currentWorkflowDefinition());
    const action = workflowActions.find((item) => item.id === definition.nodes.find((node) => node.nodeKey !== "input" && node.nodeKey !== "output")?.type) ?? workflowActions[0];
    const workflowId = globalThis.crypto?.randomUUID?.() ?? `workflow-${Date.now()}`;
    const title = `${locale === "en" ? workflowActionEnglish[action.id] ?? action.label : action.label} · ${prompt.trim().slice(0, 24) || (locale === "en" ? "Untitled" : "未命名")}`;
    try {
      const saved = toSavedWorkflow(await workbenchClient.workflows.save({ id: workflowId, title, definition }));
      setSavedWorkflows((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setRunStatus(locale === "zh" ? "工作流已保存到本机" : "Workflow saved locally");
    } catch (error) { setRunStatus(error instanceof Error ? error.message : (locale === "zh" ? "工作流保存失败" : "Workflow save failed")); }
  }

  function currentWorkflowDefinition() {
    const base = workflowDefinition ?? buildWorkflowDefinition(prompt, workflowAction, config.provider);
    return sanitizeWorkflowDefinitionForStorage({ ...base, nodes: base.nodes.map((node) => {
      const title = node.nodeKey === "input" ? (locale === "en" ? "Input task" : "输入任务") : node.nodeKey === "output" ? (locale === "en" ? "Local artifact" : "本地产物") : (locale === "en" ? workflowActionEnglish[node.type] ?? node.title : node.title);
      return node.nodeKey === "input" ? { ...node, title, config: { ...node.config, text: prompt } } : node.nodeKey !== "output" ? { ...node, title, config: { ...node.config, prompt, script: prompt, text: prompt, provider: activeProvider.id, model: activeProvider.model, baseUrl: activeProvider.baseUrl, endpoint: activeProvider.endpoint, queryEndpoint: activeProvider.queryEndpoint } } : { ...node, title };
    }) });
  }

  function exportCurrentWorkflow() {
    const blob = new Blob([serializeWorkflowExport(currentWorkflowDefinition())], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `ai-marketing-workflow-${Date.now()}.json`; anchor.click(); URL.revokeObjectURL(url);
    setRunStatus(locale === "zh" ? "工作流 JSON 已导出" : "Workflow JSON exported");
  }

  async function importWorkflow(file: File) {
    try {
      const migrated = parseWorkflowImportText(await file.text());
      const capability = migrated.nodes.find((node) => node.nodeKey === "capability");
      const importedAction = workflowActions.find((item) => item.id === capability?.type);
      const importedConfig = capability?.config && typeof capability.config === "object" ? capability.config as Record<string, unknown> : {};
      const importedPrompt = typeof importedConfig.prompt === "string" ? importedConfig.prompt : typeof importedConfig.text === "string" ? importedConfig.text : "";
      if (importedAction) setWorkflowAction(importedAction.id);
      setWorkflowDefinition(migrated);
      if (importedPrompt) setPrompt(importedPrompt);
      const id = globalThis.crypto?.randomUUID?.() ?? `workflow-${Date.now()}`;
      const name = locale === "zh" ? `导入 · ${importedAction?.label ?? "工作流"}` : `Imported · ${workflowActionEnglish[importedAction?.id ?? ""] ?? "Workflow"}`;
      const saved = toSavedWorkflow(await workbenchClient.workflows.save({ id, title: name, definition: migrated }));
      setSavedWorkflows((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setRunStatus(locale === "zh" ? "工作流已迁移并保存到本机，Provider/路径将使用当前配置" : "Workflow migrated and saved locally; the current Provider and paths will be used");
    } catch (error) { setRunStatus(locale === "zh" ? `工作流导入失败：${error instanceof Error ? error.message : String(error)}` : `Workflow import failed: ${error instanceof Error ? error.message : String(error)}`); }
  }

  async function runAgent(promptOverride?: string, mediaFeatureId?: MediaFeatureId | "image_generate", mediaInputs?: Record<string, unknown>, workflowOverride?: unknown, workflowRetry?: WorkflowRetryState) {
    if (attachmentsPreparing) { setRunStatus(locale === "zh" ? "正在读取附件，请稍候…" : "Preparing attachments…"); return; }
    const basePrompt = (promptOverride ?? prompt).trim();
    const attachmentContext = attachments.length ? (locale === "zh" ? `\n\n本地附件（已复制到当前项目目录，供本轮 OpenCode 读取）：\n${attachments.map((attachment) => `- ${attachment.relativePath ?? attachment.name} (${attachment.mediaType}, ${attachment.size} bytes)`).join("\n")}` : `\n\nLocal attachments copied into the current project for OpenCode:\n${attachments.map((attachment) => `- ${attachment.relativePath ?? attachment.name} (${attachment.mediaType}, ${attachment.size} bytes)`).join("\n")}`) : "";
    let knowledgeContext = "";
    if (knowledgeContextEnabled && basePrompt && config.obsidianIndexPath) {
      try {
        const results = await workbenchClient.knowledge.search({ indexPath: config.obsidianIndexPath, query: basePrompt, limit: 6, embedding: embeddingPayload(config) });
        if (results.length) knowledgeContext = `\n\n本地 Obsidian 知识库上下文（仅来自已选择的 Vault，请优先基于引用回答）：\n${results.map((item) => `[${item.documentPath}${item.heading ? `#${item.heading}` : ""}] ${item.excerpt}`).join("\n")}`;
      } catch {
        setRunStatus(locale === "zh" ? "Obsidian 检索不可用，本轮继续使用普通 OpenCode 上下文" : "Obsidian search is unavailable; this turn will use ordinary OpenCode context");
      }
    }
    const userPrompt = `${basePrompt || (locale === "zh" ? "请处理我提供的本地附件" : "Please process the local attachments I provided")}${attachmentContext}`;
    if (!userPrompt) return;
    const runtimePrompt = `${userPrompt}${knowledgeContext}`;
    const actionId = routeAction ?? workflowAction;
    const resolvedMediaInputs = mediaInputs ?? (actionId === "image_generate" ? parseImageInputs(userPrompt) : undefined);
    const runId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    const conversationId = activeConversationId ?? `conversation-${runId}`;
    activeConversationRef.current = conversationId;
    setActiveConversationId(conversationId);
    setRunStatus(locale === "zh" ? "正在通过本地 OpenCode 运行…" : "Running through local OpenCode…"); setAssistantText(""); setAssistantAt(undefined); setToolEvents([]); setActivePrompt(userPrompt); setActivePromptAt(new Date().toISOString());
    const userMessageCreatedAt = new Date().toISOString();
    setConversationMessages((current) => [...current, { id: `message-${runId}`, role: "user", content: userPrompt, created_at: userMessageCreatedAt }]);
    setActiveRunId(runId);
    let persistedRun = false;
    try {
      await tauriBridge.invoke("host_start");
      await tauriBridge.invoke("create_conversation", { input: { id: conversationId, title: userPrompt.slice(0, 40), project_id: null } });
      setConversations((current) => [{ id: conversationId, title: current.find((item) => item.id === conversationId)?.title ?? userPrompt.slice(0, 40), updated_at: new Date().toISOString(), opencode_session_id: current.find((item) => item.id === conversationId)?.opencode_session_id ?? null }, ...current.filter((item) => item.id !== conversationId)].slice(0, 8));
      const priorConversationHistory = await workbenchClient.conversations.messages(conversationId);
      await tauriBridge.invoke("append_message", { input: { id: `message-${runId}`, conversation_id: conversationId, role: "user", content: userPrompt, created_at: userMessageCreatedAt } });
      setAttachments([]);
       const action = workflowActions.find((item) => item.id === actionId) ?? workflowActions[0];
       const selectedProvider = providerForCapability(config, capabilityForWorkflowAction(actionId));
       await workbenchClient.runs.start({ id: runId, conversationId, prompt: userPrompt, model: selectedProvider.model || undefined, skillId: effectiveSkillId, reasoningEffort: selectedProvider.reasoningEffort ?? reasoningEffort });
       persistedRun = true;
       setRuns((current) => [{ id: runId, conversation_id: conversationId, status: "running", model: selectedProvider.model || null, started_at: new Date().toISOString(), finished_at: null }, ...current].slice(0, 100));
       const capabilityConfig = {
        prompt: runtimePrompt,
        script: runtimePrompt,
        text: runtimePrompt,
         provider: selectedProvider.id,
         model: selectedProvider.model,
         baseUrl: selectedProvider.baseUrl,
         apiKey: selectedProvider.apiKey,
         endpoint: selectedProvider.endpoint,
         queryEndpoint: selectedProvider.queryEndpoint,
        ...(mediaFeatureId ? { featureId: mediaFeatureId } : {}),
        ...(resolvedMediaInputs ?? {}),
        ...(actionId === "knowledge_retrieve" && config.obsidianIndexPath ? { indexPath: config.obsidianIndexPath, query: userPrompt, embeddingMode: embeddingPayload(config).mode, embeddingBaseUrl: embeddingPayload(config).baseUrl, embeddingModel: embeddingPayload(config).model, embeddingApiKey: embeddingPayload(config).apiKey } : {}),
        ...(actionId === "knowledge_write" && config.obsidianVaultPath ? { vaultPath: config.obsidianVaultPath } : {}),
      };
       const workflowDefinition = sanitizeWorkflowDefinitionForStorage(isWorkflowDefinition(workflowOverride) ? workflowOverride : selected.path === "/dashboard/workflows" ? currentWorkflowDefinition() : buildWorkflowDefinition(userPrompt, actionId, selectedProvider, capabilityConfig));
      const mediaNodeTypes = new Set<WorkflowAction>(["image_generate", "video_generate", "digital_human", "music_generate", "voice_synthesis", "voice_clone", "audio_generate"]);
      const mediaNodes = workflowDefinition.nodes.filter((node) => mediaNodeTypes.has(node.type as WorkflowAction));
      const mediaTempDirectories = Object.fromEntries(await Promise.all(mediaNodes.map(async (node) => {
        const allocated = await tauriBridge.invoke<{ relativePath: string }>("allocate_media_temp", { runId, nodeKey: node.nodeKey });
        return [node.nodeKey, allocated.relativePath] as const;
      })));
      await Promise.all(mediaNodes.map((node) => {
         const nodeProvider = typeof node.config.provider === "string" && node.config.provider.trim() ? node.config.provider.trim() : selectedProvider.id;
         const nodeModel = typeof node.config.model === "string" && node.config.model.trim() ? node.config.model.trim() : selectedProvider.model;
        return tauriBridge.invoke("record_run_attempt", { idempotencyKey: `${runId}:${node.nodeKey}:1`, runId, nodeKey: node.nodeKey, provider: nodeProvider || null, providerTaskId: null, status: "queued", payloadJson: JSON.stringify({ executorId: node.type, nodeKey: node.nodeKey, provider: nodeProvider, model: nodeModel, idempotencyKey: `${runId}:${node.nodeKey}:1`, status: "queued" }) });
      }));
      const usesOpenCodeConversation = mode === "chat" || mode === "writer" || selected.path === "/dashboard";
      if (usesOpenCodeConversation) {
        const skillInstruction = effectiveSkillId === "auto" ? "" : `\n\n请使用本地 ${effectiveSkillId} Skill 完成本轮任务，并保持所有产物写入当前项目目录。`;
        const openCodePrompt = `${runtimePrompt}${skillInstruction}`;
        const existingSessionId = conversations.find((item) => item.id === conversationId)?.opencode_session_id ?? undefined;
         const sessionResponse = await sendHostMessage({ version: 1, requestId: `${conversationId}:session`, type: "session.create", payload: { conversationId, ...(existingSessionId ? { sessionId: existingSessionId } : {}), workspacePath: config.workspacePath, model: selectedProvider.model, provider: selectedProvider } });
        if (sessionResponse.ok !== true) throw new Error(String((sessionResponse.error as { message?: string } | undefined)?.message ?? "opencode_session_unavailable"));
        const sessionId = String((sessionResponse.data as { sessionId?: string } | undefined)?.sessionId ?? "");
        if (!sessionId) throw new Error("opencode_session_id_missing");
        await tauriBridge.invoke("set_conversation_session", { conversationId, sessionId });
        const recovered = (sessionResponse.data as { recovered?: unknown } | undefined)?.recovered === true;
        const recoverySnapshot = recovered ? createSessionRecoverySnapshot(priorConversationHistory.filter((message): message is typeof message & { role: "user" | "assistant" } => message.role === "user" || message.role === "assistant")) : "";
        const promptWithRecovery = recoverySnapshot ? `${recoverySnapshot}\n\nCurrent request: ${openCodePrompt}` : openCodePrompt;
         await sendHostMessage({ version: 1, requestId: runId, runId, sessionId, type: "session.prompt", payload: { prompt: promptWithRecovery, model: selectedProvider.model, provider: selectedProvider, skillId: effectiveSkillId, executable: config.runtime.opencodePath } });
      } else {
        const workflowId = `workflow-${actionId}`;
        const actionName = locale === "en" ? workflowActionEnglish[action.id] ?? action.label : action.label;
        const workflowName = locale === "en" ? `${actionName} workflow` : `${actionName}工作流`;
        const saved = toSavedWorkflow(await workbenchClient.workflows.save({ id: workflowId, title: workflowName, definition: workflowDefinition }));
        setSavedWorkflows((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
         await sendHostMessage({ version: 1, requestId: runId, runId, type: "workflow.run", payload: { workspacePath: config.workspacePath, provider: selectedProvider, media: selectedProvider, providers: config.providers, vaultPath: config.obsidianVaultPath, indexPath: config.obsidianIndexPath, executable: config.runtime.opencodePath, mediaTempDirectories, definition: workflowDefinition, ...(workflowRetry ? { completed: workflowRetry.completed, recoveryDefinitionHash: workflowRetry.recoveryDefinitionHash } : {}) } });
      }
      setPrompt(""); setRunStatus(locale === "zh" ? "已发送，等待本地 Agent 事件…" : "Sent; waiting for local Agent events…");
    } catch (error) {
      if (persistedRun) await tauriBridge.invoke("finish_run", { runId, status: "failed" }).catch(() => undefined);
      setRuns((current) => current.map((run) => run.id === runId ? { ...run, status: "failed", finished_at: new Date().toISOString() } : run));
      setActiveRunId(null); setRunStatus(error instanceof Error ? error.message : (locale === "zh" ? "本地 Agent 启动失败" : "Local Agent failed to start"));
    }
  }

  async function cancelActiveRun() {
    if (!activeRunId) return;
    try { const runId = activeRunId; await workbenchClient.runs.emergencyStop(runId); setRunStatus(locale === "zh" ? "已紧急停止本地 Agent" : "Local Agent emergency-stopped"); setActiveRunId(null); setRuns((current) => current.map((run) => run.id === runId ? { ...run, status: "cancelled", finished_at: new Date().toISOString() } : run)); await tauriBridge.invoke("finish_run", { runId, status: "cancelled" }); }
    catch (error) { setRunStatus(error instanceof Error ? error.message : (locale === "zh" ? "停止任务失败" : "Failed to stop the run")); }
  }

  if (!runtimeReady) return <main className="bootstrap-screen"><div className="bootstrap-mark">AI</div><div className="eyebrow">LOCAL RUNTIME BOOTSTRAP</div><h1>{locale === "zh" ? "正在准备本地运行环境" : "Preparing local runtime"}</h1><p>{localizeRuntimeStatus(runtimeStatus, locale)}</p><small>{locale === "zh" ? "缺少必要组件时会自动调用安装脚本；环境复检通过前不会打开工作台。" : "Missing components are repaired automatically; the workbench opens only after the runtime passes its probes."}</small></main>;
  const immersivePage = selected.mode === "chat" || selected.mode === "writer" || selected.path === "/dashboard/image-assistant" || selected.path === "/dashboard/video" || selected.path.includes("executive-ppt");

  return (
    <div className="shell" style={{ "--wb-background": WORKBENCH_THEME.light.background, "--wb-foreground": WORKBENCH_THEME.light.foreground, "--wb-card": WORKBENCH_THEME.light.card, "--wb-primary": WORKBENCH_THEME.light.primary, "--wb-primary-foreground": WORKBENCH_THEME.light.primaryForeground, "--wb-muted": WORKBENCH_THEME.light.muted, "--wb-muted-foreground": WORKBENCH_THEME.light.mutedForeground, "--wb-border": WORKBENCH_THEME.light.border, "--wb-body-font": WORKBENCH_THEME.typography.body, "--wb-display-font": WORKBENCH_THEME.typography.display, "--wb-message-max-width": WORKBENCH_MESSAGE_FRAME.maxWidth, "--wb-message-padding": WORKBENCH_MESSAGE_FRAME.rowPadding, "--wb-message-gap": WORKBENCH_MESSAGE_FRAME.gap, "--wb-message-avatar-size": WORKBENCH_MESSAGE_FRAME.avatarSize, "--wb-message-avatar-radius": WORKBENCH_MESSAGE_FRAME.avatarRadius } as CSSProperties}>
      <WorkbenchShell navItems={routes.map((item) => ({ ...item, icon: <RouteIcon name={item.iconKey} /> }))} activePath={activePath} onNavigate={workbenchClient.navigation.go} collapsed={sidebarCollapsed} onToggleCollapsed={() => setSidebarCollapsed((current) => !current)} locale={locale} onLocaleChange={(nextLocale) => { if (nextLocale !== locale) setLocalePreference(nextLocale); }} onLocaleToggle={toggleLocale} localLabel={copy.localWorkspace} status={<><span className="status-dot" />{localizeRuntimeStatus(runtimeStatus, locale)}<div className="muted">OpenCode · Python · Skills</div><button type="button" className="sidebar-settings-link" onClick={() => workbenchClient.navigation.go("/dashboard/settings")}>{copy.modelSettings}</button></>}>
      <section className={`workspace ${selected.path === "/dashboard" ? "workspace-home" : ""} ${immersivePage ? "workspace-immersive" : ""}`.trim()}>
        {selected.path === "/dashboard" ? null : immersivePage ? null : <header className="topbar"><div><div className="eyebrow">LOCAL AGENT WORKBENCH</div><h1>{selected.label}</h1></div><div className="top-actions"><button className="ghost" onClick={() => setSettingsOpen((open) => !open)}>{copy.modelSettings}</button><button className="ghost" onClick={() => void tauriBridge.invoke("open_workspace").catch((error) => setRunStatus(error instanceof Error ? error.message : (locale === "zh" ? "项目目录打开失败" : "Unable to open project")))}>{locale === "zh" ? "打开项目" : "Open project"}</button></div></header>}
        {settingsOpen && <DesktopSettingsPanel config={config} skillId={skillId} locale={locale} localePreference={localePreference} copy={copy} onConfigChange={setConfig} onSkillChange={setSkillId} onLocalePreferenceChange={setLocalePreference} onClose={() => setSettingsOpen(false)} onSave={() => void saveSettings()} onRebuildVault={() => void rebuildVaultIndex()} onPickDirectory={(kind) => void pickDirectory(kind)} onRepairRuntime={() => void tauriBridge.invoke("repair_runtime", { options: config.offlineRuntimeZipPath ? { offlineZip: config.offlineRuntimeZipPath } : undefined }).then(() => setRunStatus(locale === "zh" ? "已导入离线运行时并完成复检" : "Offline runtime imported and rechecked")).catch((error) => setRunStatus(error instanceof Error ? error.message : (locale === "zh" ? "离线运行时导入失败" : "Offline runtime import failed")))} onExportDiagnostics={() => void tauriBridge.invoke<{ path: string }>("export_diagnostics").then((result) => setRunStatus(locale === "zh" ? `诊断包已导出：${result.path}` : `Diagnostics exported: ${result.path}`)).catch((error) => setRunStatus(error instanceof Error ? error.message : (locale === "zh" ? "诊断包导出失败" : "Diagnostics export failed")))} />}
        {selected.path === "/dashboard" ? <div className="home-shell"><div className="home-page-shell"><header className="home-topbar"><div className="home-topbar-status"><span className="public-signal" />{homeCopy.workspaceReady}{savedWorkflows.length ? <span className="home-topbar-count">{savedWorkflows.length} {locale === "zh" ? "个流程可用" : "flows ready"}</span> : null}</div><button className="home-credits-link" onClick={() => workbenchClient.navigation.go("/dashboard/tasks")}><span className="home-credits-icon"><WorkbenchRouteIcon name="sparkles" size={14} /></span><span>{homeCopy.viewUsage}</span><WorkbenchRouteIcon name="arrowUpRight" size={15} /></button></header><main className="home-main">
          <section className="home-welcome"><div className="home-welcome-kicker">AI MARKETING WORKSPACE</div><h1>{homeCopy.welcomePrefix}{homeCopy.welcomeDefaultName}<span className="home-welcome-mark" aria-hidden="true">✦</span></h1><p>{homeCopy.welcomeSubtitle}</p></section>
          <section className="home-chat-workspace"><div className="chat-composer">{attachments.length ? <div className="composer-attachment-chips">{attachments.map((attachment) => <button key={attachment.id} type="button" className="composer-attachment-chip" onClick={() => removeAttachment(attachment.id)} title={locale === "zh" ? "移除附件" : "Remove attachment"}>{attachment.name} ×</button>)}</div> : null}<textarea className="composer-input" value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (!activeRunId && (prompt.trim() || attachments.length)) void runAgent(); } }} placeholder={copy.homePlaceholder} /><div className="home-composer-footer"><div className="composer-left-actions"><div className="composer-add-wrap"><button type="button" className="composer-add" title={locale === "zh" ? "添加附件或知识库" : "Add files or knowledge"} aria-expanded={homeAttachmentMenuOpen} onClick={() => setHomeAttachmentMenuOpen((open) => !open)}>＋</button>{homeAttachmentMenuOpen ? <div className="composer-add-menu" role="menu"><button type="button" role="menuitem" onClick={() => { setHomeAttachmentMenuOpen(false); homeAttachmentInputRef.current?.click(); }}>⌕ {locale === "zh" ? "上传本地文件" : "Upload local file"}</button><button type="button" role="menuitem" onClick={() => { setHomeAttachmentMenuOpen(false); setKnowledgeContextEnabled(true); }}>{locale === "zh" ? "⌑ 添加 Obsidian 知识库" : "⌑ Add Obsidian knowledge"}</button></div> : null}<input ref={homeAttachmentInputRef} type="file" multiple accept="image/*,.txt,.md,.docx,.pdf,.csv,.json,text/*,application/json,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" onChange={(event) => { addAttachments(event.target.files); event.currentTarget.value = ""; }} /></div>{knowledgeContextEnabled ? <div className="composer-knowledge-control"><button className="composer-knowledge-button" onClick={() => setKnowledgeContextEnabled(false)}>{locale === "zh" ? "⌑ Obsidian 知识库" : "⌑ Obsidian context"}</button><button type="button" className="composer-knowledge-close" aria-label={locale === "zh" ? "关闭 Obsidian 知识库上下文" : "Disable Obsidian knowledge"} onClick={() => setKnowledgeContextEnabled(false)}>×</button></div> : null}</div><span className="sr-only" aria-live="polite">{localizeDesktopStatus(runStatus, locale)}</span><ModelControls locale={locale} model={activeModel} models={activeModels} providerSource={formatWorkbenchModelLabel(activeModel, { zh: "本地模型", en: "Local model" }, locale)} reasoningEffort={reasoningEffort} skillId={skillId} showSkill={false} onModelChange={updateModel} onReasoningChange={updateReasoning} onSkillChange={setSkillId} />{activeRunId ? <button className="ghost" onClick={() => void cancelActiveRun()}>{locale === "zh" ? "停止" : "Stop"}</button> : <button className="send-button" disabled={!prompt.trim() && !attachments.length} onClick={() => void runAgent()}><RouteIcon name="send" size={14} />{copy.send}</button>}</div></div></section>
          <HomeEntryGroups onNavigate={workbenchClient.navigation.go} locale={locale} />
        </main></div></div> : selected.mode === "chat" || selected.mode === "writer" ? <DesktopConversationWorkspace route={selected} prompt={prompt} onPromptChange={setPrompt} runStatus={runStatus} activeRunId={activeRunId} onRun={(value) => void runAgent(value)} onGenerateImages={() => void runAgent(locale === "zh" ? "基于上一轮文案生成配图，并将图片产物写入当前项目目录。" : "Generate images from the previous draft and write the image artifacts into the current project directory.", "image_generate")} onCancel={() => void cancelActiveRun()} onNewConversation={startNewConversation} knowledgeEnabled={knowledgeContextEnabled} onKnowledgeToggle={() => setKnowledgeContextEnabled((current) => !current)} activePrompt={activePrompt} activePromptAt={activePromptAt} assistantText={assistantText} onAssistantTextChange={setAssistantText} onSaveDraft={saveWriterDraft} assistantAt={assistantAt} messages={conversationMessages} toolEvents={toolEvents} conversations={conversations} onNavigate={workbenchClient.navigation.go} artifacts={artifactRows} onArtifactOpen={(relativePath, mimeType) => void workbenchClient.files.open(relativePath, mimeType)} model={activeModel} models={activeModels} reasoningEffort={reasoningEffort} skillId={effectiveSkillId} attachments={attachments} onAddAttachments={addAttachments} onRemoveAttachment={removeAttachment} onModelChange={updateModel} onReasoningChange={updateReasoning} onSkillChange={setSkillId} locale={locale} /> : selected.path === "/dashboard/workflows" ? <DesktopWorkflowWorkspace route={selected} prompt={prompt} onPromptChange={setPrompt} runStatus={runStatus} activeRunId={activeRunId} onRun={(definition) => void runAgent(undefined, undefined, undefined, definition)} onCancel={() => void cancelActiveRun()} savedWorkflows={savedWorkflows} workflowAction={workflowAction} onWorkflowAction={setWorkflowAction} definition={workflowDefinition} onDefinitionChange={setWorkflowDefinition} onSave={() => void saveCurrentWorkflow()} onExport={exportCurrentWorkflow} onImport={(file) => void importWorkflow(file)} model={activeModel} models={activeModels} reasoningEffort={reasoningEffort} skillId={effectiveSkillId} onModelChange={updateModel} onReasoningChange={updateReasoning} onSkillChange={setSkillId} locale={locale} /> : (selected.path === "/dashboard/image-assistant" || selected.path === "/dashboard/video") ? <DesktopMediaWorkspace route={selected} prompt={prompt} onPromptChange={setPrompt} runStatus={runStatus} activeRunId={activeRunId} onRun={(override, featureId, mediaInputs) => void runAgent(override, featureId, mediaInputs)} onCancel={() => void cancelActiveRun()} workflowAction={workflowAction} onWorkflowAction={setWorkflowAction} artifactRows={artifactRows} providerConfigured={isMediaProviderConfigured(activeProvider)} onOpenSettings={() => { setSettingsOpen(true); workbenchClient.navigation.go("/dashboard/settings"); }} onOpenTasks={() => workbenchClient.navigation.go("/dashboard/tasks")} onArtifactReveal={(relativePath, mimeType) => void workbenchClient.files.reveal(relativePath, mimeType)} onAddAttachments={addAttachments} attachments={attachments} model={activeModel} models={activeModels} reasoningEffort={reasoningEffort} skillId={effectiveSkillId} onModelChange={updateModel} onReasoningChange={updateReasoning} onSkillChange={setSkillId} locale={locale} /> : selected.path === "/dashboard/settings" ? null : selected.mode === "library" ? <DesktopLibraryWorkspace route={selected} artifactRows={artifactRows} savedWorkflows={savedWorkflows} conversations={conversations} runs={runs} taskCount={taskCount} tokenCount={tokenCount} artifactCount={artifactCount} providerCost={providerCost} estimatedCost={estimatedCost} onNavigate={workbenchClient.navigation.go} onRetryRun={(run) => void prepareRunRetry(run)} onInspectRun={(runId) => workbenchClient.runs.inspect(runId).then(toRunDetail)} onArtifactRemove={(artifactId) => { void workbenchClient.artifacts.remove(artifactId).then(() => setArtifactRows((current) => current.filter((item) => item.id !== artifactId))); }} onArtifactReveal={(relativePath, mimeType) => void workbenchClient.files.reveal(relativePath, mimeType)} onKnowledgeOpen={(relativePath) => void workbenchClient.knowledge.open(relativePath)} knowledgeQuery={knowledgeQuery} knowledgeResults={knowledgeResults} knowledgeStatus={knowledgeStatus} onKnowledgeQueryChange={setKnowledgeQuery} onKnowledgeSearch={() => void searchKnowledge()} locale={locale} /> : <div className="content-grid">
          <section className="hero-card"><div className="eyebrow">{locale === "zh" ? "当前能力" : "Current capability"}</div><h2>{selected.description}</h2><p>{locale === "zh" ? "数据保存在本机，Agent、工具步骤、产物和用量会实时写入本地项目目录。" : "Data stays on this machine; Agent output, tool steps, artifacts, and usage are recorded locally."}</p><div className="capability-row"><span>OpenCode Agent</span><span>{locale === "zh" ? "本地会话" : "Local sessions"}</span><span>Obsidian RAG</span><span>{locale === "zh" ? "媒体产物" : "Media artifacts"}</span></div></section>
          <section className="run-card"><div className="run-card-header"><span>{locale === "zh" ? "新建任务" : "New task"}</span><span className="provider-pill">{locale === "zh" ? "默认模型 · 本地配置" : "Default model · Local config"}</span></div>{mode !== "chat" && <label className="workflow-select">{locale === "zh" ? "工作流能力" : "Workflow capability"}<select value={workflowAction} onChange={(event) => setWorkflowAction(event.target.value as WorkflowAction)}>{workflowActions.map((item) => <option key={item.id} value={item.id}>{locale === "en" ? workflowActionEnglish[item.id] ?? item.label : item.label}</option>)}</select></label>}<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={locale === "zh" ? "描述你想完成的营销任务……" : "Describe the marketing task you want to complete…"} /><div className="run-footer"><span className="muted">{runStatus || (locale === "zh" ? "Enter 发送 · Shift+Enter 换行" : "Enter to send · Shift+Enter for a new line")}</span>{activeRunId ? <button className="ghost" onClick={() => void cancelActiveRun()}>{copy.stop}</button> : <button className="primary" disabled={!prompt.trim()} onClick={() => void runAgent()}>{locale === "zh" ? "运行 Agent" : "Run Agent"}</button>}</div></section>
          <section className="recent-card"><div className="section-title"><span>{selected.path === "/dashboard/assets" ? (locale === "zh" ? "资产库" : "Asset library") : mode === "library" ? (locale === "zh" ? "本地工作流与会话" : "Local workflows and sessions") : (locale === "zh" ? "最近会话" : "Recent sessions")}</span><span className="muted">{selected.path === "/dashboard/assets" ? `${artifactRows.length} ${locale === "zh" ? "个产物" : "artifacts"}` : savedWorkflows.length ? `${savedWorkflows.length} ${locale === "zh" ? "个工作流" : "workflows"}` : ""}</span></div>{selected.path === "/dashboard/assets" ? (artifactRows.length ? <div className="conversation-list">{artifactRows.map((item) => <button key={item.id} className="conversation-row artifact-row" onClick={() => void workbenchClient.files.reveal(item.relative_path, item.mime_type)}><span>{item.relative_path}</span><small>{Math.ceil(item.byte_length / 1024)} KB · {item.mime_type}</small></button>)}</div> : <div className="empty-state"><strong>{locale === "zh" ? "还没有本地产物" : "No local artifacts yet"}</strong><p>{locale === "zh" ? "运行写作、PPT 或媒体任务后，文件会出现在这里。" : "Artifacts appear here after writing, PPT, or media runs."}</p></div>) : mode === "library" && savedWorkflows.length ? <div className="conversation-list">{savedWorkflows.map((item) => <div key={item.id} className="conversation-row"><span>{item.name}</span><small>{formatDateTime(item.updated_at, locale)}</small></div>)}</div> : assistantText || activePrompt ? <div className="message-thread"><WorkbenchChatMessage role="user" label={locale === "zh" ? "你的指令" : "Your instruction"} content={activePrompt} timestamp={activePromptAt} /><WorkbenchChatMessage role="assistant" label="AI RESPONSE" content={assistantText} timestamp={assistantAt} pending={!assistantText && Boolean(activeRunId)} events={toolEvents.map((item) => ({ type: "tool", label: item, status: "info" }))} artifacts={artifactRows.map((artifact) => ({ id: artifact.id, title: artifact.relative_path, relativePath: artifact.relative_path, mimeType: artifact.mime_type, byteLength: artifact.byte_length }))} onArtifactOpen={(relativePath, mimeType) => void workbenchClient.files.reveal(relativePath, mimeType)} /></div> : conversations.length ? <div className="conversation-list">{conversations.map((item) => <button key={item.id} type="button" className="conversation-row" onClick={() => navigate(`/dashboard/ai/${item.id}`)}><span>{item.title}</span><small>{formatDateTime(item.updated_at, locale)}</small></button>)}</div> : <div className="empty-state"><div className="empty-icon">⌁</div><strong>{locale === "zh" ? "还没有本地会话" : "No local sessions yet"}</strong><p>{locale === "zh" ? "运行第一个任务后，文本、工具步骤和产物会显示在这里。" : "Text, tool steps, and artifacts will appear here after your first task."}</p></div>}</section>
          <section className="stats-card"><div className="section-title"><span>{locale === "zh" ? "本地状态" : "Local status"}</span><span className="muted">{locale === "zh" ? "只统计，不扣费" : "Stats only; no billing"}</span></div><div className="stats-grid"><div><strong>{taskCount}</strong><span>{locale === "zh" ? "本地任务" : "Local tasks"}</span></div><div><strong>{tokenCount}</strong><span>Token</span></div><div><strong>{artifactCount}</strong><span>{locale === "zh" ? "产物" : "Artifacts"}</span></div></div></section>
        </div>}
      </section>
      </WorkbenchShell>
    </div>
  );
}
