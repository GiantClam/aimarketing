import assert from "node:assert/strict"
import test from "node:test"

import {
  extractLocaleFromPathname,
  getLocalizedPublicAlternates,
  isLocalizedPublicPath,
  localizePublicPath,
} from "@/lib/i18n/routing"

test("localized public path helpers add and strip locale prefixes for supported pages", () => {
  assert.deepEqual(extractLocaleFromPathname("/zh/use-cases/ai-workspace-for-marketing-teams"), {
    locale: "zh",
    pathname: "/use-cases/ai-workspace-for-marketing-teams",
  })
  assert.deepEqual(extractLocaleFromPathname("/en/pricing"), {
    locale: "en",
    pathname: "/pricing",
  })
  assert.equal(isLocalizedPublicPath("/use-cases/ai-workspace-for-marketing-teams"), true)
  assert.equal(isLocalizedPublicPath("/agents/seo-article-agent"), true)
  assert.equal(isLocalizedPublicPath("/alternatives/chatgpt-team-alternative"), true)
  assert.equal(isLocalizedPublicPath("/compare/best-ai-workspace-for-marketing-teams"), true)
  assert.equal(isLocalizedPublicPath("/prompts/seo-article-prompts"), true)
  assert.equal(isLocalizedPublicPath("/"), true)
  assert.equal(isLocalizedPublicPath("/pricing"), true)
  assert.equal(localizePublicPath("/", "zh"), "/zh")
  assert.equal(localizePublicPath("/agents/seo-article-agent", "zh"), "/zh/agents/seo-article-agent")
  assert.equal(localizePublicPath("/use-cases/ai-workspace-for-marketing-teams", "zh"), "/zh/use-cases/ai-workspace-for-marketing-teams")
  assert.equal(localizePublicPath("/pricing", "zh"), "/zh/pricing")
  assert.equal(localizePublicPath("/zh/pricing", "en"), "/en/pricing")
  assert.equal(localizePublicPath("/alternatives/chatgpt-team-alternative", "zh"), "/zh/alternatives/chatgpt-team-alternative")
  assert.equal(localizePublicPath("/prompts/seo-article-prompts", "zh"), "/zh/prompts/seo-article-prompts")
  assert.equal(localizePublicPath("/alternatives/claude-team-alternative", "zh"), "/alternatives/claude-team-alternative")
})

test("localized public alternates are exposed only for supported localized pages", () => {
  const alternates = getLocalizedPublicAlternates("/compare/compare-ai-tool-costs")
  assert.equal(alternates?.en.endsWith("/en/compare/compare-ai-tool-costs"), true)
  assert.equal(alternates?.zh.endsWith("/zh/compare/compare-ai-tool-costs"), true)
  assert.equal(alternates?.["x-default"]?.endsWith("/en/compare/compare-ai-tool-costs"), true)
  assert.equal(getLocalizedPublicAlternates("/agents/seo-article-agent")?.zh?.endsWith("/zh/agents/seo-article-agent"), true)
  assert.equal(getLocalizedPublicAlternates("/pricing")?.zh?.endsWith("/zh/pricing"), true)
  assert.equal(getLocalizedPublicAlternates("/alternatives/chatgpt-team-alternative")?.zh?.endsWith("/zh/alternatives/chatgpt-team-alternative"), true)
  assert.equal(getLocalizedPublicAlternates("/prompts/seo-article-prompts")?.zh?.endsWith("/zh/prompts/seo-article-prompts"), true)
})
