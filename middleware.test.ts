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
