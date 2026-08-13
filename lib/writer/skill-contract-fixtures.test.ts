import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

import { WRITER_PLATFORM_ORDER, type WriterPlatform } from "./config"
import { resolveWriterPlatformBinding } from "./platform-registry"
import { validateWriterSubmitResult, type WriterSubmitResult } from "./writer-result"

const canonicalSkillRoot = path.join(process.cwd(), "content", "skills")
const platforms = WRITER_PLATFORM_ORDER.filter((platform): platform is Exclude<WriterPlatform, "generic"> => platform !== "generic")

function readPlatformSkill(platform: WriterPlatform) {
  const binding = resolveWriterPlatformBinding(platform)
  return readFileSync(path.join(canonicalSkillRoot, binding.primary.dirName, "SKILL.md"), "utf8")
}

function fixtureResult(platform: Exclude<WriterPlatform, "generic">, overrides: Partial<WriterSubmitResult> = {}): WriterSubmitResult {
  const binding = resolveWriterPlatformBinding(platform)
  const title = `${platform} fixture title`
  const assetIntents = binding.assets.cover
    ? [{ id: "cover", kind: "cover" as const, prompt: `${platform} editorial cover`, placement: "after_title", aspectRatio: binding.assets.aspectRatios[0] || "1:1" }]
    : []
  return {
    schemaVersion: 1,
    outcome: "draft_ready",
    operation: "create",
    platform,
    userMessage: `${platform} fixture complete`,
    draft: { title, content: `# ${title}\n\nComplete platform-native ${platform} fixture content.`, baseRevision: 0 },
    research: { requested: false, completed: false, sourceUrls: [] },
    assetIntents,
    ...overrides,
  }
}

function validateFixture(platform: Exclude<WriterPlatform, "generic">, result: WriterSubmitResult, activeRevision: number, activeTitle = "") {
  const binding = resolveWriterPlatformBinding(platform)
  assert.equal(result.platform, platform)
  assert.equal(binding.operations.includes(result.operation), true)
  assert.equal(binding.modes.includes("article"), true)
  assert.ok(result.assetIntents.length <= binding.assets.maxCount)
  assert.equal(result.assetIntents.some((intent) => intent.kind === "cover"), binding.assets.cover && result.outcome === "draft_ready")
  assert.equal(result.assetIntents.some((intent) => intent.kind === "inline"), false)
  if (result.outcome === "draft_ready") {
    assert.ok(result.draft)
    assert.equal(result.draft.baseRevision, activeRevision)
    if (activeTitle) assert.equal(result.draft.title, activeTitle)
  } else {
    assert.equal(result.draft, null)
  }
  return binding
}

test("all canonical platform Skills describe the governed Writer result contract", () => {
  for (const platform of platforms) {
    const document = readPlatformSkill(platform)
    assert.match(document, /# Writer (?:result|runtime) contract/i, platform)
    assert.match(document, /writer_submit_result[\s\S]*(?:exactly once|一次)/i, platform)
    assert.match(document, /schemaVersion:\s*1/i, platform)
    assert.match(document, /draft_ready[\s\S]*needs_clarification|needs_clarification[\s\S]*draft_ready/i, platform)
    assert.match(document, /draft[\s\S]*(?:title|content)/i, platform)
    assert.match(document, /(?:title|content)[\s\S]*baseRevision/i, platform)
    assert.match(document, /research[\s\S]*requested[\s\S]*completed[\s\S]*sourceUrls/i, platform)
    assert.match(document, /(?:assetIntents|图片意图)[\s\S]*id[\s\S]*kind[\s\S]*prompt[\s\S]*placement[\s\S]*aspectRatio/i, platform)
    assert.match(document, /(?:complete|完整)[\s\S]*(?:revision|thread|post|script|caption|content|修订|正文|文章|内容)/i, platform)
  }
})

test("every platform fixture validates create, clarification, and full revision through the shared runtime contract", () => {
  for (const platform of platforms) {
    const draft = fixtureResult(platform)
    assert.doesNotThrow(() => validateWriterSubmitResult(draft), platform)
    assert.equal(validateFixture(platform, draft, 0).platformId, platform)

    const clarification = fixtureResult(platform, {
      outcome: "needs_clarification",
      userMessage: `${platform} fixture clarification`,
      draft: null,
      assetIntents: [],
    })
    assert.doesNotThrow(() => validateWriterSubmitResult(clarification), platform)
    assert.equal(validateFixture(platform, clarification, 0).platformId, platform)

    const revision = fixtureResult(platform, {
      operation: "revise",
      userMessage: `${platform} fixture revision`,
      draft: { ...draft.draft!, content: `${draft.draft!.content}\n\nComplete revision body.`, baseRevision: 2 },
    })
    assert.doesNotThrow(() => validateWriterSubmitResult(revision), platform)
    assert.equal(validateFixture(platform, revision, 2, draft.draft!.title).platformId, platform)

    for (const operation of ["translate", "adapt_platform"] as const) {
      const adapted = fixtureResult(platform, {
        operation,
        userMessage: `${platform} fixture ${operation}`,
      })
      assert.doesNotThrow(() => validateWriterSubmitResult(adapted), platform)
      assert.equal(validateFixture(platform, adapted, 0).platformId, platform)
    }

    const researched = fixtureResult(platform, {
      research: { requested: true, completed: true, sourceUrls: ["https://example.test/writer-source"] },
    })
    assert.doesNotThrow(() => validateWriterSubmitResult(researched), platform)
    assert.equal(validateFixture(platform, researched, 0).platformId, platform)

    const researchUnavailable = fixtureResult(platform, {
      research: { requested: true, completed: false, sourceUrls: [] },
    })
    assert.doesNotThrow(() => validateWriterSubmitResult(researchUnavailable), platform)
    assert.equal(validateFixture(platform, researchUnavailable, 0).platformId, platform)
  }
})
