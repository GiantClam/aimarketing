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
      const metadata = metadataForSeoPage(page)

      assert.deepEqual(metadata.title, {
        absolute: "Video Script Prompts | AI Marketing",
      })
      assert.equal(metadata.alternates?.canonical, "https://www.aimarketingsite.com/prompts/video-script-prompts")
      assert.equal(metadata.openGraph?.url, "https://www.aimarketingsite.com/prompts/video-script-prompts")
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
      const promptEntry = sitemapEntries.find((entry) => entry.url.endsWith("/prompts/video-script-prompts"))

      assert.equal(robotsMetadata.sitemap, "https://www.aimarketingsite.com/sitemap.xml")
      assert.equal(promptEntry?.url, "https://www.aimarketingsite.com/prompts/video-script-prompts")
    },
  )
})
