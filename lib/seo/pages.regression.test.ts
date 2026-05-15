import assert from "node:assert/strict"
import test from "node:test"

import { getSeoPage, seoPages, seoPathForPage } from "@/lib/seo/pages"

test("every SEO page exposes page-specific highlights and related links", () => {
  for (const page of seoPages) {
    assert.ok(page.highlights.length >= 3, `${page.slug} should have at least three highlights`)
    assert.ok(page.relatedLinks.length >= 2, `${page.slug} should have related links`)
    assert.equal(
      page.relatedLinks.some((link) => link.href === seoPathForPage(page)),
      false,
      `${page.slug} should not link to itself in related links`,
    )
  }
})

test("video script prompts page includes title-specific prompt guidance", () => {
  const page = getSeoPage("prompts", "video-script-prompts")
  assert.ok(page)

  assert.match(page.intro, /Video Script Prompts/i)
  assert.equal(page.sections[0]?.heading, "What good video script prompts need")
  assert.equal(page.sections[5]?.heading, "Common failure modes in video script prompts")
  assert.equal(page.sections[6]?.heading, "Starter brief example for video script prompts")
  assert.equal(page.sections[7]?.heading, "A quick way to adapt one script prompt across channels")
  assert.equal(page.relatedLinks.some((link) => link.href === "/agents/video-script-agent"), true)
  assert.equal(page.highlights.some((item) => /hooks, scenes/i.test(item)), true)
  assert.equal(page.faqs.some((faq) => /another channel/i.test(faq.question)), true)
})

test("jasper alternative page includes vendor-specific copy instead of shared boilerplate", () => {
  const page = getSeoPage("alternatives", "jasper-alternative")
  assert.ok(page)

  assert.equal(page.sections[0]?.heading, 'Why "Jasper alternative" searches happen')
  assert.equal(page.sections[5]?.heading, "Migration checklist before leaving Jasper")
  assert.equal(page.sections[6]?.heading, "A realistic pilot before replacing Jasper")
  assert.equal(page.sections[7]?.heading, "What a Jasper-heavy workflow usually leaves outside the writing tool")
  assert.match(page.comparison?.rows[0]?.first || "", /Jasper/i)
  assert.equal(page.highlights[0]?.includes("Jasper"), true)
  assert.equal(page.relatedLinks.some((link) => link.href === "/compare/best-ai-workspace-for-small-teams"), true)
  assert.equal(page.faqs.some((faq) => /writing quality/i.test(faq.question)), true)
})

test("comparison page includes model-specific sections and workspace follow-up", () => {
  const page = getSeoPage("compare", "chatgpt-vs-gemini-vs-claude-for-business")
  assert.ok(page)

  assert.equal(page.sections[1]?.heading, "Where ChatGPT and Gemini can win")
  assert.equal(page.sections[2]?.heading, "Where Claude can win")
  assert.equal(page.sections[3]?.heading, "When the better answer is a shared workspace")
  assert.equal(page.sections[4]?.heading, "Decision checklist for ChatGPT vs Gemini vs Claude for Business")
  assert.equal(page.sections[5]?.heading, "How to run a fair chatgpt vs gemini vs claude for business test")
  assert.equal(page.sections[6]?.heading, "What business buyers often miss in a three-way model comparison")
  assert.equal(page.highlights.some((item) => /ChatGPT and Gemini/i.test(item)), true)
  assert.equal(page.faqs.some((faq) => /operational flexibility/i.test(faq.answer)), true)
})

test("targeted pages expose page-level custom sections beyond shared templates", () => {
  const promptsPage = getSeoPage("prompts", "marketing-strategy-prompts")
  const useCasePage = getSeoPage("use-cases", "chatgpt-claude-gemini-in-one-workspace")
  const agentPage = getSeoPage("agents", "seo-article-agent")

  assert.ok(promptsPage)
  assert.ok(useCasePage)
  assert.ok(agentPage)

  assert.equal(promptsPage.sections.some((section) => section.heading === "When strategy prompts are better than jumping into copy"), true)
  assert.equal(useCasePage.sections.some((section) => section.heading === "What changes when three models share one marketing workflow"), true)
  assert.equal(agentPage.sections.some((section) => section.heading === "What separates an SEO draft from a publishable article"), true)
})
