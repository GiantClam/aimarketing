import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { formatWorkbenchModelLabel, WORKBENCH_CHAT_QUICK_PROMPTS, WORKBENCH_HOME_COPY, WORKBENCH_HOME_GROUPS, WORKBENCH_ROUTE_MANIFEST, WORKBENCH_WRITER_QUICK_PROMPTS } from "@aimarketing/workbench-ui";
import { configuredModelOptions, isMediaProviderConfigured, preferredConfiguredModel } from "../src/provider-config";

test("desktop routes consume the retained online dashboard manifest", () => {
  const paths = WORKBENCH_ROUTE_MANIFEST.map((route) => route.path);
  assert.equal(paths[0], "/dashboard");
  assert.ok(paths.includes("/dashboard/ai"));
  assert.ok(paths.includes("/dashboard/writer"));
  assert.ok(paths.includes("/dashboard/workflows"));
  assert.ok(paths.includes("/dashboard/knowledge-base"));
  assert.ok(paths.includes("/dashboard/video"));
  assert.ok(paths.includes("/dashboard/works"));
  assert.ok(paths.includes("/dashboard/settings"));
  assert.equal(WORKBENCH_ROUTE_MANIFEST.find((route) => route.path === "/dashboard/settings")?.placement, "hidden");
  for (const excluded of ["/dashboard/billing", "/dashboard/platform-settings", "/dashboard/agent-platform"]) assert.equal(paths.includes(excluded), false);
  assert.equal(WORKBENCH_ROUTE_MANIFEST.find((route) => route.path === "/dashboard/writer")?.label.zh, "多平台写作");
  assert.equal(WORKBENCH_ROUTE_MANIFEST.find((route) => route.path === "/dashboard/workflows")?.label.zh, "工作流");
  assert.equal(WORKBENCH_ROUTE_MANIFEST.find((route) => route.path === "/dashboard/writer")?.description.zh, "统一生成多平台图文内容，并支持 Markdown 编辑与发布准备。");
  assert.equal(WORKBENCH_ROUTE_MANIFEST.find((route) => route.path === "/dashboard/ai")?.mode, "chat");
  assert.equal(WORKBENCH_ROUTE_MANIFEST.find((route) => route.path === "/dashboard/ai?agent=executive-ppt")?.mode, "chat");
  assert.equal(WORKBENCH_ROUTE_MANIFEST.find((route) => route.path === "/dashboard/writer")?.mode, "writer");
  assert.equal(WORKBENCH_ROUTE_MANIFEST.find((route) => route.path === "/dashboard/workflows")?.mode, "workflow");
  assert.equal(WORKBENCH_ROUTE_MANIFEST.find((route) => route.path === "/dashboard/knowledge-base")?.mode, "library");
});

test("desktop model selector uses the shared cloud Standard label formatter", () => {
  assert.equal(formatWorkbenchModelLabel("ollama/qwen3:8b", { zh: "本地模型", en: "Local model" }, "zh"), "qwen3:8b");
  assert.equal(formatWorkbenchModelLabel("aiberm/gpt-5.4", { zh: "本地模型", en: "Local model" }, "en"), "gpt-5.4");
  assert.equal(formatWorkbenchModelLabel("", { zh: "本地模型", en: "Local model" }, "en"), "Local model");
});

test("configured provider models populate selectors and take priority over a stale default", () => {
  const provider = { model: "retired/model", models: ["provider/fast", "provider/reasoning", "provider/fast", ""] };
  assert.deepEqual(configuredModelOptions(provider), ["provider/fast", "provider/reasoning"]);
  assert.equal(preferredConfiguredModel(provider), "provider/fast");
  assert.equal(preferredConfiguredModel({ ...provider, model: "provider/reasoning" }), "provider/reasoning");
});

test("desktop home keeps the cloud entry grouping and excludes SaaS-only entries", () => {
  assert.deepEqual(WORKBENCH_HOME_GROUPS.map((group) => group.label), ["AI TEAM", "OFFICE TOOLS", "WORKFLOWS", "CONTENT CREATION", "MORE"]);
  const homePaths = WORKBENCH_HOME_GROUPS.flatMap((group) => group.entries.map((entry) => entry.path));
  assert.ok(homePaths.includes("/dashboard/ai"));
  assert.ok(homePaths.includes("/dashboard/works"));
  assert.equal(homePaths.includes("/dashboard/agent-platform"), false);
  assert.equal(homePaths.includes("/dashboard/platform-settings"), false);
});

test("cloud and desktop consume one canonical home copy contract", () => {
  const desktopSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
  const cloudSource = readFileSync(resolve(process.cwd(), "../../components/platform/workspace-platform-home.tsx"), "utf8");
  assert.equal(WORKBENCH_HOME_COPY.zh.workspaceReady, "工作区已就绪");
  assert.equal(WORKBENCH_HOME_COPY.en.viewUsage, "View usage");
  assert.match(desktopSource, /WORKBENCH_HOME_COPY/);
  assert.match(cloudSource, /WORKBENCH_HOME_COPY/);
  assert.match(desktopSource, /homeCopy\.welcomePrefix/);
  assert.match(cloudSource, /homeCopy\.welcomePrefix/);
});

test("desktop and cloud home use one shared route-icon renderer", () => {
  const desktopSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
  const cloudSource = readFileSync(resolve(process.cwd(), "../../components/platform/workspace-platform-home.tsx"), "utf8");
  const iconSource = readFileSync(resolve(process.cwd(), "../../packages/workbench-ui/src/route-icon.tsx"), "utf8");
  assert.match(desktopSource, /WorkbenchRouteIcon/);
  assert.match(cloudSource, /WorkbenchRouteIcon/);
  assert.match(cloudSource, /iconKey/);
  assert.match(iconSource, /House/);
  assert.match(iconSource, /Presentation/);
  assert.match(iconSource, /Workflow/);
});

test("cloud and desktop home omit SaaS-only marketplace and platform settings entries", () => {
  const cloudSource = readFileSync(resolve(process.cwd(), "../../components/platform/workspace-platform-home.tsx"), "utf8");
  assert.doesNotMatch(cloudSource, /href="\/dashboard\/agent-platform"/);
  assert.doesNotMatch(cloudSource, /href="\/dashboard\/platform-settings"/);
  assert.match(cloudSource, /href="\/dashboard\/tasks" className="home-credits-link"/);
});

test("cloud static sidebar routes use the shared icon renderer", () => {
  const cloudLayout = readFileSync(resolve(process.cwd(), "../../components/dashboard-layout.tsx"), "utf8");
  assert.match(cloudLayout, /WorkbenchRouteIcon/);
  assert.match(cloudLayout, /iconName="home"/);
  assert.match(cloudLayout, /iconName="workflow"/);
  assert.match(cloudLayout, /iconName="knowledge"/);
});

test("desktop shell keeps the cloud visual primitives and workflow state path", () => {
  const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
  assert.match(appSource, /WorkbenchShell/);
  assert.match(appSource, /WORKBENCH_THEME/);
  assert.match(appSource, /WorkbenchChatMessage/);
  assert.match(appSource, /showSkill=\{false\}/);
  assert.match(readFileSync(resolve(process.cwd(), "../../components/ai-entry/ai-entry-workspace.tsx"), "utf8"), /data-cloud-surface="message"/);
  assert.doesNotMatch(appSource, /WorkbenchMessageFrame/);
  assert.match(appSource, /onRun=\{\(definition\) => void runAgent\(undefined, undefined, undefined, definition\)\}/);
  assert.match(appSource, /onDefinitionChange/);
  assert.match(appSource, /workflowDefinition/);
});

test("desktop-only runtime status does not alter the cloud sidebar geometry", () => {
  const sharedSource = readFileSync(resolve(process.cwd(), "../../packages/workbench-ui/src/components.tsx"), "utf8");
  const localeSource = readFileSync(resolve(process.cwd(), "src/i18n.ts"), "utf8");
  assert.match(sharedSource, /localLabel \|\| status/);
  assert.match(sharedSource, /localLabel \? <div className="wb-local-label"/);
  assert.match(localeSource, /localWorkspace: ""/);
});

test("local Skill preference is persisted in config while hidden from the cloud composer row", () => {
  const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
  assert.match(appSource, /provider\.skillId/);
  assert.match(appSource, /setSkillIdState\(activeConfig\.provider\.skillId/);
  assert.match(appSource, /默认 Skill/);
  assert.match(appSource, /showSkill=\{false\}/);
});

test("shared shell local-language controls are localized in both directions", () => {
  const sharedSource = readFileSync(resolve(process.cwd(), "../../packages/workbench-ui/src/components.tsx"), "utf8");
  assert.match(sharedSource, /locale === "zh" \? "切换到中文" : "Switch to Chinese"/);
  assert.match(sharedSource, /locale === "en" \? "Switch to English" : "切换到英文"/);
});

test("desktop home uses the same cloud page shell nesting", () => {
  const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
  assert.match(appSource, /className=\"home-shell\"><div className=\"home-page-shell\"><header className=\"home-topbar\"/);
  assert.match(appSource, /<main className=\"home-main\">/);
  assert.match(appSource, /<HomeEntryGroups onNavigate=\{navigate\} locale=\{locale\} \/>/);
  assert.match(appSource, /chat-landing-kicker/);
  assert.match(appSource, /className=\"dashboard-title\"/);
  assert.match(appSource, /className=\"send-button\" disabled=\{!prompt\.trim\(\) && !attachments\.length\}/);
  assert.match(appSource, /placeholder=\{copy\.homePlaceholder\}/);
  assert.match(appSource, /showSkill=\{false\}/);
  assert.match(readFileSync(resolve(process.cwd(), "src/i18n.ts"), "utf8"), /homePlaceholder: \"输入你的问题\.\.\.\"/);
  assert.match(readFileSync(resolve(process.cwd(), "src/i18n.ts"), "utf8"), /homePlaceholder: \"Ask anything\.\.\.\"/);
  assert.match(readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8"), /\.home-chat-workspace \.send-button \{ height: 40px/);
});

test("query-string Agent routes highlight the exact cloud navigation item", () => {
  const sharedSource = readFileSync(resolve(process.cwd(), "../../packages/workbench-ui/src/components.tsx"), "utf8");
  assert.match(sharedSource, /hasExactActiveRoute/);
  assert.match(sharedSource, /!hasExactActiveRoute/);
  assert.match(readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8"), /new URLSearchParams\(rawQuery\)/);
  assert.match(readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8"), /for \(const \[key, value\] of expected\.entries\(\)/);
});

test("desktop writer and media surfaces retain the online control contract", () => {
  const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
  assert.match(appSource, /平台：\$\{WORKBENCH_WRITER_PLATFORMS/);
  assert.match(appSource, /内容类型/);
  assert.match(appSource, /WORKBENCH_WRITER_PLATFORMS/);
  assert.match(appSource, /WORKBENCH_WRITER_CONTENT_TYPES/);
  assert.match(appSource, /WRITER RESPONSE/);
  assert.match(appSource, /Object\.fromEntries\(Object\.entries\(fieldValues\)/);
  assert.match(appSource, /mediaInputs/);
  assert.match(appSource, /DesktopWriterCloudWorkspace/);
  assert.match(appSource, /writer-cloud-composer/);
  assert.match(appSource, /writer-preview-overlay/);
  assert.match(appSource, /writer-message-actions/);
  assert.match(appSource, /data-cloud-surface="composer"/);
  assert.match(appSource, /onGenerateImages/);
  assert.match(appSource, /conversationMessages/);
  assert.match(appSource, /displayedMessages\.map/);
  assert.match(appSource, /composer-add-menu/);
  assert.match(appSource, /composer-selected-agent/);
  assert.match(appSource, /composer-knowledge-button/);
  assert.match(appSource, /startNewConversation/);
  assert.match(appSource, /knowledgeContextEnabled/);
  assert.match(appSource, /attachments=\{attachments\}/);
  assert.match(appSource, /writer-cloud-input/);
  assert.match(appSource, /event\.key === "Enter" && !event\.shiftKey/);
  assert.match(appSource, /event\.ctrlKey/);
  assert.match(appSource, /blockPlainEnter/);
  assert.match(appSource, /onAddAttachments=\{onAddAttachments\}/);
  assert.match(appSource, /onKnowledgeToggle=\{onKnowledgeToggle\}/);
  assert.match(appSource, /previewEditing/);
  assert.match(appSource, /write_writer_draft/);
  assert.match(appSource, /writer-preview-editor/);
  assert.match(appSource, /knowledge\.search/);
  assert.match(appSource, /本地 Obsidian 知识库上下文/);
  assert.match(appSource, /chat-quick-start-grid/);
  assert.match(appSource, /composer-prompt-chips/);
  assert.match(appSource, /data-cloud-surface=\"prompt-suggestions\"/);
  assert.match(appSource, /添加 Obsidian 知识库/);
  assert.match(appSource, /const userPrompt =/);
  assert.match(appSource, /const runtimePrompt =/);
  assert.match(appSource, /content: userPrompt/);
  assert.match(appSource, /prompt: runtimePrompt/);
  assert.match(appSource, /begin_local_attachment/);
  assert.match(appSource, /append_local_attachment_chunk/);
  assert.match(appSource, /finish_local_attachment/);
  assert.match(appSource, /file\.stream\(\)/);
  const tauriSource = readFileSync(resolve(process.cwd(), "src-tauri/src/lib.rs"), "utf8");
  assert.doesNotMatch(tauriSource, /write_local_attachment/);
  assert.match(tauriSource, /attachment_partial_target/);
  assert.match(tauriSource, /fs::rename\(&partial, &target\)/);
  assert.match(appSource, /relativePath/);
  assert.match(appSource, /本地附件（已复制到当前项目目录/);
  assert.match(appSource, /label=\{message\.role === "user" \? writerCopy\.you : writerCopy\.assistant\}/);
  const sharedMessageSource = readFileSync(resolve(process.cwd(), "../../packages/workbench-ui/src/components.tsx"), "utf8");
  assert.match(sharedMessageSource, /ReactMarkdown/);
  assert.match(sharedMessageSource, /remarkGfm/);
  assert.match(sharedMessageSource, /data-cloud-surface=\"message\"/);
  assert.equal(WORKBENCH_CHAT_QUICK_PROMPTS.length, 3);
  assert.equal(WORKBENCH_WRITER_QUICK_PROMPTS.length, 3);
});

test("desktop video media surface mirrors the cloud capability and launcher contract", () => {
  const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
  const styleSource = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
  assert.match(appSource, /function DesktopMediaWorkspaceBody/);
  assert.match(appSource, /function DesktopMediaWorkspace\(props: DesktopMediaWorkspaceProps\)/);
  assert.match(appSource, /const isMediaCatalog = isVideo;/);
  assert.match(appSource, /selected\.path === "\/dashboard\/image-assistant" \|\| selected\.path === "\/dashboard\/video"/);
  assert.doesNotMatch(appSource, /selected\.path === "\/dashboard\/capabilities"\) \? <DesktopMediaWorkspace/);
  assert.match(appSource, /title: props\.route\.label/);
  assert.match(appSource, /description: isVideo \? props\.route\.description/);
  assert.match(appSource, /activeFeatureId \? <DesktopMediaWorkspaceBody/);
  assert.match(appSource, /desktop-media-route-shell/);
  assert.match(appSource, /capability-group-card/);
  assert.match(appSource, /capability-tile/);
  assert.match(appSource, /launcher-workspace/);
  assert.match(appSource, /launcher-tab/);
  assert.match(appSource, /onWorkflowAction\(nextAction\)/);
  assert.match(styleSource, /\.desktop-media-route-shell/);
  assert.match(styleSource, /\.capability-groups-grid/);
  assert.match(styleSource, /\.launcher-tabs/);
});

test("desktop capabilities route keeps the shared library directory surface", () => {
  const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
  assert.doesNotMatch(appSource, /selected\.path === "\/dashboard\/capabilities" \? <DesktopMediaWorkspace/);
  assert.match(appSource, /const isCapabilities = route\.path === "\/dashboard\/capabilities"/);
  assert.match(appSource, /isCapabilities \? <div className="capability-directory-grid">/);
  assert.match(appSource, /const immersivePage = selected\.mode === "chat"/);
});

test("settings deep link renders one settings surface instead of a duplicate library page", () => {
  const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
  assert.match(appSource, /selected\.path === "\/dashboard\/settings" \? null : selected\.mode === "library"/);
});

test("media readiness follows Provider source instead of the default local id", () => {
  const source = readFileSync(resolve(process.cwd(), "src/provider-config.ts"), "utf8");
  const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
  assert.match(source, /source !== \"local\"/);
  assert.match(appSource, /isMediaProviderConfigured\(config\.provider\)/);
  assert.equal(isMediaProviderConfigured({ id: "local", source: "local", baseUrl: "http://127.0.0.1:11434/v1" }), false);
  assert.equal(isMediaProviderConfigured({ id: "local", source: "openai-compatible", baseUrl: "https://api.example.test/v1" }), true);
  assert.equal(isMediaProviderConfigured({ id: "openai-compatible", baseUrl: "https://api.example.test/v1" }), true);
});

test("desktop media workspace keeps cloud upload, voice-library, and task actions", () => {
  const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
  assert.match(appSource, /desktop-media-upload/);
  assert.match(appSource, /Upload local file/);
  assert.match(appSource, /Voice library/);
  assert.match(appSource, /Record reference/);
  assert.match(appSource, /MediaRecorder/);
  assert.match(appSource, /onAddAttachments/);
  assert.match(appSource, /localAttachmentPaths/);
  assert.match(appSource, /localAttachments: localAttachmentPaths/);
  assert.match(appSource, /onOpenTasks/);
});

test("desktop keeps cloud writer preview geometry and workflow locale labels", () => {
  const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
  const styleSource = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
  assert.match(styleSource, /\.writer-preview-overlay \{ position: fixed; inset: 0; z-index: 100; display: flex; justify-content: flex-end/);
  assert.match(styleSource, /\.writer-preview-sheet \{ width: min\(920px, 100%\); height: 100%/);
  assert.match(appSource, /const actionLabel = \(item: \{ id: string; label: string \}\)/);
  assert.match(appSource, /\{actionLabel\(item\)\}/);
  assert.match(appSource, /const nodeTitle = \(node: WorkflowDefinitionNodeV2\)/);
  assert.match(appSource, /workflowActionEnglish\[node\.type\]/);
});

test("desktop asset and task routes mirror the cloud library interaction contract", () => {
  const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
  const styleSource = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
  assert.match(appSource, /function DesktopAssetLibrarySurface/);
  assert.match(appSource, /function DesktopTaskCenterSurface/);
  assert.match(appSource, /asset-library-tabs/);
  assert.match(appSource, /view-toggle/);
  assert.match(appSource, /task-metric-grid/);
  assert.match(appSource, /task-center-toolbar/);
  assert.match(appSource, /task-center-table/);
  assert.match(styleSource, /\.asset-library-grid/);
  assert.match(styleSource, /\.task-center-table-head/);
  assert.match(styleSource, /\.task-status-succeeded/);
});

test("ordinary chat, writer and PPT routes stay on the OpenCode session path", () => {
  const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
  assert.match(appSource, /type: "session\.create"/);
  assert.match(appSource, /type: "session\.prompt"/);
  assert.match(appSource, /usesOpenCodeConversation/);
  assert.doesNotMatch(appSource, /ai-sdk-native/);
});

test("OpenCode serve errors terminate the shared synchronous turn barrier", () => {
  const serveSource = readFileSync(resolve(process.cwd(), "runtime/opencode-serve.ts"), "utf8");
  assert.match(serveSource, /active\.failed =/);
  assert.match(serveSource, /if \(active\.failed\) throw new Error\(active\.failed\)/);
  assert.match(serveSource, /normalizeOpenCodeServeEvent/);
  assert.match(serveSource, /normalized\.terminalError/);
  assert.match(serveSource, /openCodeServeSessionPath\(sessionId, workspacePath, "message"\)/);
  assert.doesNotMatch(serveSource, /prompt_async/);
});

test("local qualified models keep their OpenCode provider prefix", () => {
  const hostSource = readFileSync(resolve(process.cwd(), "runtime/host.ts"), "utf8");
  assert.match(hostSource, /providerId: providerKey\(slash > 0 \? configured\.slice\(0, slash\)/);
  assert.match(hostSource, /modelId: slash > 0 \? configured\.slice\(slash \+ 1\)/);
});

test("desktop supervises a crashed workflow host before marking the active run interrupted", () => {
  const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
  const supervisorSource = readFileSync(resolve(process.cwd(), "src-tauri/src/supervisor.rs"), "utf8");
  assert.match(appSource, /payload\.raw\.includes\("workflow_host_exit"\)/);
  assert.match(appSource, /tauriBridge\.invoke\("host_start"\)/);
  assert.match(appSource, /status: "interrupted"/);
  assert.match(supervisorSource, /JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE/);
  assert.match(supervisorSource, /SetInformationJobObject/);
});

test("media recovery persists the provider idempotency key and executor identity", () => {
  const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
  const hostSource = readFileSync(resolve(process.cwd(), "runtime/host.ts"), "utf8");
  assert.match(hostSource, /executorId, nodeKey, idempotencyKey/);
  assert.match(appSource, /payload\.idempotencyKey/);
  assert.match(appSource, /payload\.executorId/);
  assert.match(appSource, /resumeExecutorId/);
});
