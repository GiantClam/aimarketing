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
  assert.equal(isLocalizedPublicPath("/agents/brand-strategy-agent"), true)
  assert.equal(isLocalizedPublicPath("/alternatives/chatgpt-team-alternative"), true)
  assert.equal(isLocalizedPublicPath("/compare/best-ai-workspace-for-marketing-teams"), true)
  assert.equal(isLocalizedPublicPath("/prompts/seo-article-prompts"), true)
  assert.equal(isLocalizedPublicPath("/"), true)
  assert.equal(isLocalizedPublicPath("/agents"), true)
  assert.equal(isLocalizedPublicPath("/capabilities"), true)
  assert.equal(isLocalizedPublicPath("/capabilities/ai-image"), true)
  assert.equal(isLocalizedPublicPath("/plugins"), true)
  assert.equal(isLocalizedPublicPath("/plugins/runninghub-media"), true)
  assert.equal(isLocalizedPublicPath("/mcp-services"), true)
  assert.equal(isLocalizedPublicPath("/mcp-services/design-context-mcp"), true)
  assert.equal(isLocalizedPublicPath("/pricing"), true)
  assert.equal(isLocalizedPublicPath("/resources"), true)
  assert.equal(isLocalizedPublicPath("/resources/what-is-a-content-brief"), true)
  assert.equal(isLocalizedPublicPath("/tools"), true)
  assert.equal(isLocalizedPublicPath("/tools/ai-ppt-preview"), true)
  assert.equal(isLocalizedPublicPath("/tools/ai-ppt-preview/examples/product-launch-deck"), true)
  assert.equal(isLocalizedPublicPath("/workflows"), true)
  assert.equal(isLocalizedPublicPath("/workflows/visual-ad-pipeline"), true)
  assert.equal(localizePublicPath("/", "zh"), "/zh")
  assert.equal(localizePublicPath("/agents", "zh"), "/zh/agents")
  assert.equal(localizePublicPath("/capabilities", "zh"), "/zh/capabilities")
  assert.equal(localizePublicPath("/capabilities/ai-image", "zh"), "/zh/capabilities/ai-image")
  assert.equal(localizePublicPath("/plugins", "zh"), "/zh/plugins")
  assert.equal(localizePublicPath("/plugins/runninghub-media", "zh"), "/zh/plugins/runninghub-media")
  assert.equal(localizePublicPath("/mcp-services", "zh"), "/zh/mcp-services")
  assert.equal(localizePublicPath("/mcp-services/design-context-mcp", "zh"), "/zh/mcp-services/design-context-mcp")
  assert.equal(localizePublicPath("/agents/seo-article-agent", "zh"), "/zh/agents/seo-article-agent")
  assert.equal(localizePublicPath("/use-cases/ai-workspace-for-marketing-teams", "zh"), "/zh/use-cases/ai-workspace-for-marketing-teams")
  assert.equal(localizePublicPath("/pricing", "zh"), "/zh/pricing")
  assert.equal(localizePublicPath("/resources", "zh"), "/zh/resources")
  assert.equal(localizePublicPath("/resources/what-is-a-content-brief", "zh"), "/zh/resources/what-is-a-content-brief")
  assert.equal(localizePublicPath("/tools", "zh"), "/zh/tools")
  assert.equal(localizePublicPath("/tools/ai-ppt-preview", "zh"), "/zh/tools/ai-ppt-preview")
  assert.equal(localizePublicPath("/tools/ai-ppt-preview/examples/product-launch-deck", "zh"), "/zh/tools/ai-ppt-preview/examples/product-launch-deck")
  assert.equal(localizePublicPath("/workflows", "zh"), "/zh/workflows")
  assert.equal(localizePublicPath("/workflows/visual-ad-pipeline", "zh"), "/zh/workflows/visual-ad-pipeline")
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
  assert.equal(getLocalizedPublicAlternates("/agents/brand-strategy-agent")?.zh?.endsWith("/zh/agents/brand-strategy-agent"), true)
  assert.equal(getLocalizedPublicAlternates("/capabilities")?.zh?.endsWith("/zh/capabilities"), true)
  assert.equal(getLocalizedPublicAlternates("/capabilities/ai-image")?.zh?.endsWith("/zh/capabilities/ai-image"), true)
  assert.equal(getLocalizedPublicAlternates("/plugins")?.zh?.endsWith("/zh/plugins"), true)
  assert.equal(getLocalizedPublicAlternates("/plugins/runninghub-media")?.zh?.endsWith("/zh/plugins/runninghub-media"), true)
  assert.equal(getLocalizedPublicAlternates("/mcp-services")?.zh?.endsWith("/zh/mcp-services"), true)
  assert.equal(getLocalizedPublicAlternates("/mcp-services/design-context-mcp")?.zh?.endsWith("/zh/mcp-services/design-context-mcp"), true)
  assert.equal(getLocalizedPublicAlternates("/pricing")?.zh?.endsWith("/zh/pricing"), true)
  assert.equal(getLocalizedPublicAlternates("/resources")?.zh?.endsWith("/zh/resources"), true)
  assert.equal(
    getLocalizedPublicAlternates("/resources/what-is-a-content-brief")?.zh?.endsWith("/zh/resources/what-is-a-content-brief"),
    true,
  )
  assert.equal(getLocalizedPublicAlternates("/tools")?.zh?.endsWith("/zh/tools"), true)
  assert.equal(getLocalizedPublicAlternates("/tools/ai-ppt-preview")?.zh?.endsWith("/zh/tools/ai-ppt-preview"), true)
  assert.equal(
    getLocalizedPublicAlternates("/tools/ai-ppt-preview/examples/product-launch-deck")?.zh?.endsWith(
      "/zh/tools/ai-ppt-preview/examples/product-launch-deck",
    ),
    true,
  )
  assert.equal(getLocalizedPublicAlternates("/workflows")?.zh?.endsWith("/zh/workflows"), true)
  assert.equal(getLocalizedPublicAlternates("/workflows/visual-ad-pipeline")?.zh?.endsWith("/zh/workflows/visual-ad-pipeline"), true)
  assert.equal(getLocalizedPublicAlternates("/alternatives/chatgpt-team-alternative")?.zh?.endsWith("/zh/alternatives/chatgpt-team-alternative"), true)
  assert.equal(getLocalizedPublicAlternates("/prompts/seo-article-prompts")?.zh?.endsWith("/zh/prompts/seo-article-prompts"), true)
})
