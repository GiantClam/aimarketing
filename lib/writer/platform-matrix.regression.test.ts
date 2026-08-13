import assert from "node:assert/strict"
import test from "node:test"

import { WRITER_PLATFORM_ORDER, type WriterPlatform } from "./config"
import { resolveWriterPlatformBinding } from "./platform-registry"
import { runWriterSkillFirstTurn } from "./skills"
import { buildWriterRuntimeContext } from "./runtime/session-runtime"

const platforms = WRITER_PLATFORM_ORDER.filter((platform): platform is Exclude<WriterPlatform, "generic"> => platform !== "generic")

test.before(() => {
  process.env.WRITER_E2E_FIXTURES = "true"
})

test.after(() => {
  delete process.env.WRITER_E2E_FIXTURES
})

for (const platform of platforms) {
  test(`fixture matrix keeps ${platform} on one primary Skill for clarification and revision`, async () => {
    const binding = resolveWriterPlatformBinding(platform)
    const firstTurn = await runWriterSkillFirstTurn({
      query: `Create a complete ${platform} article about practical AI workflows`,
      platform,
      mode: "article",
      preferredLanguage: "en",
    })

    assert.equal(firstTurn.outcome, "needs_clarification")
    assert.equal(firstTurn.routing.renderPlatform, platform)
    assert.equal(firstTurn.routing.selectedPlatformSkillId, binding.primary.skillId)

    const context = buildWriterRuntimeContext({
      conversationId: `writer-platform-matrix-${platform}`,
      currentTurn: `Create a complete ${platform} article about practical AI workflows`,
      platform,
      activeDraft: {
        revision: 1,
        title: "Writer Fixture Draft",
        content: "Existing draft content",
        sourceUrls: [],
      },
      recentTurns: [{ role: "user", content: "Please revise the active draft" }],
      taskStatus: "ready",
    })
    const revision = await runWriterSkillFirstTurn({
      query: "Revise the active draft into a complete article",
      platform,
      mode: "article",
      preferredLanguage: "en",
      writerContext: context,
    })

    assert.equal(revision.outcome, "draft_ready")
    assert.equal(revision.readyForGeneration, true)
    assert.equal(revision.routing.renderPlatform, platform)
    assert.equal(revision.routing.selectedPlatformSkillId, binding.primary.skillId)
    assert.ok((revision.assetIntents ?? []).every((intent) => intent.kind === "cover" ? binding.assets.cover : binding.assets.inline))
  })
}
