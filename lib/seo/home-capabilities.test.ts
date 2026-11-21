import assert from "node:assert/strict"
import test from "node:test"
import React from "react"

import { renderHomePage } from "./localized-public-pages"
import type { PublicHomeCapability } from "./home-capabilities"

// tsx uses the classic JSX runtime for this project's jsx: preserve setting.
test.before(() => Object.assign(globalThis, { React }))

test("both homepages serialize only public capability content and preserve entry links", async () => {
  for (const locale of ["en", "zh"] as const) {
    const page = await renderHomePage(locale)
    const capabilities: PublicHomeCapability[] = page.props.platformCapabilities

    assert.equal(
      /existing_runtime|entitlement|accessModel|binding|provider|defaultConfig|proofPoints|ppt-master|运行时|路由/i.test(JSON.stringify(page.props)),
      false,
      `${locale} homepage props must not serialize internal registry content`,
    )
    assert.deepEqual(capabilities.map((item) => item.slug), ["ai-chat", "ai-ppt", "ai-image", "ai-video"])
    assert.deepEqual(capabilities.map((item) => item.publicHref), [
      "/tools/ai-chat", "/tools/ai-ppt-preview", "/tools/ai-image", "/tools/ai-video",
    ])
    for (const item of capabilities) {
      assert.deepEqual(Object.keys(item).sort(), ["capabilityKind", "publicHref", "slug", "summary", "title"])
      assert.ok(item.title && item.summary && item.capabilityKind)
    }
    assert.equal(/[\u4e00-\u9fff]/u.test(capabilities[0].summary), locale === "zh")
  }
})
