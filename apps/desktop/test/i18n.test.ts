import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WORKBENCH_HOME_GROUPS, WORKBENCH_MEDIA_FEATURES, WORKBENCH_ROUTE_MANIFEST } from "@aimarketing/workbench-ui";
import { desktopCopy, desktopWriterCopy, detectDesktopLocale, homeGroupLabels, mediaEnglish, mediaFieldEnglish, mediaOptionEnglish, mediaPlaceholderEnglish, mediaSubmitEnglish, mediaSummaryEnglish, quickPromptsForDesktopRoute, resolveDesktopLocale } from "../src/i18n";
import { buildWorkflowDefinition, localizeRuntimeStatus, parseImageInputs } from "../src/App";

test("desktop locale follows Windows/WebView language by default", () => {
  assert.equal(detectDesktopLocale("zh-CN"), "zh");
  assert.equal(detectDesktopLocale("zh-TW"), "zh");
  assert.equal(detectDesktopLocale("ja-JP"), "en");
  assert.equal(detectDesktopLocale("fr-FR"), "en");
  assert.equal(detectDesktopLocale("pt-BR"), "en");
  assert.equal(detectDesktopLocale(""), "en");
  assert.equal(resolveDesktopLocale("auto", "de-DE"), "en");
});

test("desktop locale preference overrides system language", () => {
  assert.equal(resolveDesktopLocale("zh", "en-US"), "zh");
  assert.equal(resolveDesktopLocale("en", "zh-CN"), "en");
});

test("English desktop media fields do not leak untranslated Chinese placeholders", () => {
  const placeholders = WORKBENCH_MEDIA_FEATURES.flatMap((feature) => feature.fields.map((field) => field.placeholder).filter((value): value is string => Boolean(value && /[\u4e00-\u9fff]/u.test(value))));
  assert.ok(placeholders.length > 0);
  for (const placeholder of placeholders) {
    const translated = mediaPlaceholderEnglish[placeholder];
    assert.ok(translated, `missing English placeholder translation: ${placeholder}`);
    assert.doesNotMatch(translated, /[\u4e00-\u9fff]/u);
  }
});

test("English desktop media catalog translates every shared Chinese presentation field", () => {
  const containsChinese = (value: string | undefined) => Boolean(value && /[\u4e00-\u9fff]/u.test(value));
  for (const feature of WORKBENCH_MEDIA_FEATURES) {
    if (containsChinese(feature.title)) assert.ok(mediaEnglish[feature.id], `missing English media title: ${feature.id}`);
    if (containsChinese(feature.summary)) assert.ok(mediaSummaryEnglish[feature.id], `missing English media summary: ${feature.id}`);
    if (containsChinese(feature.submitLabel)) assert.ok(mediaSubmitEnglish[feature.id], `missing English media submit label: ${feature.id}`);
    for (const field of feature.fields) {
      if (containsChinese(field.label)) assert.ok(mediaFieldEnglish[field.label], `missing English media field: ${feature.id}/${field.label}`);
      if (containsChinese(field.placeholder)) assert.ok(mediaPlaceholderEnglish[field.placeholder!], `missing English media placeholder: ${feature.id}/${field.id}`);
      for (const option of field.options ?? []) {
        if (containsChinese(option.label)) assert.ok(mediaOptionEnglish[option.label], `missing English media option: ${feature.id}/${field.id}/${option.label}`);
      }
    }
  }
});

test("retained Agent routes use the same quick prompts as the cloud catalog", () => {
  assert.equal(quickPromptsForDesktopRoute("/dashboard/ai?agent=executive-brand", "zh")[0], "基于这段业务介绍，重写品牌定位、价值主张和一句话口号。");
  assert.equal(quickPromptsForDesktopRoute("/dashboard/ai?agent=executive-ppt", "en")[0], "Turn this brief into an editable PPT outline, page copy, and design requirements.");
  assert.deepEqual(quickPromptsForDesktopRoute("/dashboard/ai", "en"), [
    "Break this down and give me conclusions, steps, and deliverables directly.",
    "Turn the context below into a structured plan with execution-ready actions.",
    "Based on this background, draft a clear professional response I can use right away.",
  ]);
});

test("account-free home copy keeps the cloud fallback greeting", () => {
  assert.equal(desktopCopy.zh.welcome, "欢迎回来，伙伴");
  assert.equal(desktopCopy.en.welcome, "Welcome back, there");
});

test("desktop home group headings have explicit Chinese and English labels", () => {
  for (const group of WORKBENCH_HOME_GROUPS) {
    assert.ok(homeGroupLabels[group.label], `missing home group mapping: ${group.label}`);
  }
  for (const [key, labels] of Object.entries(homeGroupLabels)) {
    assert.ok(labels.zh, `missing Chinese home group label: ${key}`);
    assert.ok(labels.en, `missing English home group label: ${key}`);
    assert.doesNotMatch(labels.en, /[\u4e00-\u9fff]/u);
  }
  assert.equal(homeGroupLabels["AI TEAM"].zh, "AI 团队");
  assert.equal(homeGroupLabels["CONTENT CREATION"].zh, "内容创作");
});

test("every shared route has an English presentation without Chinese fallback text", () => {
  const containsChinese = (value: string | undefined) => Boolean(value && /[\u4e00-\u9fff]/u.test(value));
  for (const route of WORKBENCH_ROUTE_MANIFEST) {
    assert.ok(route.label.en, `missing English route label: ${route.path}`);
    assert.ok(route.description.en, `missing English route description: ${route.path}`);
    assert.equal(containsChinese(route.label.en), false, `Chinese route label leaked: ${route.path}`);
    assert.equal(containsChinese(route.description.en), false, `Chinese route description leaked: ${route.path}`);
    if (route.section?.en) assert.equal(containsChinese(route.section.en), false, `Chinese route section leaked: ${route.path}`);
  }
});

test("runtime repair failures are fully localized in the English shell", () => {
  assert.equal(localizeRuntimeStatus("运行环境修复失败：runtime_install_incomplete", "en"), "Runtime repair failed: runtime_install_incomplete");
  assert.equal(localizeRuntimeStatus("运行环境修复失败：runtime_install_incomplete", "zh"), "运行环境修复失败：runtime_install_incomplete");
});

test("active Writer workspace has a complete bilingual copy contract", () => {
  const keys = Object.keys(desktopWriterCopy.zh) as Array<keyof typeof desktopWriterCopy.zh>;
  assert.deepEqual(Object.keys(desktopWriterCopy.en).sort(), keys.sort());
  for (const key of keys) {
    assert.ok(desktopWriterCopy.zh[key]);
    assert.ok(desktopWriterCopy.en[key]);
    assert.doesNotMatch(desktopWriterCopy.en[key], /[\u4e00-\u9fff]/u);
  }
});

test("active Writer preview uses the bilingual copy contract", () => {
  const source = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
  const start = source.indexOf("function DesktopWriterCloudWorkspace(");
  const end = source.indexOf("type DesktopWorkflowWorkspaceProps", start);
  assert.ok(start >= 0 && end > start, "active Writer workspace source must be present");
  const activeWriter = source.slice(start, end);
  assert.match(activeWriter, /label=\{writerCopy\.assistant\}/u);
  assert.match(activeWriter, /writerCopy\.edit/u);
  assert.doesNotMatch(activeWriter, /label="AI RESPONSE"/u);
});

test("unreachable legacy Writer fallbacks cannot reintroduce untranslated UI", () => {
  const source = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
  assert.doesNotMatch(source, /function DesktopWriterWorkspace\(/u);
  assert.doesNotMatch(source, /function DesktopWriterCloudWorkspaceLegacy\(/u);
});

test("active conversation responses localize the assistant label", () => {
  const source = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
  const start = source.indexOf("function DesktopConversationWorkspace(");
  const end = source.indexOf("type DesktopWriterCloudWorkspaceProps", start);
  assert.ok(start >= 0 && end > start, "active conversation workspace source must be present");
  const activeConversation = source.slice(start, end);
  assert.match(activeConversation, /locale === "zh" \? "AI 回复" : "AI RESPONSE"/u);
});

test("active media workspace keeps voice controls bilingual", () => {
  const source = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
  const start = source.indexOf("function DesktopMediaWorkspaceBody(");
  const end = source.indexOf("type DesktopMediaWorkspaceProps", start);
  assert.ok(start >= 0 && end > start, "active media workspace source must be present");
  const activeMedia = source.slice(start, end);
  assert.match(activeMedia, /eyebrow: "CONTENT CREATION"/u);
  assert.match(activeMedia, /eyebrow: "内容创作"/u);
  assert.match(activeMedia, /defaultChineseVoice: "默认中文音色"/u);
  assert.match(activeMedia, /defaultEnglishVoice: "默认英文音色"/u);
  assert.doesNotMatch(activeMedia, />Default Chinese voice<\/button>/u);
  assert.doesNotMatch(activeMedia, />Default English voice<\/button>/u);
});

test("image prompt metadata follows the active media locale", () => {
  const source = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");
  const start = source.indexOf("function DesktopMediaWorkspaceBody(");
  const end = source.indexOf("type DesktopMediaWorkspaceProps", start);
  assert.ok(start >= 0 && end > start, "active media workspace source must be present");
  const activeMedia = source.slice(start, end);
  assert.match(activeMedia, /\$\{mediaUi\.references\}: \$\{imageSettings\.referenceImages\}/u);
  assert.match(activeMedia, /\$\{mediaUi\.quality\}: \$\{imageSettings\.quality\}/u);
  assert.doesNotMatch(activeMedia, /参考素材：\$\{imageSettings\.referenceImages\}/u);
  assert.doesNotMatch(activeMedia, /图片质量：\$\{imageSettings\.quality\}/u);
});

test("image prompt metadata parses both localized label forms", () => {
  assert.deepEqual(parseImageInputs("subject\nQuality: hd\nSize: 256x256\nCount: 1\nReference assets: local.png"), {
    quality: "hd",
    size: "256x256",
    n: 1,
    referenceImages: "local.png",
  });
  assert.deepEqual(parseImageInputs("主体\n图片质量：standard\n图片尺寸：1024x1024\n生成数量：4\n参考素材：本地产物.png"), {
    quality: "standard",
    size: "1024x1024",
    n: 4,
    referenceImages: "本地产物.png",
  });
});

test("new workflow definitions use the active locale for persisted node titles", () => {
  const provider = { id: "local", model: "demo", baseUrl: "http://127.0.0.1:11434" };
  const english = buildWorkflowDefinition("draft", "writer", provider, {}, "en");
  const chinese = buildWorkflowDefinition("撰写", "writer", provider, {}, "zh");
  assert.deepEqual(english.nodes.map((node) => node.title), ["Input task", "Content writing", "Local artifact"]);
  assert.deepEqual(chinese.nodes.map((node) => node.title), ["输入任务", "内容写作", "本地产物"]);
});
