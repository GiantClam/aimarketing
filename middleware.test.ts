import assert from "node:assert/strict"
import test from "node:test"
import { NextRequest } from "next/server"

import { middleware } from "./middleware"

test("preserves AI agent query parameters through the login redirect", () => {
  const response = middleware(
    new NextRequest("https://www.aimarketingsite.com/dashboard/ai/479?agent=executive-ppt&entry=chat"),
  )

  assert.equal(response.status, 307)
  assert.equal(
    response.headers.get("location"),
    "https://www.aimarketingsite.com/login?next=%2Fdashboard%2Fai%2F479%3Fagent%3Dexecutive-ppt%26entry%3Dchat",
  )
})

test("does not discard a requested dashboard target when a stale session reaches login", () => {
  const response = middleware(
    new NextRequest("https://www.aimarketingsite.com/login?next=%2Fdashboard%2Fworkflows%2F17", {
      headers: {
        cookie: "aimarketing_session=stale-invalid-token",
      },
    }),
  )

  assert.equal(response.status, 200)
  assert.equal(response.headers.get("location"), null)
})

test("canonicalizes the bare production host and root in one permanent redirect", () => {
  const response = middleware(new NextRequest("https://aimarketingsite.com/?utm_source=search"))

  assert.equal(response.status, 301)
  assert.equal(response.headers.get("location"), "https://www.aimarketingsite.com/en?utm_source=search")
})

test("root always uses the English x-default entry even with a Chinese locale cookie", () => {
  const response = middleware(
    new NextRequest("https://www.aimarketingsite.com/", {
      headers: { cookie: "aimarketing_locale=zh" },
    }),
  )

  assert.equal(response.status, 301)
  assert.equal(response.headers.get("location"), "https://www.aimarketingsite.com/en")
})

test("localizes an unprefixed public path once and preserves its query string", () => {
  const response = middleware(
    new NextRequest("https://www.aimarketingsite.com/pricing?plan=creator", {
      headers: { cookie: "aimarketing_locale=zh" },
    }),
  )

  assert.equal(response.status, 301)
  assert.equal(response.headers.get("location"), "https://www.aimarketingsite.com/zh/pricing?plan=creator")
})

test("explicit locale paths do not redirect or change language because of a cookie", () => {
  const response = middleware(
    new NextRequest("https://www.aimarketingsite.com/en/pricing", {
      headers: { cookie: "aimarketing_locale=zh" },
    }),
  )

  assert.equal(response.status, 200)
  assert.equal(response.headers.get("location"), null)
})
