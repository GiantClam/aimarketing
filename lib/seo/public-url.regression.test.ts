import assert from "node:assert/strict"
import test from "node:test"

import robots from "@/app/robots"
import sitemap from "@/app/sitemap"
import { buildAppUrl, getAppBaseUrl } from "@/lib/app-url"
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
      const localizedPromptEntries = sitemapEntries.filter((entry) => /\/(en|zh)\/prompts\/seo-article-prompts$/.test(entry.url))

      assert.equal(robotsMetadata.sitemap, "https://www.aimarketingsite.com/sitemap.xml")
      assert.equal(promptEntry?.url, "https://www.aimarketingsite.com/en/prompts/video-script-prompts")
      assert.equal(localizedCostEntries.length, 2)
      assert.equal(localizedAlternativeEntries.length, 2)
      assert.equal(localizedAgentEntries.length, 2)
      assert.equal(localizedPromptEntries.length, 2)
    },
  )
})
