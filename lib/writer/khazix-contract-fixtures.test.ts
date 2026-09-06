import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

import { buildPendingWriterAssets } from "./assets"
import { resolveWriterPlatformBinding } from "./platform-registry"
import { validateWriterSubmitResult, type WriterSubmitResult } from "./writer-result"
import { reconcileWriterRevisionResult } from "@coworkany/writer-core"

const khazixSkill = readFileSync(path.join(process.cwd(), "content", "skills", "khazix-writer", "SKILL.md"), "utf8")
const authoredTitle = "作者提供的标题"
const originalArticle = [
  `# ${authoredTitle}`,
  "",
  "这段开头来自用户提供的真实素材。",
  "",
  "## 第二段",
  "",
  "这里保留原文事实，只允许在用户给出依据时补充数据。",
  "",
  "## 收束",
  "",
  "结尾保留完整文章上下文。",
].join("\n")

function khazixResult(overrides: Partial<WriterSubmitResult> = {}): WriterSubmitResult {
  return {
    schemaVersion: 1,
    outcome: "draft_ready",
    operation: "revise",
    platform: "wechat",
    userMessage: "已完成公众号文章修订。",
    draft: {
      title: authoredTitle,
      content: `${originalArticle}\n\n## 新增说明\n\n修订后的完整段落。`,
      baseRevision: 7,
    },
    research: { requested: false, completed: false, sourceUrls: [] },
    assetIntents: [
      { id: "cover", kind: "cover", prompt: "克制的编辑风格封面", placement: "after_title", aspectRatio: "16:9" },
      { id: "inline-1", kind: "inline", prompt: "支持第二段的事实图示", placement: "after_section_1", aspectRatio: "16:9" },
    ],
    ...overrides,
  }
}

test("Khazix revision fixture preserves the authored title and complete active article", () => {
  const activeDraft = { revision: 7, title: authoredTitle, content: originalArticle }
  const result = khazixResult()
  assert.doesNotThrow(() => validateWriterSubmitResult(result))
  assert.equal(result.draft?.title, authoredTitle)
  assert.match(result.draft?.content || "", /这段开头来自用户提供的真实素材/u)
  assert.match(result.draft?.content || "", /结尾保留完整文章上下文/u)
  assert.match(result.draft?.content || "", /修订后的完整段落/u)

  const reconciled = reconcileWriterRevisionResult({
    query: "修改正文第二段，保留完整文章",
    result,
    activeDraft,
  })
  assert.equal(reconciled.draft?.baseRevision, 7)
  assert.match(reconciled.draft?.content || "", /结尾保留完整文章上下文/u)
  assert.throws(() => reconcileWriterRevisionResult({
    query: "修改正文第二段",
    result: khazixResult({ draft: { ...result.draft!, content: "# 作者提供的标题\n\n..." } }),
    activeDraft,
  }), /writer_result_incomplete_revision/u)
})

test("Khazix title-only revisions replace only the title and retain the complete body", () => {
  const result = khazixResult({
    draft: { title: "新的编辑标题", content: "模型不应自行决定正文", baseRevision: 7 },
  })
  const reconciled = reconcileWriterRevisionResult({
    query: "只改标题为新的编辑标题，正文保持不变",
    result,
    activeDraft: { revision: 7, title: authoredTitle, content: originalArticle },
  })
  assert.equal(reconciled.draft?.title, "新的编辑标题")
  assert.equal(reconciled.draft?.baseRevision, 7)
  assert.match(reconciled.draft?.content || "", /# 新的编辑标题/u)
  assert.match(reconciled.draft?.content || "", /结尾保留完整文章上下文/u)
})

test("Khazix image intents become application-owned cover and inline records", () => {
  const result = khazixResult()
  const pending = buildPendingWriterAssets(result.draft?.content || "", "wechat", "article", result.assetIntents)
  assert.deepEqual(pending.map((asset) => ({ id: asset.id, role: asset.role, url: asset.url })), [
    { id: "cover", role: "cover", url: "" },
    { id: "inline-1", role: "inline", url: "" },
  ])
  assert.equal(pending.every((asset) => asset.status === "loading" && asset.provider === "loading"), true)
})

test("Khazix workflow activation is the sole WeChat primary and preserves source-boundary rules", () => {
  const binding = resolveWriterPlatformBinding("wechat")
  assert.equal(binding.primary.skillId, "khazix-writer")
  assert.equal(binding.primary.dirName, "khazix-writer")
  assert.doesNotMatch(binding.compatibleStyleSkillIds.join("\n"), /writer-wechat/u)
  assert.match(khazixSkill, /四层自检体系/u)
  assert.match(khazixSkill, /不要伪造图片 URL、数据、案例或个人经历/u)
  assert.match(khazixSkill, /不能返回摘要、`\.\.\.`、正文后续保持不变/u)
})
