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

test("local Skill-first E2E matrix covers every platform operation without legacy intent parsing", async () => {
  const scenarios = [
    { name: "clarification", fixtureScenario: "clarification" as const, expects: { outcome: "needs_clarification" as const, operation: "create" as const } },
    { name: "create", fixtureScenario: "create" as const, expects: { outcome: "draft_ready" as const, operation: "create" as const } },
    { name: "revise", fixtureScenario: "revise" as const, expects: { outcome: "draft_ready" as const, operation: "revise" as const } },
    { name: "translate", fixtureScenario: "translate" as const, expects: { outcome: "draft_ready" as const, operation: "translate" as const } },
    { name: "adapt_platform", fixtureScenario: "adapt_platform" as const, expects: { outcome: "draft_ready" as const, operation: "adapt_platform" as const } },
    { name: "research", fixtureScenario: "research" as const, expects: { outcome: "draft_ready" as const, operation: "revise" as const } },
  ]

  for (const platform of platforms) {
    const binding = resolveWriterPlatformBinding(platform)
    for (const scenario of scenarios) {
      const hasDraft = scenario.expects.outcome === "draft_ready" && scenario.name !== "create"
      const context = hasDraft
        ? buildWriterRuntimeContext({
            conversationId: `writer-platform-e2e-${platform}-${scenario.name}`,
            currentTurn: `${scenario.name} the active ${platform} draft`,
            platform,
            activeDraft: {
              revision: 3,
              title: "Writer Fixture Draft",
              content: "Existing platform-native draft content",
              sourceUrls: [],
            },
            recentTurns: [{ role: "user", content: "Continue the active draft" }],
            taskStatus: "ready",
          })
        : undefined

      const result = await runWriterSkillFirstTurn({
        query: `${scenario.name} a complete ${platform} article about practical AI workflows`,
        platform,
        mode: "article",
        preferredLanguage: "en",
        writerContext: context,
        fixtureScenario: scenario.fixtureScenario,
      })

      assert.equal(result.outcome, scenario.expects.outcome, `${platform}/${scenario.name}`)
      assert.equal(result.operation, scenario.expects.operation, `${platform}/${scenario.name}`)
      assert.equal(result.routing.renderPlatform, platform, `${platform}/${scenario.name}`)
      assert.equal(result.routing.selectedPlatformSkillId, binding.primary.skillId, `${platform}/${scenario.name}`)
      if (scenario.expects.outcome === "draft_ready") {
        assert.equal(result.readyForGeneration, true, `${platform}/${scenario.name}`)
        assert.equal(result.assetIntents?.some((intent) => intent.kind === "inline"), false, `${platform}/${scenario.name}`)
        if (scenario.name === "research") {
          assert.equal(result.diagnostics.webResearchUsed, true, `${platform}/${scenario.name}`)
          assert.equal(result.diagnostics.webSourceCount, 1, `${platform}/${scenario.name}`)
          assert.deepEqual(result.diagnostics.webSourceUrls, ["https://example.test/writer-research"], `${platform}/${scenario.name}`)
        }
      }
    }
  }
})
