import assert from "node:assert/strict"
import test from "node:test"

import robots from "@/app/robots"
import sitemap from "@/app/sitemap"
import { buildAppUrl, getAppBaseUrl } from "@/lib/app-url"
import { getLeadToolExampleMetadata, getLeadToolMetadata, getToolsHubMetadata } from "@/lib/lead-tools/public-metadata"
import { metadataForSeoPage } from "@/lib/seo/metadata"
import { getSeoPage } from "@/lib/seo/pages"

function withAppUrlEnv(
  env: {
    APP_URL?: string
    NEXT_PUBLIC_APP_URL?: string
  },
  callback: () => void,
) {
  const originalEnv = {
    APP_URL: process.env.APP_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  }

  if (env.APP_URL === undefined) {
    delete process.env.APP_URL
  } else {
    process.env.APP_URL = env.APP_URL
  }

  if (env.NEXT_PUBLIC_APP_URL === undefined) {
    delete process.env.NEXT_PUBLIC_APP_URL
  } else {
    process.env.NEXT_PUBLIC_APP_URL = env.NEXT_PUBLIC_APP_URL
  }

  try {
    callback()
  } finally {
    if (originalEnv.APP_URL === undefined) {
      delete process.env.APP_URL
    } else {
      process.env.APP_URL = originalEnv.APP_URL
    }

    if (originalEnv.NEXT_PUBLIC_APP_URL === undefined) {
      delete process.env.NEXT_PUBLIC_APP_URL
    } else {
      process.env.NEXT_PUBLIC_APP_URL = originalEnv.NEXT_PUBLIC_APP_URL
    }
  }
}

test("public site URLs normalize the production host to www", () => {
  withAppUrlEnv(
    {
      APP_URL: "https://aimarketingsite.com",
      NEXT_PUBLIC_APP_URL: "https://aimarketingsite.com",
    },
    () => {
      assert.equal(getAppBaseUrl(), "https://www.aimarketingsite.com")
      assert.equal(buildAppUrl("/pricing"), "https://www.aimarketingsite.com/pricing")
    },
  )
})

test("seo metadata uses the normalized canonical host and preserves the intended page title", () => {
  const page = getSeoPage("prompts", "video-script-prompts")
  assert.ok(page)

  withAppUrlEnv(
    {
      APP_URL: "https://aimarketingsite.com",
    },
    () => {
      const metadata = metadataForSeoPage(page, "en")

      assert.deepEqual(metadata.title, {
        absolute: "Video Script Prompts | AI Marketing",
      })
      assert.equal(metadata.alternates?.canonical, "https://www.aimarketingsite.com/en/prompts/video-script-prompts")
      assert.equal(metadata.openGraph?.url, "https://www.aimarketingsite.com/en/prompts/video-script-prompts")
    },
  )
})

test("localized SEO pages emit locale-prefixed canonical and language alternates", () => {
  const page = getSeoPage("compare", "compare-ai-tool-costs")
  assert.ok(page)

  withAppUrlEnv(
    {
      APP_URL: "https://aimarketingsite.com",
    },
    () => {
      const metadata = metadataForSeoPage(page, "zh")

      assert.equal(metadata.alternates?.canonical, "https://www.aimarketingsite.com/zh/compare/compare-ai-tool-costs")
      assert.equal(metadata.alternates?.languages?.en, "https://www.aimarketingsite.com/en/compare/compare-ai-tool-costs")
      assert.equal(metadata.alternates?.languages?.zh, "https://www.aimarketingsite.com/zh/compare/compare-ai-tool-costs")
      assert.equal(metadata.alternates?.languages?.["x-default"], "https://www.aimarketingsite.com/en/compare/compare-ai-tool-costs")
    },
  )
})

test("localized alternative pages emit locale-prefixed canonical and language alternates", () => {
  const page = getSeoPage("alternatives", "chatgpt-team-alternative")
  assert.ok(page)

  withAppUrlEnv(
    {
      APP_URL: "https://aimarketingsite.com",
    },
    () => {
      const metadata = metadataForSeoPage(page, "zh")

      assert.equal(metadata.alternates?.canonical, "https://www.aimarketingsite.com/zh/alternatives/chatgpt-team-alternative")
      assert.equal(metadata.alternates?.languages?.en, "https://www.aimarketingsite.com/en/alternatives/chatgpt-team-alternative")
      assert.equal(metadata.alternates?.languages?.zh, "https://www.aimarketingsite.com/zh/alternatives/chatgpt-team-alternative")
      assert.equal(metadata.alternates?.languages?.["x-default"], "https://www.aimarketingsite.com/en/alternatives/chatgpt-team-alternative")
    },
  )
})

test("localized agent pages emit locale-prefixed canonical and language alternates", () => {
  const page = getSeoPage("agents", "seo-article-agent")
  assert.ok(page)

  withAppUrlEnv(
    {
      APP_URL: "https://aimarketingsite.com",
    },
    () => {
      const metadata = metadataForSeoPage(page, "zh")

      assert.equal(metadata.alternates?.canonical, "https://www.aimarketingsite.com/zh/agents/seo-article-agent")
      assert.equal(metadata.alternates?.languages?.en, "https://www.aimarketingsite.com/en/agents/seo-article-agent")
      assert.equal(metadata.alternates?.languages?.zh, "https://www.aimarketingsite.com/zh/agents/seo-article-agent")
      assert.equal(metadata.alternates?.languages?.["x-default"], "https://www.aimarketingsite.com/en/agents/seo-article-agent")
    },
  )
})

test("localized prompt pages emit locale-prefixed canonical and language alternates", () => {
  const page = getSeoPage("prompts", "seo-article-prompts")
  assert.ok(page)

  withAppUrlEnv(
    {
      APP_URL: "https://aimarketingsite.com",
    },
    () => {
      const metadata = metadataForSeoPage(page, "zh")

      assert.equal(metadata.alternates?.canonical, "https://www.aimarketingsite.com/zh/prompts/seo-article-prompts")
      assert.equal(metadata.alternates?.languages?.en, "https://www.aimarketingsite.com/en/prompts/seo-article-prompts")
      assert.equal(metadata.alternates?.languages?.zh, "https://www.aimarketingsite.com/zh/prompts/seo-article-prompts")
      assert.equal(metadata.alternates?.languages?.["x-default"], "https://www.aimarketingsite.com/en/prompts/seo-article-prompts")
    },
  )
})

test("localized tool pages emit locale-prefixed canonical and language alternates", () => {
  withAppUrlEnv(
    {
      APP_URL: "https://aimarketingsite.com",
    },
    () => {
      const hubMetadata = getToolsHubMetadata("zh")
      const toolMetadata = getLeadToolMetadata("zh", "ai-ppt-preview")
      const exampleMetadata = getLeadToolExampleMetadata("zh", "ai-ppt-preview", "product-launch-deck")

      assert.equal(hubMetadata.alternates?.canonical, "https://www.aimarketingsite.com/zh/tools")
      assert.equal(hubMetadata.alternates?.languages?.en, "https://www.aimarketingsite.com/en/tools")
      assert.equal(toolMetadata.alternates?.canonical, "https://www.aimarketingsite.com/zh/tools/ai-ppt-preview")
      assert.equal(toolMetadata.alternates?.languages?.en, "https://www.aimarketingsite.com/en/tools/ai-ppt-preview")
      assert.equal(
        exampleMetadata.alternates?.canonical,
        "https://www.aimarketingsite.com/zh/tools/ai-ppt-preview/examples/product-launch-deck",
      )
      assert.equal(
        exampleMetadata.alternates?.languages?.en,
        "https://www.aimarketingsite.com/en/tools/ai-ppt-preview/examples/product-launch-deck",
      )
    },
  )
})

test("robots and sitemap share the same www canonical host", () => {
  withAppUrlEnv(
    {
      APP_URL: "https://aimarketingsite.com",
    },
    () => {
      const robotsMetadata = robots()
      const sitemapEntries = sitemap()
      const promptEntry = sitemapEntries.find((entry) => entry.url.endsWith("/en/prompts/video-script-prompts"))
      const localizedCostEntries = sitemapEntries.filter((entry) => /\/(en|zh)\/compare\/compare-ai-tool-costs$/.test(entry.url))
      const localizedAlternativeEntries = sitemapEntries.filter((entry) => /\/(en|zh)\/alternatives\/chatgpt-team-alternative$/.test(entry.url))
      const localizedAgentEntries = sitemapEntries.filter((entry) => /\/(en|zh)\/agents\/seo-article-agent$/.test(entry.url))
      const localizedPlatformAgentEntries = sitemapEntries.filter((entry) => /\/(en|zh)\/agents\/brand-strategy-agent$/.test(entry.url))
      const localizedCapabilityEntries = sitemapEntries.filter((entry) => /\/(en|zh)\/capabilities\/ai-image$/.test(entry.url))
      const localizedPluginEntries = sitemapEntries.filter((entry) => /\/(en|zh)\/plugins\/runninghub-media$/.test(entry.url))
      const localizedMcpEntries = sitemapEntries.filter((entry) => /\/(en|zh)\/mcp-services\/document-parsing-mcp$/.test(entry.url))
      const localizedWorkflowEntries = sitemapEntries.filter((entry) => /\/(en|zh)\/workflows\/campaign-launch$/.test(entry.url))
      const localizedPromptEntries = sitemapEntries.filter((entry) => /\/(en|zh)\/prompts\/seo-article-prompts$/.test(entry.url))
      const toolEntries = sitemapEntries.filter((entry) => /\/(en|zh)\/tools\/(ai-chat|ai-image|ai-video|ai-ppt-preview)$/.test(entry.url))
      const toolExampleEntries = sitemapEntries.filter((entry) => /\/(en|zh)\/tools\/ai-ppt-preview\/examples\/product-launch-deck$/.test(entry.url))
      const toolsHubEntries = sitemapEntries.filter((entry) => /\/(en|zh)\/tools$/.test(entry.url))

      assert.equal(robotsMetadata.sitemap, "https://www.aimarketingsite.com/sitemap.xml")
      assert.equal(promptEntry?.url, "https://www.aimarketingsite.com/en/prompts/video-script-prompts")
      assert.equal(localizedCostEntries.length, 2)
      assert.equal(localizedAlternativeEntries.length, 2)
      assert.equal(localizedAgentEntries.length, 2)
      assert.equal(localizedPlatformAgentEntries.length, 2)
      assert.equal(localizedCapabilityEntries.length, 2)
      assert.equal(localizedPluginEntries.length, 2)
      assert.equal(localizedMcpEntries.length, 2)
      assert.equal(localizedWorkflowEntries.length, 2)
      assert.equal(localizedPromptEntries.length, 2)
      assert.equal(toolsHubEntries.length, 2)
      assert.equal(toolEntries.length, 8)
      assert.equal(toolExampleEntries.length, 2)
    },
  )
})
