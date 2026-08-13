import test from "node:test";
import assert from "node:assert/strict";
import { WORKBENCH_MEDIA_FEATURES } from "@aimarketing/workbench-ui";
import { desktopCopy, detectDesktopLocale, mediaPlaceholderEnglish, quickPromptsForDesktopRoute, resolveDesktopLocale } from "../src/i18n";

test("desktop locale follows Windows/WebView language by default", () => {
  assert.equal(detectDesktopLocale("zh-CN"), "zh");
  assert.equal(detectDesktopLocale("zh-TW"), "zh");
  assert.equal(detectDesktopLocale("ja-JP"), "en");
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
